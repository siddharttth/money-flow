import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { categories, expenses } from '@/db/schema';
import { ok, withAuth } from '@/lib/api';
import { sumToMinor } from '@/lib/money';

/** Every spending category by lifetime total. "What has this cost me, ever." */
export const GET = withAuth(async (_req, session) => {
  const rows = await db
    .select({
      categoryId: categories.id,
      name: categories.name,
      icon: categories.icon,
      color: categories.color,
      total: sql<string>`COALESCE(SUM(${expenses.amountMinor}), 0)`,
      count: sql<string>`COUNT(*)`,
      firstDate: sql<string | null>`MIN(${expenses.expenseDate})`,
    })
    .from(expenses)
    .innerJoin(categories, sql`${categories.id} = ${expenses.categoryId}`)
    .where(
      sql`${expenses.userId} = ${session.userId}
          AND ${expenses.deletedAt} IS NULL
          AND ${categories.kind} NOT IN ('income', 'investment')`,
    )
    .groupBy(categories.id, categories.name, categories.icon, categories.color)
    .orderBy(sql`SUM(${expenses.amountMinor}) DESC`);

  return ok({
    items: rows.map((r) => ({
      categoryId: r.categoryId,
      name: r.name,
      icon: r.icon,
      color: r.color,
      totalMinor: sumToMinor(r.total),
      count: Number(r.count),
      firstDate: r.firstDate,
    })),
  });
});
