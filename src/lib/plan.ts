import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { categories, expenses } from '@/db/schema';
import { sumToMinor } from './money';
import { getTotal } from './analytics';
import { getFunds, requiredSavingsMinor, type Fund } from './funds';
import { getRecurringCharges, splitCommitted, type CommittedSplit } from './recurring';
import { daysBetween, monthRange, shiftMonth, todayISO } from './dates';

/**
 * THE MONTH, AS A PLAN RATHER THAN A RECEIPT
 * ------------------------------------------
 * Everything else in this app reports the past. "You have spent ₹15,142" is a
 * fact you can do nothing about. This module answers the only question that
 * changes behaviour at the counter:
 *
 *     how much can I spend today without wrecking anything?
 *
 * The arithmetic is deliberately plain, because a number nobody can reproduce
 * in their head is a number nobody trusts:
 *
 *     income
 *   − everything already out (spending + contributions)
 *   − recurring charges still to land this month
 *   − what the funds still need this month
 *   = free
 *
 *     free ÷ days remaining = safe to spend, per day
 *
 * It needs income to mean anything, and most accounts will not have any at
 * first, so `hasIncome` says so plainly rather than dividing by zero and
 * printing a confident ₹0.
 *
 * INCOME THAT HAS NOT ARRIVED YET
 * Pay is not the same every month and does not always land on the 1st. Using
 * only what has been logged so far would make safe-to-spend useless for
 * whoever is paid on the 28th — ₹0 income all month, then a number on the last
 * day. So until this month's pay is recorded, the median of the last three
 * months stands in, flagged as an estimate. Median rather than mean because
 * one freelance month should not reset the baseline. The moment real income is
 * logged it takes over completely.
 */

export type MonthlyPlan = {
  month: string;
  isCurrentMonth: boolean;
  daysLeft: number;
  daysInMonth: number;

  hasIncome: boolean;
  /** Actually recorded this month. Zero until pay lands. */
  incomeMinor: number;
  /** What the plan is working from: the real figure, or the estimate below. */
  expectedIncomeMinor: number;
  /** True when no income has been logged yet and the estimate is standing in. */
  usingEstimate: boolean;
  previousIncomeMinor: number;

  spentMinor: number;
  investedMinor: number;

  committed: CommittedSplit;

  /** Income less everything that left. Investing counts as kept, not spent. */
  netMinor: number;
  /** (income − spending) ÷ income. Null without income to divide by. */
  savingsRatePct: number | null;

  /*
   * THE TALLY — what the month actually came to.
   *
   * Everything above is either a report of the past or a forecast. None of it
   * answers the question people actually open a money app to ask: how much did
   * I keep this month? These three add up, and they add up against money that
   * genuinely arrived — never the estimate, because a tally of money you have
   * not been paid yet is not a tally.
   *
   *     came in − spent = saved
   *     saved = invested + still in hand
   */
  tally: {
    /** True once real income exists to reconcile against. */
    known: boolean;
    inMinor: number;
    outMinor: number;
    /** in − out. Negative means the month ate into what was already there. */
    savedMinor: number;
    /** The part of it already moved somewhere deliberate. */
    investedMinor: number;
    /** The rest — still sitting in the account. */
    inHandMinor: number;
    /** saved ÷ in, as a percentage. Null when there is nothing to divide by. */
    ratePct: number | null;
  };

  savingsTargetMinor: number;
  freeMinor: number;
  perDayMinor: number;
  /** True when the plan is already blown — free money has gone negative. */
  overspent: boolean;
  /**
   * WHY it is blown, which is not a detail.
   *
   * Two ambitious goals can drive free money negative in a month where ₹4,000
   * was spent against ₹50,000 of income. Captioning that "over budget" next to
   * a card reading "saved ₹46,000" makes the app contradict itself and the
   * user distrust both figures. So the plan says which it is:
   *
   *   'spending' — money genuinely went out faster than it came in
   *   'goals'    — spending is fine; the targets ask for more than is left
   */
  shortfall: 'none' | 'spending' | 'goals';
  /** What would be free if the goals were not asking for anything. */
  freeBeforeGoalsMinor: number;

  funds: Fund[];
};

