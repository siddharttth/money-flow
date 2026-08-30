import { and, asc, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import { db } from '@/db';
import { categories, expenses } from '@/db/schema';
import { sumToMinor } from './money';
import { monthRange, shiftMonth, todayISO } from './dates';

/**
 * INVESTMENTS
 * -----------
 * The other half of the rule in analytics.ts. Money into an investment left
 * the current account but not your net worth, so it is excluded from every
 * spending figure — and then it has to live somewhere, or it would simply
 * vanish from the app.
 *
 * This is that somewhere. It reads the same `expenses` rows, filtered to
 * categories marked `kind = 'investment'`, which means an entry moves between
 * "spent" and "invested" the moment its category's kind changes. Nothing is
 * duplicated and nothing needs migrating.
 *
 * What it deliberately does NOT do is track returns. This says what you put
 * in, not what it is worth — the app has no price data and inventing a figure
 * for growth would be the one lie a ledger cannot afford.
 */

const isInvestment = sql`EXISTS (
  SELECT 1 FROM ${categories} c
  WHERE c.id = ${expenses.categoryId} AND c.kind = 'investment'
)`;

function live(userId: string) {
  return and(eq(expenses.userId, userId), isNull(expenses.deletedAt), isInvestment);
}

export type InvestmentEntry = {
  id: string;
  amountMinor: number;
  date: string;
  note: string | null;
  category: { id: string; name: string; icon: string; color: string };
};

export type InvestmentSummary = {
  month: string;
  /** Every rupee put in, across all time. */
  lifetimeMinor: number;
  monthMinor: number;
  previousMonthMinor: number;
  /** Months that saw at least one contribution — the denominator below. */
  activeMonths: number;
  averageMonthMinor: number;
  contributionCount: number;
  firstDate: string | null;
  /** How much of this month's outgoings went in rather than out. */
  monthSpendingMinor: number;
  byCategory: { categoryId: string; name: string; icon: string; color: string; totalMinor: number; count: number }[];
  byMonth: { month: string; totalMinor: number }[];
  recent: InvestmentEntry[];
};

export async function getInvestmentSummary(userId: string, month: string): Promise<InvestmentSummary> {
  const { start, end } = monthRange(month);
  const prev = monthRange(shiftMonth(month, -1));

  const [lifetime, thisMonth, prevMonth, byCategory, byMonth, recent, spending] = await Promise.all([
    lifetimeStats(userId),
    windowTotal(userId, start, end),
    windowTotal(userId, prev.start, prev.end),
    categoryTotals(userId),
    monthlyTotals(userId),
    recentEntries(userId, 50),
    spendingTotal(userId, start, end),
  ]);

  return {
    month,
    lifetimeMinor: lifetime.totalMinor,
    monthMinor: thisMonth,
    previousMonthMinor: prevMonth,
    activeMonths: byMonth.length,
    averageMonthMinor: byMonth.length ? Math.round(lifetime.totalMinor / byMonth.length) : 0,
    contributionCount: lifetime.count,
    firstDate: lifetime.firstDate,
    monthSpendingMinor: spending,
    byCategory,
    byMonth,
    recent,
  };
}

async function lifetimeStats(userId: string) {
  const [row] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${expenses.amountMinor}), 0)`,
      count: sql<string>`COUNT(*)`,
      first: sql<string | null>`MIN(${expenses.expenseDate})`,
    })
    .from(expenses)
    .where(live(userId));

  return {
    totalMinor: sumToMinor(row?.total),
    count: Number(row?.count ?? 0),
    firstDate: row?.first ?? null,
  };
}

async function windowTotal(userId: string, start: string, end: string) {
  const [row] = await db
    .select({ total: sql<string>`COALESCE(SUM(${expenses.amountMinor}), 0)` })
    .from(expenses)
    .where(and(live(userId), gte(expenses.expenseDate, start), lte(expenses.expenseDate, end)));

  return sumToMinor(row?.total);
}

/** The month's actual spending, so the screen can state the split honestly. */
async function spendingTotal(userId: string, start: string, end: string) {
  const [row] = await db
    .select({ total: sql<string>`COALESCE(SUM(${expenses.amountMinor}), 0)` })
    .from(expenses)
    .where(
      and(
        eq(expenses.userId, userId),
        isNull(expenses.deletedAt),
        gte(expenses.expenseDate, start),
        lte(expenses.expenseDate, end),
        sql`NOT ${isInvestment}`,
      ),
    );

  return sumToMinor(row?.total);
}

async function categoryTotals(userId: string) {
  const rows = await db
    .select({
      categoryId: categories.id,
      name: categories.name,
      icon: categories.icon,
      color: categories.color,
      total: sql<string>`COALESCE(SUM(${expenses.amountMinor}), 0)`,
      count: sql<string>`COUNT(*)`,
    })
    .from(expenses)
    .innerJoin(categories, eq(categories.id, expenses.categoryId))
    .where(live(userId))
    .groupBy(categories.id, categories.name, categories.icon, categories.color)
    .orderBy(desc(sql`SUM(${expenses.amountMinor})`));

  return rows.map((r) => ({
    categoryId: r.categoryId,
    name: r.name,
    icon: r.icon,
    color: r.color,
    totalMinor: sumToMinor(r.total),
    count: Number(r.count),
  }));
}

/**
 * Contributions per month, oldest first, capped to the last two years.
 * Months with nothing in are omitted rather than zero-filled — the chart fills
 * the gaps itself, and "months I contributed" is the useful denominator.
 */
async function monthlyTotals(userId: string) {
  const cutoff = monthRange(shiftMonth(todayISO().slice(0, 7), -23)).start;
  const rows = await db
    .select({
      month: sql<string>`to_char(${expenses.expenseDate}, 'YYYY-MM')`,
      total: sql<string>`COALESCE(SUM(${expenses.amountMinor}), 0)`,
    })
    .from(expenses)
    .where(and(live(userId), gte(expenses.expenseDate, cutoff)))
    .groupBy(sql`to_char(${expenses.expenseDate}, 'YYYY-MM')`)
    .orderBy(asc(sql`to_char(${expenses.expenseDate}, 'YYYY-MM')`));

  return rows.map((r) => ({ month: r.month, totalMinor: sumToMinor(r.total) }));
}

async function recentEntries(userId: string, limit: number): Promise<InvestmentEntry[]> {
  const rows = await db
    .select({
      id: expenses.id,
      amountMinor: expenses.amountMinor,
      date: expenses.expenseDate,
      note: expenses.note,
      categoryId: categories.id,
      name: categories.name,
      icon: categories.icon,
      color: categories.color,
    })
    .from(expenses)
    .innerJoin(categories, eq(categories.id, expenses.categoryId))
    .where(live(userId))
    .orderBy(desc(expenses.expenseDate), desc(expenses.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    amountMinor: r.amountMinor,
    date: r.date,
    note: r.note,
    category: { id: r.categoryId, name: r.name, icon: r.icon, color: r.color },
  }));
}
