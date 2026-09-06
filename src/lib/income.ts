import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { categories, expenses } from '@/db/schema';
import { sumToMinor } from './money';
import { currentMonth, monthRange, shiftMonth, todayISO } from './dates';

/**
 * MONEY ARRIVING
 * --------------
 * Income was a section inside Settings — a configuration screen — which is the
 * same mistake as filing "log an expense" under preferences. You receive money
 * repeatedly; that is an activity, not a setting.
 *
 * Nothing here is a new table. An income source is a category with
 * `kind = 'income'`, and a payment is an ordinary expense row filed under it.
 * This module only asks that data the questions Settings never could: what is
 * normal for this source, when does it usually land, and how much does it move.
 */

export type IncomeSource = {
  categoryId: string;
  name: string;
  icon: string;
  color: string;
  /** Received in the month being asked about. */
  monthMinor: number;
  lifetimeMinor: number;
  paymentCount: number;
  lastDate: string | null;
  /** Twelve months, oldest first, zeros included so the sparkline has a shape. */
  series: { month: string; totalMinor: number }[];
  /** The middle month of everything received. Steadier than a mean. */
  typicalMinor: number;
  /** The day of the month it usually lands on. Null below two payments. */
  typicalDay: number | null;
  /**
   * How far the landing day moves, in days. Low means you can plan around it;
   * high means you cannot. Null below the evidence threshold.
   */
  dayVariance: number | null;
};

export type IncomeOverview = {
  month: string;
  isCurrentMonth: boolean;
  monthMinor: number;
  previousMonthMinor: number;
  /** Median of the months that had any income. What to actually plan against. */
  typicalMinor: number;
  lifetimeMinor: number;
  /** Months with any income at all. */
  activeMonths: number;
  /** Whole-account series for the chart. */
  series: { month: string; totalMinor: number }[];
  /** Which days of the month money landed on, for the calendar strip. */
  landedDays: number[];
  highMinor: number;
  lowMinor: number;
  /**
   * The spread between a good month and a bad one. For anyone freelancing this
   * is the number that matters — an average hides exactly the thing that makes
   * irregular income hard.
   */
  spreadMinor: number;
  sources: IncomeSource[];
};

/** Payments must exist before a pattern can be claimed from them. */
const PATTERN_MIN_PAYMENTS = 4;
const MONTHS = 12;

export async function getIncomeOverview(userId: string, month: string): Promise<IncomeOverview> {
  const from = monthRange(shiftMonth(currentMonth(), -(MONTHS - 1))).start;
  const { start, end } = monthRange(month);
  const prev = monthRange(shiftMonth(month, -1));

  const rows = await db
    .select({
      categoryId: categories.id,
      name: categories.name,
      icon: categories.icon,
      color: categories.color,
      date: expenses.expenseDate,
      amountMinor: expenses.amountMinor,
    })
    .from(expenses)
    .innerJoin(categories, sql`${categories.id} = ${expenses.categoryId}`)
    .where(
      sql`${expenses.userId} = ${userId}
          AND ${expenses.deletedAt} IS NULL
          AND ${categories.kind} = 'income'`,
    )
    .orderBy(expenses.expenseDate);

  const allSources = await db
    .select({ id: categories.id, name: categories.name, icon: categories.icon, color: categories.color })
    .from(categories)
    .where(
      sql`${categories.userId} = ${userId} AND ${categories.kind} = 'income' AND ${categories.isActive} = true`,
    )
    .orderBy(categories.sortOrder, categories.name);

  const months = Array.from({ length: MONTHS }, (_, i) => shiftMonth(currentMonth(), -(MONTHS - 1 - i)));
  const emptySeries = () => months.map((m) => ({ month: m, totalMinor: 0 }));

  const bySource = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = bySource.get(r.categoryId) ?? [];
    list.push(r);
    bySource.set(r.categoryId, list);
  }

  const sources: IncomeSource[] = allSources.map((c) => {
    const mine = bySource.get(c.id) ?? [];
    const series = emptySeries();
    const byMonth = new Map(series.map((s) => [s.month, s]));
    for (const r of mine) {
      const bucket = byMonth.get(r.date.slice(0, 7));
      if (bucket) bucket.totalMinor += r.amountMinor;
    }

    const monthlyTotals = [...new Set(mine.map((r) => r.date.slice(0, 7)))].map((m) =>
      mine.filter((r) => r.date.startsWith(m)).reduce((s, r) => s + r.amountMinor, 0),
    );
    const days = mine.map((r) => Number(r.date.slice(8, 10)));

    return {
      categoryId: c.id,
      name: c.name,
      icon: c.icon,
      color: c.color,
      monthMinor: mine.filter((r) => r.date >= start && r.date <= end).reduce((s, r) => s + r.amountMinor, 0),
      lifetimeMinor: mine.reduce((s, r) => s + r.amountMinor, 0),
      paymentCount: mine.length,
      lastDate: mine.length ? mine[mine.length - 1].date : null,
      series,
      typicalMinor: median(monthlyTotals),
      typicalDay: days.length >= 2 ? Math.round(median(days)) : null,
      dayVariance: days.length >= PATTERN_MIN_PAYMENTS ? spread(days) : null,
    };
  });

  const inWindow = rows.filter((r) => r.date >= from);
  const series = emptySeries();
  const byMonth = new Map(series.map((s) => [s.month, s]));
  for (const r of inWindow) {
    const bucket = byMonth.get(r.date.slice(0, 7));
    if (bucket) bucket.totalMinor += r.amountMinor;
  }

  const active = series.filter((s) => s.totalMinor > 0).map((s) => s.totalMinor);
  const monthMinor = rows.filter((r) => r.date >= start && r.date <= end).reduce((s, r) => s + r.amountMinor, 0);

  return {
    month,
    isCurrentMonth: month === todayISO().slice(0, 7),
    monthMinor,
    previousMonthMinor: rows
      .filter((r) => r.date >= prev.start && r.date <= prev.end)
      .reduce((s, r) => s + r.amountMinor, 0),
    typicalMinor: median(active),
    lifetimeMinor: rows.reduce((s, r) => s + r.amountMinor, 0),
    activeMonths: active.length,
    series,
    landedDays: [
      ...new Set(rows.filter((r) => r.date >= start && r.date <= end).map((r) => Number(r.date.slice(8, 10)))),
    ].sort((a, b) => a - b),
    highMinor: active.length ? Math.max(...active) : 0,
    lowMinor: active.length ? Math.min(...active) : 0,
    spreadMinor: active.length ? Math.max(...active) - Math.min(...active) : 0,
    sources,
  };
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** Mean absolute deviation from the median — robust, and readable as "± N days". */
function spread(values: number[]): number {
  const m = median(values);
  return Math.round(values.reduce((s, v) => s + Math.abs(v - m), 0) / values.length);
}