export async function getMonthlyPlan(userId: string, month: string): Promise<MonthlyPlan> {
  const { start, end } = monthRange(month);
  const today = todayISO();
  const isCurrentMonth = month === today.slice(0, 7);

  const daysInMonth = daysBetween(start, end);
  // Today still counts: money can be spent between now and midnight.
  const daysLeft = isCurrentMonth ? Math.max(1, daysBetween(today, end)) : 0;

  const prev = monthRange(shiftMonth(month, -1));

  const [spent, invested, income, history, charges, funds] = await Promise.all([
    getTotal({ userId, start, end }),
    getTotal({ userId, start, end, include: 'investment' }),
    getTotal({ userId, start, end, include: 'income' }),
    recentIncome(userId, month, 3),
    getRecurringCharges(userId, month),
    getFunds(userId, month),
  ]);

  const previousIncomeMinor = history[0] ?? 0;
  const usingEstimate = income.totalMinor === 0 && history.length > 0;
  const expectedIncomeMinor = usingEstimate ? median(history) : income.totalMinor;

  const committed = splitCommitted(charges, spent.totalMinor);
  const hasIncome = expectedIncomeMinor > 0;

  /*
   * Funds already fed this month do not need feeding twice. Netting the
   * contributions off the target is what stops safe-to-spend from collapsing
   * the day after a SIP goes out.
   */
  const savingsTargetMinor = Math.max(0, requiredSavingsMinor(funds) - invested.totalMinor);

  const outAlready = spent.totalMinor + invested.totalMinor;
  const freeBeforeGoalsMinor = hasIncome ? expectedIncomeMinor - outAlready - committed.committedDueMinor : 0;
  const freeMinor = hasIncome ? freeBeforeGoalsMinor - savingsTargetMinor : 0;

  return {
    month,
    isCurrentMonth,
    daysLeft,
    daysInMonth,

    hasIncome,
    incomeMinor: income.totalMinor,
    expectedIncomeMinor,
    usingEstimate,
    previousIncomeMinor,

    spentMinor: spent.totalMinor,
    investedMinor: invested.totalMinor,

    committed,

    netMinor: expectedIncomeMinor - spent.totalMinor,

    tally: buildTally(income.totalMinor, spent.totalMinor, invested.totalMinor),

    /* Against real income only. A savings rate computed from an estimate is a
       guess about a guess, and this one gets quoted as a fact. */
    savingsRatePct:
      income.totalMinor > 0 ? ((income.totalMinor - spent.totalMinor) / income.totalMinor) * 100 : null,

    savingsTargetMinor,
    freeMinor,
    perDayMinor: isCurrentMonth && daysLeft > 0 ? Math.floor(Math.max(0, freeMinor) / daysLeft) : 0,
    overspent: hasIncome && freeMinor < 0,
    shortfall:
      !hasIncome || freeMinor >= 0 ? 'none' : freeBeforeGoalsMinor >= 0 ? 'goals' : 'spending',
    freeBeforeGoalsMinor,

    funds,
  };
}

export type Sweep = {
  /** The month being compared, e.g. the one that just ended. */
  month: string;
  previousMonth: string;
  spentMinor: number;
  previousSpentMinor: number;
  /** How much less was spent. Zero when the month was not cheaper. */
  savedMinor: number;
};

/**
 * The underspend, offered back.
 *
 * Spending less than last month is invisible: nothing arrives, no total goes
 * up, and by the 5th it is indistinguishable from an ordinary month. This
 * turns it into an object — the difference, ready to be moved into a fund on
 * one tap, where it becomes a bike getting closer instead of a number that
 * quietly evaporated.
 *
 * Compares the two months BEFORE the current one, so it is only ever offered
 * on a month that has finished and cannot change underneath it.
 */
export async function getSweep(userId: string, month: string): Promise<Sweep> {
  const lastMonth = shiftMonth(month, -1);
  const monthBefore = shiftMonth(month, -2);

  const [a, b] = await Promise.all([
    getTotal({ userId, ...monthRange(lastMonth) }),
    getTotal({ userId, ...monthRange(monthBefore) }),
  ]);

  return {
    month: lastMonth,
    previousMonth: monthBefore,
    spentMinor: a.totalMinor,
    previousSpentMinor: b.totalMinor,
    savedMinor: Math.max(0, b.totalMinor - a.totalMinor),
  };
}

