import { db } from '@/db';
import { categories, expenses } from '@/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { ApiError, ok, query, withAuth } from '@/lib/api';
import { getTotal } from '@/lib/analytics';
import { getTransactions } from '@/lib/transactions';
import { currentMonth, monthRange, shiftMonth, todayISO, daysBetween } from '@/lib/dates';

/** Transactions needed in the trailing three months before a rate means anything. */
const PROJECTION_MIN_TXNS = 4;

type Ctx = { params: Promise<{ id: string }> };

/** Drill-down for the category drawer: spend, budget pacing, average size. */
export const GET = withAuth<Ctx>(async (req, session, { params }) => {
  const { id } = await params;
  const month = query(req).get('month') ?? currentMonth();
  const { start, end } = monthRange(month);

  const [category] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.id, id), eq(categories.userId, session.userId)))
    .limit(1);
  if (!category) throw new ApiError(404, 'Category not found');

  /* Three months back, to judge whether this category is regular enough to
     extrapolate at all — see the projection note below. */
  const trailing = monthRange(shiftMonth(month, -3));

  /*
   * `?scope=lifetime` answers a different question with the same category.
   *
   * Opened from the Lifetime page, the drawer used to list this month's
   * transactions — which on a page whose whole premise is "nothing here is
   * month-scoped" is the wrong answer, and often an empty one. It returns a
   * month-by-month series instead: the bird's-eye view. The transaction-level
   * detail is what the monthly drawer is for.
   */
  const wantSeries = query(req).get('scope') === 'lifetime';

  const [monthTotal, lifetime, feed, recent, series] = await Promise.all([
    getTotal({ userId: session.userId, categoryIds: [id], start, end }),
    getTotal({ userId: session.userId, categoryIds: [id] }),
    getTransactions({ userId: session.userId, categoryIds: [id], start, end, kinds: ['expense'], limit: 60 }),
    getTotal({ userId: session.userId, categoryIds: [id], start: trailing.start, end }),
    wantSeries ? monthlySeries(session.userId, id) : Promise.resolve([]),
  ]);

  const today = todayISO();
  const isCurrent = month === today.slice(0, 7);
  const daysElapsed = isCurrent ? daysBetween(start, today) : daysBetween(start, end);
  const daysInMonth = daysBetween(start, end);

  return ok({
    category: {
      id: category.id,
      name: category.name,
      icon: category.icon,
      color: category.color,
      kind: category.kind,
      monthlyBudgetMinor: category.monthlyBudgetMinor,
    },
    month,
    monthMinor: monthTotal.totalMinor,
    monthCount: monthTotal.count,
    lifetimeMinor: lifetime.totalMinor,
    lifetimeCount: lifetime.count,
    avgTransactionMinor: monthTotal.count ? Math.round(monthTotal.totalMinor / monthTotal.count) : 0,
    // Straight-line pacing: what you'd have spent by today on an even burn.
    pacedBudgetMinor: category.monthlyBudgetMinor
      ? Math.round((category.monthlyBudgetMinor * daysElapsed) / daysInMonth)
      : null,
    /*
     * A PROJECTION NEEDS A RATE, AND A LUMPY CATEGORY DOES NOT HAVE ONE.
     *
     * This extrapolated the daily rate flat, with no gate. For rent — one
     * ₹18,000 charge on the 1st — that reads ₹5,58,000 on day one, ₹2,79,000
     * on day two, and falls all month. It is never once right.
     *
     * The app already withholds a goal's pace until there is evidence for it;
     * the same gate applies here. Below PROJECTION_MIN_TXNS in the trailing
     * three months there is no rate to speak of, and the card says so instead
     * of printing a number.
     */
    projectedMinor:
      isCurrent && daysElapsed > 0 && recent.count >= PROJECTION_MIN_TXNS
        ? Math.round((monthTotal.totalMinor / daysElapsed) * daysInMonth)
        : null,
    /** Why there is no projection, so the UI can say which. */
    projectionBasis:
      !isCurrent ? ('past-month' as const)
      : recent.count >= PROJECTION_MIN_TXNS ? ('rate' as const)
      : ('too-lumpy' as const),
    /* Empty in lifetime scope — the series below is the answer there. */
    transactions: wantSeries ? [] : feed.items,
    scope: wantSeries ? ('lifetime' as const) : ('month' as const),
    series,
  });
});

/** Every month this category has ever seen, newest first. */
async function monthlySeries(userId: string, categoryId: string) {
  const rows = await db
    .select({
      month: sql<string>`to_char(${expenses.expenseDate}, 'YYYY-MM')`,
      total: sql<string>`COALESCE(SUM(${expenses.amountMinor}), 0)`,
      count: sql<string>`COUNT(*)`,
    })
    .from(expenses)
    .where(
      sql`${expenses.userId} = ${userId}
          AND ${expenses.categoryId} = ${categoryId}::uuid
          AND ${expenses.deletedAt} IS NULL`,
    )
    .groupBy(sql`to_char(${expenses.expenseDate}, 'YYYY-MM')`)
    .orderBy(sql`to_char(${expenses.expenseDate}, 'YYYY-MM') DESC`);

  return rows.map((r) => ({
    month: r.month,
    totalMinor: Number(r.total),
    count: Number(r.count),
  }));
}
