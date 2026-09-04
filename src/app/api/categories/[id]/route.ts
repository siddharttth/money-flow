import { db } from '@/db';
import { categories, expenses } from '@/db/schema';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { ApiError, ok, parseBody, query, withAuth } from '@/lib/api';
import { updateCategorySchema } from '@/lib/validation';
import { slugify } from '@/lib/defaults';

type Ctx = { params: Promise<{ id: string }> };

async function owned(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.id, id), eq(categories.userId, userId)))
    .limit(1);
  if (!row) throw new ApiError(404, 'Category not found');
  return row;
}

export const PATCH = withAuth<Ctx>(async (req, session, { params }) => {
  const { id } = await params;
  await owned(session.userId, id);
  const input = await parseBody(req, updateCategorySchema);

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) {
    patch.name = input.name;
    patch.slug = slugify(input.name);
  }
  for (const key of ['icon', 'color', 'kind', 'isActive', 'sortOrder'] as const) {
    if (input[key] !== undefined) patch[key] = input[key];
  }
  if (input.monthlyBudget !== undefined) {
    patch.monthlyBudgetMinor = input.monthlyBudget != null ? Math.round(input.monthlyBudget * 100) : null;
  }
  if (input.target !== undefined) {
    patch.targetMinor = input.target != null ? Math.round(input.target * 100) : null;
  }
  if (input.targetDate !== undefined) patch.targetDate = input.targetDate;

  /*
   * A target only means anything on money being set aside. Marking a fund back
   * to a spending category has to drop it, or the fund would keep appearing on
   * a screen whose figures no longer include it.
   */
  if (input.kind !== undefined && input.kind !== 'investment') {
    patch.targetMinor = null;
    patch.targetDate = null;
  }

  const [row] = await db.update(categories).set(patch).where(eq(categories.id, id)).returning();
  return ok(row);
});

/**
 * Categories with history are never destroyed — deleting one disables it so
 * past expenses keep a valid category and analytics stay correct.
 * `?force=true` hard-deletes, but only when nothing references it.
 */
export const DELETE = withAuth<Ctx>(async (req, session, { params }) => {
  const { id } = await params;
  await owned(session.userId, id);

  const [{ count }] = await db
    .select({ count: sql<string>`COUNT(*)` })
    .from(expenses)
    .where(and(eq(expenses.categoryId, id), isNull(expenses.deletedAt)));

  const inUse = Number(count) > 0;

  if (inUse) {
    await db.update(categories).set({ isActive: false, updatedAt: new Date() }).where(eq(categories.id, id));
    return ok({
      success: true,
      mode: 'disabled',
      message: `${count} expense(s) use this category, so it was disabled instead of deleted.`,
    });
  }

  if (query(req).get('force') === 'true') {
    await db.delete(categories).where(eq(categories.id, id));
    return ok({ success: true, mode: 'deleted' });
  }

  await db.update(categories).set({ isActive: false, updatedAt: new Date() }).where(eq(categories.id, id));
  return ok({ success: true, mode: 'disabled' });
});
