import { and, eq, gte, isNull, lt, sql } from 'drizzle-orm';
import { db } from '@/db';
import { categories, expenses } from '@/db/schema';
import { sumToMinor } from './money';
import { monthRange, shiftMonth } from './dates';

/**
 * WHAT WAS ALREADY DECIDED
 * ------------------------
 * Rent, wifi, the gym, the SIP. None of it was a choice you made this month —
 * it was a choice you made once, and this month merely paid for it.
 *
 * Splitting the month along that line is the most clarifying cut in personal
 * finance, and it is the one every expense app leaves out. Trimming 10% off
 * ₹15,142 sounds impossible; trimming 10% off the ₹12,853 you actually chose
 * is a normal week. It also fixes "safe to spend", because money already
 * committed was never available in the first place.
 *
 * Nothing is declared by the user. A charge is committed if it has turned up
 * in at least two of the last six months, which is a fact the ledger already
 * knows.
 */

/** How many of the last six months a charge must appear in to count as committed. */
const MONTHS_REQUIRED = 2;
const LOOKBACK_MONTHS = 6;

/**
 * A bill lands once a month at about the same price. A habit lands whenever
 * and costs whatever.
 *
 * Without this, "chai" — twice in June, once in May, ₹220 to ₹260 — was being
 * called committed and quietly subtracted from safe-to-spend. It is a habit:
 * you can skip it, which is the whole difference. Two conditions separate
 * them, and both come from the data rather than from asking:
 *
 *   once a month     occurrences === distinct months it appeared in
 *   steady price     the dearest is no more than 1.3x the cheapest
 */
/* Expressed as a ratio of integers: a float parameter against an integer
   column is rejected by Postgres, and bigint keeps a large expense from
   overflowing int4 on the way through the comparison. */
const PRICE_TOLERANCE_NUM = 13;
const PRICE_TOLERANCE_DEN = 10;

export type RecurringCharge = {
  categoryId: string;
  categoryName: string;
  icon: string;
  color: string;
  kind: string;
  /** The note it recurs under, or '' when it is recognised by amount alone. */
  label: string;
  /** What it usually costs, in paise. */
  typicalMinor: number;
  /** The day of the month it usually lands on. */
  typicalDay: number;
  monthsSeen: number;
  lastSeen: string;
  /** This month's occurrence, if it has happened yet. */
  paidMinor: number | null;
  paidDate: string | null;
};

/**
 * Charges that repeat, and whether each has landed yet this month.
 *
 * Two ways of recognising one, because people label some things and not
 * others: by note ("wifi", "Gym", "SIP") where there is one, and by an exact
 * repeating amount where there is not — a ₹599 recharge logged bare every
 * month is just as committed as one with a label on it.
 */
