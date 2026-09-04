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

  savingsTargetMinor: number;
  freeMinor: number;
  perDayMinor: number;
  /** True when the plan is already blown — free money has gone negative. */
  overspent: boolean;

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
  const freeMinor = hasIncome
    ? expectedIncomeMinor - outAlready - committed.committedDueMinor - savingsTargetMinor
    : 0;

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
    /* Against real income only. A savings rate computed from an estimate is a
       guess about a guess, and this one gets quoted as a fact. */
    savingsRatePct:
      income.totalMinor > 0 ? ((income.totalMinor - spent.totalMinor) / income.totalMinor) * 100 : null,

    savingsTargetMinor,
    freeMinor,
    perDayMinor: isCurrentMonth && daysLeft > 0 ? Math.floor(Math.max(0, freeMinor) / daysLeft) : 0,
    overspent: hasIncome && freeMinor < 0,

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
