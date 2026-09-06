import { and, eq, gte, lte, isNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import { expenses, categories, ledgerEntries } from '@/db/schema';
import { kindPredicate } from './analytics';
import { sumToMinor } from './money';
import { daysBetween, monthRange, shiftMonth, todayISO } from './dates';

/**
 * DERIVED FLOW ANALYTICS
 * ----------------------
 * Everything in here is computed from the same `expenses` rows the rest of the
 * app reads — nothing is stored, nothing is a second source of truth. The
 * point is to answer questions the raw month total cannot:
 *
 *   Am I ahead or behind where I was this time last month?
 *   Which categories are heating up, and which cooled off?
 *   Is the money leaving in a few big hits or a hundred small ones?
 *   Which days of the week actually cost me?
 *
 * Every figure stays in integer paise, and the person dimension is deliberately
 * absent here: person totals can exceed the grand total by design, so mixing
 * them into flow arithmetic would be exactly the double-count the schema
 * exists to prevent.
 *
 * Investment categories are excluded throughout, for the same reason lending
 * is: money into a SIP left the account but not your net worth. See the note
 * at the top of analytics.ts.
 */

/** Anything at or below this is a "small ticket" — the thousand-cuts bucket. */
export const SMALL_TICKET_MINOR = 20_000; // ₹200, the cold-start fallback

/** Months a category must have existed for before momentum will judge it. */
const MOMENTUM_MIN_MONTHS = 2;

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export type FlowCumulativePoint = {
  day: number;
  date: string;
  /** Running total for the selected month, up to and including `day`. */
  thisMinor: number;
  /** Running total for the previous month at the same day-of-month. */
  prevMinor: number;
};

export type FlowMomentum = {
  categoryId: string;
  name: string;
  icon: string;
  color: string;
  thisMinor: number;
  /**
   * What this category usually costs by this point in a month — the mean of
   * the months it actually existed for, pro-rated to the elapsed fraction of
   * the current month so a part-month is never held against a full one.
   */
  baselineMinor: number;
  /** How many of the three prior months the category was alive for. */
  eligibleMonths: number;
  deltaMinor: number;
  deltaPct: number | null;
  /** True when there is not enough history to judge it. No delta is offered. */
  isNew: boolean;
};

export type Flow = {
  month: string;
  isCurrentMonth: boolean;

  pace: {
    elapsedDays: number;
    monthDays: number;
    spentMinor: number;
    /** Of that, what has actually happened. Differs only if you date forward. */
    spentToDateMinor: number;
    /** Previous month's total at the same day-of-month — the honest comparison. */
    prevSameDayMinor: number;
    prevFullMinor: number;
    perDayMinor: number;
    projectedMinor: number;
    /** Spend vs the previous month at this point, as a percentage. */
    deltaPct: number | null;
  };

  cumulative: FlowCumulativePoint[];

  weekday: {
    dow: number;
    label: string;
    totalMinor: number;
    count: number;
    /** How many of that weekday have occurred in the window. The denominator. */
    occurredDays: number;
    /** How many of them saw any spending. Context, not the denominator. */
    spentDays: number;
    avgMinor: number;
  }[];

  tickets: {
    count: number;
    medianMinor: number;
    averageMinor: number;
    largest: { amountMinor: number; date: string; note: string | null; categoryName: string } | null;
    smallThresholdMinor: number;
    smallCount: number;
    smallTotalMinor: number;
  };

  concentration: {
    activeCategories: number;
    topShare: number;
    top3Share: number;
    /** 0 = spread evenly across categories, 1 = everything in one. */
    herfindahl: number;
  };

  momentum: FlowMomentum[];

  cadence: {
    spendDays: number;
    quietDays: number;
    longestQuietRun: number;
    longestSpendRun: number;
    busiest: { date: string; totalMinor: number } | null;
  };

  halves: { firstMinor: number; secondMinor: number };

  ledger: { lentMinor: number; borrowedMinor: number; netMinor: number; entryCount: number };

  repeats: { label: string; categoryName: string; count: number; totalMinor: number }[];
};

/** Live, undeleted, non-investment expenses for one user inside a date window. */
function inWindow(userId: string, start: string, end: string) {
  return and(
    eq(expenses.userId, userId),
    isNull(expenses.deletedAt),
    gte(expenses.expenseDate, start),
    lte(expenses.expenseDate, end),
    kindPredicate('spending'),
  );
}

export async function getFlow(userId: string, month: string): Promise<Flow> {
  const { start, end } = monthRange(month);
  const prevMonth = shiftMonth(month, -1);
  const prev = monthRange(prevMonth);
  const today = todayISO();
  const isCurrentMonth = month === today.slice(0, 7);

  const monthDays = daysBetween(start, end);
  // A past month is fully elapsed; the current one only as far as today.
  const elapsedDays = isCurrentMonth ? Math.min(daysBetween(start, today), monthDays) : monthDays;

  const smallThresholdMinor = await smallTicketThreshold(userId, end);

  const [thisDaily, prevDaily, weekdayRows, ticketRow, largestRow, catRows, baselineRows, ledgerRow, repeatRows] =
    await Promise.all([
      dailyTotals(userId, start, end),
      dailyTotals(userId, prev.start, prev.end),
      weekdayTotals(userId, start, end),
      ticketStats(userId, start, end, smallThresholdMinor),
      largestExpense(userId, start, end),
      categoryTotals(userId, start, end),
      // Three months of history, ending the month before this one.
      categoryTotals(userId, monthRange(shiftMonth(month, -3)).start, prev.end),
      ledgerFlow(userId, start, end),
      repeatedNotes(userId, start, end),
    ]);

  const existsFrom = await categoryExistsFrom(userId);

  const byDayThis = new Map(thisDaily.map((d) => [Number(d.date.slice(8, 10)), d.totalMinor]));
  const byDayPrev = new Map(prevDaily.map((d) => [Number(d.date.slice(8, 10)), d.totalMinor]));

  /*
   * The cumulative curve runs to the end of the month for a past month, but
   * only to today for the current one — drawing a flat line from today to the
   * 31st would read as "I stopped spending", not "it hasn't happened yet".
   */
  const lastDay = isCurrentMonth ? elapsedDays : monthDays;
  /** How many Mondays, Tuesdays… have actually happened in the window so far. */
  const weekdayOccurrences = new Map<number, number>();
  const cumulative: FlowCumulativePoint[] = [];
  let runThis = 0;
  let runPrev = 0;
  for (let day = 1; day <= lastDay; day++) {
    const dow = new Date(`${start.slice(0, 8)}${String(day).padStart(2, '0')}T00:00:00Z`).getUTCDay();
    weekdayOccurrences.set(dow, (weekdayOccurrences.get(dow) ?? 0) + 1);
    runThis += byDayThis.get(day) ?? 0;
    runPrev += byDayPrev.get(day) ?? 0;
    cumulative.push({
      day,
      date: `${start.slice(0, 8)}${String(day).padStart(2, '0')}`,
      thisMinor: runThis,
      prevMinor: runPrev,
    });
  }

  const spentMinor = thisDaily.reduce((s, d) => s + d.totalMinor, 0);
  /*
   * Nothing stops a transaction being dated in the future, and one that is
   * must not be divided by the days that have actually elapsed — ₹900 logged
   * for the 20th, on the 6th, would report a daily rate that includes money
   * not yet spent, and project the month from it.
   *
   * The total stays inclusive, because the entry is real and belongs to the
   * month. Only the RATE is restricted to what has happened.
   */
  const spentToDateMinor = isCurrentMonth
    ? thisDaily.filter((d) => d.date <= today).reduce((s, d) => s + d.totalMinor, 0)
    : spentMinor;
  const prevFullMinor = prevDaily.reduce((s, d) => s + d.totalMinor, 0);
  const prevSameDayMinor = prevDaily
    .filter((d) => Number(d.date.slice(8, 10)) <= elapsedDays)
    .reduce((s, d) => s + d.totalMinor, 0);

  const perDayMinor = elapsedDays > 0 ? Math.round(spentToDateMinor / elapsedDays) : 0;

  const grand = catRows.reduce((s, c) => s + c.totalMinor, 0);
  const shares = grand > 0 ? catRows.map((c) => c.totalMinor / grand) : [];

  const baselineById = new Map(baselineRows.map((c) => [c.categoryId, c.totalMinor]));
  const seenCategories = new Set([...catRows.map((c) => c.categoryId), ...baselineRows.map((c) => c.categoryId)]);
  const metaById = new Map([...baselineRows, ...catRows].map((c) => [c.categoryId, c]));

  /*
   * MOMENTUM, WITH TWO BIASES REMOVED
   * ---------------------------------
   * The baseline is the trailing three months, averaged, and it used to be
   * divided by a flat 3 and compared against a running month-to-date figure.
   * Both halves of that were wrong, in the same direction on different cards:
   *
   *   1. A part-month against full months. On the 5th of a 30-day month, every
   *      category read as 83% "cooling down" — an artefact of the calendar,
   *      drawn as a red bar. The baseline is now pro-rated to the same fraction
   *      of a month that has actually elapsed.
   *
   *   2. Three months for a category that has not existed for three months. A
   *      five-week-old category had its one real month divided by three, so it
   *      read as "heating up" every month until its third birthday. `isNew`
   *      never caught it, because that only fires on a baseline of exactly
   *      zero. The divisor is now the months the category was actually alive.
   *
   * Below MOMENTUM_MIN_MONTHS of history there is no honest comparison to make,
   * so it reports `new` rather than a delta computed from one observation.
   */
  const baselineMonths = [1, 2, 3].map((back) => shiftMonth(month, -back));
  const elapsedFraction = isCurrentMonth && monthDays > 0 ? elapsedDays / monthDays : 1;

  const momentum: FlowMomentum[] = [...seenCategories]
    .map((id) => {
      const meta = metaById.get(id)!;
      const thisMinor = catRows.find((c) => c.categoryId === id)?.totalMinor ?? 0;

      const bornIn = existsFrom.get(id) ?? baselineMonths[baselineMonths.length - 1];
      const eligibleMonths = baselineMonths.filter((m) => m >= bornIn).length;
      const fullMonthBaseline = eligibleMonths > 0 ? (baselineById.get(id) ?? 0) / eligibleMonths : 0;
      const baselineMinor = Math.round(fullMonthBaseline * elapsedFraction);

      const tooNew = eligibleMonths < MOMENTUM_MIN_MONTHS;
      return {
        categoryId: id,
        name: meta.name,
        icon: meta.icon,
        color: meta.color,
        thisMinor,
        baselineMinor,
        eligibleMonths,
        deltaMinor: tooNew ? 0 : thisMinor - baselineMinor,
        deltaPct: tooNew || baselineMinor <= 0 ? null : ((thisMinor - baselineMinor) / baselineMinor) * 100,
        isNew: tooNew || (baselineMinor === 0 && thisMinor > 0),
      };
    })
    .filter((m) => m.thisMinor > 0 || m.baselineMinor > 0)
    .sort((a, b) => Math.abs(b.deltaMinor) - Math.abs(a.deltaMinor));

  const cadence = readCadence(byDayThis, elapsedDays, start);

  const mid = Math.ceil(monthDays / 2);
  let firstMinor = 0;
  let secondMinor = 0;
  for (const [day, minor] of byDayThis) (day <= mid ? (firstMinor += minor) : (secondMinor += minor));

  return {
    month,
    isCurrentMonth,
    pace: {
      elapsedDays,
      monthDays,
      spentMinor,
      spentToDateMinor,
      prevSameDayMinor,
      prevFullMinor,
      perDayMinor,
      // Rate × month, plus anything already dated later in the month.
      projectedMinor:
        elapsedDays > 0
          ? Math.round((spentToDateMinor / elapsedDays) * monthDays) + (spentMinor - spentToDateMinor)
          : spentMinor,
      deltaPct: prevSameDayMinor > 0 ? ((spentMinor - prevSameDayMinor) / prevSameDayMinor) * 100 : null,
    },
    cumulative,
    /*
     * `avgMinor` divides by the number of that weekday that has OCCURRED, not
     * by the number that saw spending.
     *
     * Dividing by days-with-spending answers "what does a Thursday cost, on the
     * Thursdays I spend" — but the chart is captioned "what a weekday costs",
     * and the insight built on it compares one weekday against the others. With
     * bursty spending the old denominator inflated exactly the weekday you use
     * least, which is the opposite of the truth it was claiming to tell.
     */
    weekday: WEEKDAY_LABELS.map((label, dow) => {
      const row = weekdayRows.find((w) => w.dow === dow);
      const occurred = weekdayOccurrences.get(dow) ?? 0;
      return {
        dow,
        label,
        totalMinor: row?.totalMinor ?? 0,
        count: row?.count ?? 0,
        occurredDays: occurred,
        spentDays: row?.days ?? 0,
        avgMinor: occurred > 0 ? Math.round((row?.totalMinor ?? 0) / occurred) : 0,
      };
    }),
    tickets: {
      count: ticketRow.count,
      medianMinor: ticketRow.medianMinor,
      averageMinor: ticketRow.count > 0 ? Math.round(spentMinor / ticketRow.count) : 0,
      largest: largestRow,
      smallThresholdMinor,
      smallCount: ticketRow.smallCount,
      smallTotalMinor: ticketRow.smallTotalMinor,
    },
    concentration: {
      activeCategories: catRows.length,
      topShare: shares[0] ?? 0,
      top3Share: shares.slice(0, 3).reduce((s, x) => s + x, 0),
      herfindahl: shares.reduce((s, x) => s + x * x, 0),
    },
    momentum,
    cadence,
    halves: { firstMinor, secondMinor },
    ledger: ledgerRow,
    repeats: repeatRows,
  };
}

/**
 * Spend days, quiet days and the longest run of each.
 * Only counts days that have actually happened — a current month must not be
 * reported as having 9 quiet days because it is the 22nd of a 31-day month.
 */
function readCadence(byDay: Map<number, number>, elapsedDays: number, start: string) {
  let spendDays = 0;
  let longestQuietRun = 0;
  let longestSpendRun = 0;
  let quietRun = 0;
  let spendRun = 0;

  for (let day = 1; day <= elapsedDays; day++) {
    if ((byDay.get(day) ?? 0) > 0) {
      spendDays++;
      spendRun++;
      quietRun = 0;
      longestSpendRun = Math.max(longestSpendRun, spendRun);
    } else {
      quietRun++;
      spendRun = 0;
      longestQuietRun = Math.max(longestQuietRun, quietRun);
    }
  }

  let busiest: { date: string; totalMinor: number } | null = null;
  for (const [day, minor] of byDay) {
    if (!busiest || minor > busiest.totalMinor) {
      busiest = { date: `${start.slice(0, 8)}${String(day).padStart(2, '0')}`, totalMinor: minor };
    }
  }

  return {
    spendDays,
    quietDays: Math.max(0, elapsedDays - spendDays),
    longestQuietRun,
    longestSpendRun,
    busiest,
  };
}

async function dailyTotals(userId: string, start: string, end: string) {
  const rows = await db
    .select({
      date: expenses.expenseDate,
      total: sql<string>`COALESCE(SUM(${expenses.amountMinor}), 0)`,
    })
    .from(expenses)
    .where(inWindow(userId, start, end))
    .groupBy(expenses.expenseDate);

  return rows.map((r) => ({ date: r.date, totalMinor: sumToMinor(r.total) }));
}

/**
 * Totals per weekday, plus how many distinct calendar days of that weekday
 * actually saw spending — an average over "Mondays that happened" is the
 * figure people mean when they ask what a Monday costs them.
 */
async function weekdayTotals(userId: string, start: string, end: string) {
  const rows = await db
    .select({
      dow: sql<string>`EXTRACT(DOW FROM ${expenses.expenseDate})`,
      total: sql<string>`COALESCE(SUM(${expenses.amountMinor}), 0)`,
      count: sql<string>`COUNT(*)`,
      days: sql<string>`COUNT(DISTINCT ${expenses.expenseDate})`,
    })
    .from(expenses)
    .where(inWindow(userId, start, end))
    .groupBy(sql`EXTRACT(DOW FROM ${expenses.expenseDate})`);

  return rows.map((r) => ({
    dow: Number(r.dow),
    totalMinor: sumToMinor(r.total),
    count: Number(r.count),
    days: Number(r.days),
  }));
}

/**
 * What counts as a small purchase, for this person.
 *
 * A flat ₹200 is pocket change for one household and the median transaction
 * for another, so the threshold is the 25th percentile of the trailing three
 * months rather than a constant. Below MIN_HISTORY entries there is not enough
 * to take a percentile from and the constant stands in.
 */
const SMALL_TICKET_MIN_HISTORY = 20;

async function smallTicketThreshold(userId: string, end: string): Promise<number> {
  const from = monthRange(shiftMonth(end.slice(0, 7), -2)).start;
  const [row] = await db
    .select({
      n: sql<string>`COUNT(*)`,
      p25: sql<string | null>`PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY ${expenses.amountMinor})`,
    })
    .from(expenses)
    .where(inWindow(userId, from, end));

  if (Number(row?.n ?? 0) < SMALL_TICKET_MIN_HISTORY || row?.p25 == null) return SMALL_TICKET_MINOR;
  // Rounded to the nearest ₹10 so the label reads as a threshold, not a sample.
  return Math.max(1000, Math.round(Number(row.p25) / 1000) * 1000);
}

async function ticketStats(userId: string, start: string, end: string, threshold: number) {
  const [row] = await db
    .select({
      count: sql<string>`COUNT(*)`,
      median: sql<string | null>`PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${expenses.amountMinor})`,
      smallCount: sql<string>`COUNT(*) FILTER (WHERE ${expenses.amountMinor} <= ${threshold})`,
      smallTotal: sql<string>`COALESCE(SUM(${expenses.amountMinor}) FILTER (WHERE ${expenses.amountMinor} <= ${threshold}), 0)`,
    })
    .from(expenses)
    .where(inWindow(userId, start, end));

  return {
    count: Number(row?.count ?? 0),
    medianMinor: Math.round(Number(row?.median ?? 0)),
    smallCount: Number(row?.smallCount ?? 0),
    smallTotalMinor: sumToMinor(row?.smallTotal),
  };
}

async function largestExpense(userId: string, start: string, end: string) {
  const [row] = await db
    .select({
      amountMinor: expenses.amountMinor,
      date: expenses.expenseDate,
      note: expenses.note,
      categoryName: categories.name,
    })
    .from(expenses)
    .innerJoin(categories, eq(categories.id, expenses.categoryId))
    .where(inWindow(userId, start, end))
    .orderBy(sql`${expenses.amountMinor} DESC`)
    .limit(1);

  return row ?? null;
}

/**
 * The month each category can first be said to have existed.
 *
 * `created_at` alone is not enough: importing two years of history creates the
 * categories today, so every one of them would look younger than the data
 * inside it and momentum would refuse to judge any of them. The earlier of the
 * two signals is the honest one.
 */
async function categoryExistsFrom(userId: string): Promise<Map<string, string>> {
  const rows = await db
    .select({
      categoryId: categories.id,
      createdAt: categories.createdAt,
      firstTx: sql<string | null>`MIN(${expenses.expenseDate})`,
    })
    .from(categories)
    .leftJoin(
      expenses,
      sql`${expenses.categoryId} = ${categories.id} AND ${expenses.deletedAt} IS NULL`,
    )
    .where(eq(categories.userId, userId))
    .groupBy(categories.id, categories.createdAt);

  return new Map(
    rows.map((r) => {
      const created = r.createdAt.toISOString().slice(0, 7);
      const first = r.firstTx?.slice(0, 7);
      return [r.categoryId, first && first < created ? first : created];
    }),
  );
}

async function categoryTotals(userId: string, start: string, end: string) {
  const rows = await db
    .select({
      categoryId: categories.id,
      name: categories.name,
      icon: categories.icon,
      color: categories.color,
      total: sql<string>`COALESCE(SUM(${expenses.amountMinor}), 0)`,
    })
    .from(expenses)
    .innerJoin(categories, eq(categories.id, expenses.categoryId))
    .where(inWindow(userId, start, end))
    .groupBy(categories.id, categories.name, categories.icon, categories.color)
    .orderBy(sql`SUM(${expenses.amountMinor}) DESC`);

  return rows.map((r) => ({
    categoryId: r.categoryId,
    name: r.name,
    icon: r.icon,
    color: r.color,
    totalMinor: sumToMinor(r.total),
  }));
}

/**
 * Lending is not spending, so this never touches the expenses table — it
 * reports the month's movement through the peer ledger alongside it.
 */
async function ledgerFlow(userId: string, start: string, end: string) {
  const [row] = await db
    .select({
      out: sql<string>`COALESCE(SUM(${ledgerEntries.amountMinor}) FILTER (WHERE ${ledgerEntries.direction} = 'out'), 0)`,
      inn: sql<string>`COALESCE(SUM(${ledgerEntries.amountMinor}) FILTER (WHERE ${ledgerEntries.direction} = 'in'), 0)`,
      count: sql<string>`COUNT(*)`,
    })
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.userId, userId),
        isNull(ledgerEntries.deletedAt),
        gte(ledgerEntries.entryDate, start),
        lte(ledgerEntries.entryDate, end),
      ),
    );

  const lentMinor = sumToMinor(row?.out);
  const borrowedMinor = sumToMinor(row?.inn);
  return { lentMinor, borrowedMinor, netMinor: lentMinor - borrowedMinor, entryCount: Number(row?.count ?? 0) };
}

/**
 * Notes that appear more than once in the month — the closest thing to a
 * recurring-charge detector without asking the user to declare anything.
 * Matched case- and whitespace-insensitively so "Auto" and "auto " are one.
 */
async function repeatedNotes(userId: string, start: string, end: string) {
  const label = sql<string>`LOWER(BTRIM(${expenses.note}))`;
  const rows = await db
    .select({
      label,
      categoryName: sql<string>`MIN(${categories.name})`,
      count: sql<string>`COUNT(*)`,
      total: sql<string>`COALESCE(SUM(${expenses.amountMinor}), 0)`,
    })
    .from(expenses)
    .innerJoin(categories, eq(categories.id, expenses.categoryId))
    .where(and(inWindow(userId, start, end), sql`BTRIM(COALESCE(${expenses.note}, '')) <> ''`))
    .groupBy(label)
    .having(sql`COUNT(*) >= 2`)
    .orderBy(sql`SUM(${expenses.amountMinor}) DESC`)
    .limit(6);

  return rows.map((r) => ({
    label: r.label,
    categoryName: r.categoryName,
    count: Number(r.count),
    totalMinor: sumToMinor(r.total),
  }));
}