/**
 * The month reconciled against money that actually arrived.
 *
 * Deliberately built from `incomeMinor` and not `expectedIncomeMinor`: the
 * estimate is there so safe-to-spend works before payday, and quietly folding
 * it into a figure captioned "saved" would report money nobody has been paid.
 */
function buildTally(inMinor: number, spentMinor: number, investedMinor: number): MonthlyPlan['tally'] {
  const savedMinor = inMinor - spentMinor;
  return {
    known: inMinor > 0,
    inMinor,
    outMinor: spentMinor,
    savedMinor,
    investedMinor,
    // Investing more than you earned this month is possible — the money came
    // from somewhere else — and must not draw a negative "in hand".
    inHandMinor: savedMinor - investedMinor,
    ratePct: inMinor > 0 ? (savedMinor / inMinor) * 100 : null,
  };
}

/** Income for each of the N months before `month`, newest first, zeros dropped. */
async function recentIncome(userId: string, month: string, count: number): Promise<number[]> {
  const months = Array.from({ length: count }, (_, i) => monthRange(shiftMonth(month, -(i + 1))));
  const totals = await Promise.all(
    months.map((m) => getTotal({ userId, start: m.start, end: m.end, include: 'income' })),
  );
  return totals.map((t) => t.totalMinor).filter((v) => v > 0);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export type SavedMonth = {
  month: string;
  inMinor: number;
  outMinor: number;
  investedMinor: number;
  savedMinor: number;
  /** Null in a month with no income to divide by. */
  ratePct: number | null;
};

/**
 * SAVING, AS A HABIT RATHER THAN A MONTH.
 *
 * One month's tally answers "how did this month go". It cannot answer the
 * question underneath it — am I getting better at this? — and a savings rate
 * seen once a month, alone, is the easiest number in personal finance to
 * rationalise. Six of them in a row is not.
 *
 * Months with no income are returned as they are rather than skipped: a gap in
 * the record is itself worth seeing, and quietly dropping them would flatter
 * the average.
 */
export async function getSavingsHistory(userId: string, months: number): Promise<SavedMonth[]> {
  const from = monthRange(shiftMonth(todayISO().slice(0, 7), -(months - 1))).start;

  /*
   * A plain join, not the EXISTS subqueries used elsewhere: those exist to
   * avoid multiplying rows across the people join, and there is no people
   * join here. Every expense has exactly one category, so this cannot fan out.
   */
  const rows = await db
    .select({
      month: sql<string>`to_char(${expenses.expenseDate}, 'YYYY-MM')`,
      income: sql<string>`COALESCE(SUM(${expenses.amountMinor}) FILTER (WHERE ${categories.kind} = 'income'), 0)`,
      spent: sql<string>`COALESCE(SUM(${expenses.amountMinor}) FILTER (WHERE ${categories.kind} NOT IN ('income', 'investment')), 0)`,
      invested: sql<string>`COALESCE(SUM(${expenses.amountMinor}) FILTER (WHERE ${categories.kind} = 'investment'), 0)`,
    })
    .from(expenses)
    .innerJoin(categories, sql`${categories.id} = ${expenses.categoryId}`)
    .where(
      sql`${expenses.userId} = ${userId} AND ${expenses.deletedAt} IS NULL AND ${expenses.expenseDate} >= ${from}`,
    )
    .groupBy(sql`to_char(${expenses.expenseDate}, 'YYYY-MM')`)
    .orderBy(sql`to_char(${expenses.expenseDate}, 'YYYY-MM')`);

  return rows.map((r) => {
    const inMinor = sumToMinor(r.income);
    const outMinor = sumToMinor(r.spent);
    const savedMinor = inMinor - outMinor;
    return {
      month: r.month,
      inMinor,
      outMinor,
      investedMinor: sumToMinor(r.invested),
      savedMinor,
      ratePct: inMinor > 0 ? (savedMinor / inMinor) * 100 : null,
    };
  });
}
