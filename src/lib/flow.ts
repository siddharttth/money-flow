import { and, eq, gte, lte, isNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import { expenses, categories, ledgerEntries } from '@/db/schema';
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
 */

/** Anything at or below this is a "small ticket" — the thousand-cuts bucket. */
export const SMALL_TICKET_MINOR = 20_000; // ₹200

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
  /** Mean of the three months before this one. */
  baselineMinor: number;
  deltaMinor: number;
  deltaPct: number | null;
  /** True when the category has no history to compare against. */
  isNew: boolean;
};

export type Flow = {
  month: string;
  isCurrentMonth: boolean;

  pace: {
    elapsedDays: number;
    monthDays: number;
    spentMinor: number;
    /** Previous month's total at the same day-of-month — the honest comparison. */
    prevSameDayMinor: number;
    prevFullMinor: number;
    perDayMinor: number;
    projectedMinor: number;
    /** Spend vs the previous month at this point, as a percentage. */
    deltaPct: number | null;
  };

  cumulative: FlowCumulativePoint[];

  weekday: { dow: number; label: string; totalMinor: number; count: number; avgMinor: number }[];

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

/** Live, undeleted expenses for one user inside a date window. */
function inWindow(userId: string, start: string, end: string) {
  return and(
    eq(expenses.userId, userId),
    isNull(expenses.deletedAt),
    gte(expenses.expenseDate, start),
    lte(expenses.expenseDate, end),
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

  const [thisDaily, prevDaily, weekdayRows, ticketRow, largestRow, catRows, baselineRows, ledgerRow, repeatRows] =
    await Promise.all([
      dailyTotals(userId, start, end),
      dailyTotals(userId, prev.start, prev.end),
      weekdayTotals(userId, start, end),
      ticketStats(userId, start, end),
      largestExpense(userId, start, end),
      categoryTotals(userId, start, end),
      // Three months of history, ending the month before this one.
      categoryTotals(userId, monthRange(shiftMonth(month, -3)).start, prev.end),
      ledgerFlow(userId, start, end),
      repeatedNotes(userId, start, end),
    ]);

  const byDayThis = new Map(thisDaily.map((d) => [Number(d.date.slice(8, 10)), d.totalMinor]));
  const byDayPrev = new Map(prevDaily.map((d) => [Number(d.date.slice(8, 10)), d.totalMinor]));

  /*
   * The cumulative curve runs to the end of the month for a past month, but
   * only to today for the current one — drawing a flat line from today to the
   * 31st would read as "I stopped spending", not "it hasn't happened yet".
   */
  const lastDay = isCurrentMonth ? elapsedDays : monthDays;
  const cumulative: FlowCumulativePoint[] = [];
  let runThis = 0;
  let runPrev = 0;
  for (let day = 1; day <= lastDay; day++) {
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
  const prevFullMinor = prevDaily.reduce((s, d) => s + d.totalMinor, 0);
  const prevSameDayMinor = prevDaily
    .filter((d) => Number(d.date.slice(8, 10)) <= elapsedDays)
    .reduce((s, d) => s + d.totalMinor, 0);

  const perDayMinor = elapsedDays > 0 ? Math.round(spentMinor / elapsedDays) : 0;

  const grand = catRows.reduce((s, c) => s + c.totalMinor, 0);
  const shares = grand > 0 ? catRows.map((c) => c.totalMinor / grand) : [];

  const baselineById = new Map(baselineRows.map((c) => [c.categoryId, c.totalMinor]));
  const seenCategories = new Set([...catRows.map((c) => c.categoryId), ...baselineRows.map((c) => c.categoryId)]);
  const metaById = new Map([...baselineRows, ...catRows].map((c) => [c.categoryId, c]));

  const momentum: FlowMomentum[] = [...seenCategories]
    .map((id) => {
      const meta = metaById.get(id)!;
      const thisMinor = catRows.find((c) => c.categoryId === id)?.totalMinor ?? 0;
      // Trailing three months, averaged. Months with no spend still count as
      // zero — a category used once in three months has a low baseline, and
      // that is the truth, not a missing value.
      const baselineMinor = Math.round((baselineById.get(id) ?? 0) / 3);
      return {
        categoryId: id,
        name: meta.name,
        icon: meta.icon,
        color: meta.color,
        thisMinor,
        baselineMinor,
        deltaMinor: thisMinor - baselineMinor,
        deltaPct: baselineMinor > 0 ? ((thisMinor - baselineMinor) / baselineMinor) * 100 : null,
        isNew: baselineMinor === 0 && thisMinor > 0,
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
      prevSameDayMinor,
      prevFullMinor,
      perDayMinor,
      projectedMinor: elapsedDays > 0 ? Math.round((spentMinor / elapsedDays) * monthDays) : 0,
      deltaPct: prevSameDayMinor > 0 ? ((spentMinor - prevSameDayMinor) / prevSameDayMinor) * 100 : null,
    },
    cumulative,
    weekday: WEEKDAY_LABELS.map((label, dow) => {
      const row = weekdayRows.find((w) => w.dow === dow);
      return {
        dow,
        label,
        totalMinor: row?.totalMinor ?? 0,
        count: row?.count ?? 0,
        avgMinor: row && row.days > 0 ? Math.round(row.totalMinor / row.days) : 0,
      };
    }),
    tickets: {
      count: ticketRow.count,
      medianMinor: ticketRow.medianMinor,
      averageMinor: ticketRow.count > 0 ? Math.round(spentMinor / ticketRow.count) : 0,
      largest: largestRow,
      smallThresholdMinor: SMALL_TICKET_MINOR,
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

async function ticketStats(userId: string, start: string, end: string) {
  const [row] = await db
    .select({
      count: sql<string>`COUNT(*)`,
      median: sql<string | null>`PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${expenses.amountMinor})`,
      smallCount: sql<string>`COUNT(*) FILTER (WHERE ${expenses.amountMinor} <= ${SMALL_TICKET_MINOR})`,
      smallTotal: sql<string>`COALESCE(SUM(${expenses.amountMinor}) FILTER (WHERE ${expenses.amountMinor} <= ${SMALL_TICKET_MINOR}), 0)`,
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
