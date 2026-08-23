import { db } from '@/db';
import { categories } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { ApiError, ok, query, withAuth } from '@/lib/api';
import { getTotal } from '@/lib/analytics';
import { getTransactions } from '@/lib/transactions';
import { currentMonth, monthRange, todayISO, daysBetween } from '@/lib/dates';

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

  const [monthTotal, lifetime, feed] = await Promise.all([
    getTotal({ userId: session.userId, categoryIds: [id], start, end }),
    getTotal({ userId: session.userId, categoryIds: [id] }),
    getTransactions({ userId: session.userId, categoryIds: [id], start, end, kinds: ['expense'], limit: 60 }),
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
    projectedMinor: daysElapsed ? Math.round((monthTotal.totalMinor / daysElapsed) * daysInMonth) : 0,
    transactions: feed.items,
  });
});