export async function getRecurringCharges(userId: string, month: string): Promise<RecurringCharge[]> {
  const { start, end } = monthRange(month);
  const from = monthRange(shiftMonth(month, -LOOKBACK_MONTHS)).start;

  const live = and(eq(expenses.userId, userId), isNull(expenses.deletedAt));
  // History stops at this month: a charge is recurring because of its past,
  // not because it happened once, today.
  const history = and(live, gte(expenses.expenseDate, from), lt(expenses.expenseDate, start));

  const labelled = sql<string>`LOWER(BTRIM(COALESCE(${expenses.note}, '')))`;
  const monthKey = sql`to_char(${expenses.expenseDate}, 'YYYY-MM')`;

  const [byNote, byAmount] = await Promise.all([
    db
      .select({
        categoryId: categories.id,
        categoryName: categories.name,
        icon: categories.icon,
        color: categories.color,
        kind: categories.kind,
        label: labelled,
        typical: sql<string>`ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${expenses.amountMinor}))`,
        day: sql<string>`ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(DAY FROM ${expenses.expenseDate})))`,
        months: sql<string>`COUNT(DISTINCT ${monthKey})`,
        last: sql<string>`MAX(${expenses.expenseDate})`,
      })
      .from(expenses)
      .innerJoin(categories, eq(categories.id, expenses.categoryId))
      .where(and(history, sql`BTRIM(COALESCE(${expenses.note}, '')) <> ''`))
      .groupBy(categories.id, categories.name, categories.icon, categories.color, categories.kind, labelled)
      .having(
        sql`COUNT(DISTINCT ${monthKey}) >= ${MONTHS_REQUIRED}
            AND COUNT(*) = COUNT(DISTINCT ${monthKey})
            AND MAX(${expenses.amountMinor})::bigint * ${PRICE_TOLERANCE_DEN}
                <= MIN(${expenses.amountMinor})::bigint * ${PRICE_TOLERANCE_NUM}`,
      ),

    db
      .select({
        categoryId: categories.id,
        categoryName: categories.name,
        icon: categories.icon,
        color: categories.color,
        kind: categories.kind,
        amountMinor: expenses.amountMinor,
        day: sql<string>`ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(DAY FROM ${expenses.expenseDate})))`,
        months: sql<string>`COUNT(DISTINCT ${monthKey})`,
        last: sql<string>`MAX(${expenses.expenseDate})`,
      })
      .from(expenses)
      .innerJoin(categories, eq(categories.id, expenses.categoryId))
      .where(and(history, sql`BTRIM(COALESCE(${expenses.note}, '')) = ''`))
      .groupBy(categories.id, categories.name, categories.icon, categories.color, categories.kind, expenses.amountMinor)
      /* Grouped by exact amount already, so only the cadence needs checking. */
      .having(sql`COUNT(DISTINCT ${monthKey}) >= ${MONTHS_REQUIRED} AND COUNT(*) = COUNT(DISTINCT ${monthKey})`),
  ]);

  const charges: RecurringCharge[] = [
    ...byNote.map((r) => ({
      categoryId: r.categoryId,
      categoryName: r.categoryName,
      icon: r.icon,
      color: r.color,
      kind: r.kind,
      label: r.label,
      typicalMinor: Math.round(Number(r.typical)),
      typicalDay: Number(r.day),
      monthsSeen: Number(r.months),
      lastSeen: r.last,
      paidMinor: null as number | null,
      paidDate: null as string | null,
    })),
    ...byAmount.map((r) => ({
      categoryId: r.categoryId,
      categoryName: r.categoryName,
      icon: r.icon,
      color: r.color,
      kind: r.kind,
      label: '',
      typicalMinor: r.amountMinor,
      typicalDay: Number(r.day),
      monthsSeen: Number(r.months),
      lastSeen: r.last,
      paidMinor: null as number | null,
      paidDate: null as string | null,
    })),
  ];

  if (!charges.length) return [];

  // Now mark the ones already paid this month.
  const thisMonth = await db
    .select({
      categoryId: expenses.categoryId,
      label: labelled,
      amountMinor: expenses.amountMinor,
      date: expenses.expenseDate,
    })
    .from(expenses)
    .where(and(live, gte(expenses.expenseDate, start), sql`${expenses.expenseDate} <= ${end}`));

  for (const charge of charges) {
    const hit = thisMonth.find((e) =>
      charge.label
        ? e.categoryId === charge.categoryId && e.label === charge.label
        : e.categoryId === charge.categoryId && e.amountMinor === charge.typicalMinor,
    );
    if (hit) {
      charge.paidMinor = hit.amountMinor;
      charge.paidDate = hit.date;
    }
  }

  return charges.sort((a, b) => b.typicalMinor - a.typicalMinor);
}

export type CommittedSplit = {
  /** Recurring spending that has already gone out this month. */
  committedPaidMinor: number;
  /** Recurring spending still expected before the month ends. */
  committedDueMinor: number;
  /** Everything else that went out — the part that was actually chosen. */
  discretionaryMinor: number;
  /** Recurring contributions to investments and funds, kept separate. */
  committedInvestingMinor: number;
  charges: RecurringCharge[];
  /** Charges that have not landed yet, soonest first. */
  upcoming: RecurringCharge[];
};

/**
 * The month split into what was already decided and what was not.
 *
 * `spentMinor` is passed in rather than re-queried so this can never disagree
 * with the total the rest of the screen is showing — discretionary is defined
 * as the remainder, so the two halves always add back to it exactly.
 */
export function splitCommitted(charges: RecurringCharge[], spentMinor: number): CommittedSplit {
  const spending = charges.filter((c) => c.kind !== 'investment' && c.kind !== 'income');
  const investing = charges.filter((c) => c.kind === 'investment');

  const committedPaidMinor = spending.reduce((s, c) => s + (c.paidMinor ?? 0), 0);
  const committedDueMinor = spending.filter((c) => c.paidMinor === null).reduce((s, c) => s + c.typicalMinor, 0);
  const committedInvestingMinor = investing.reduce((s, c) => s + (c.paidMinor ?? c.typicalMinor), 0);

  return {
    committedPaidMinor,
    committedDueMinor,
    discretionaryMinor: Math.max(0, spentMinor - committedPaidMinor),
    committedInvestingMinor,
    charges,
    upcoming: spending
      .filter((c) => c.paidMinor === null)
      .sort((a, b) => a.typicalDay - b.typicalDay),
  };
}
