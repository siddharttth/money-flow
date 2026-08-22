import { db } from '@/db';
import { categories, expenses } from '@/db/schema';
import { and, eq, asc, sql } from 'drizzle-orm';
import { ApiError, ok, parseBody, query, withAuth } from '@/lib/api';
import { createCategorySchema } from '@/lib/validation';
import { pickColor, slugify } from '@/lib/defaults';

export const GET = withAuth(async (req, session) => {
  const includeInactive = query(req).get('includeInactive') === 'true';
  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      icon: categories.icon,
      color: categories.color,
      kind: categories.kind,
      isActive: categories.isActive,
      sortOrder: categories.sortOrder,
      usageCount: sql<string>`(
        SELECT COUNT(*) FROM ${expenses} e
        WHERE e.category_id = ${categories.id} AND e.deleted_at IS NULL
      )`,
    })
    .from(categories)
    .where(
      includeInactive
        ? eq(categories.userId, session.userId)
        : and(eq(categories.userId, session.userId), eq(categories.isActive, true)),
    )
    .orderBy(asc(categories.sortOrder), asc(categories.name));

  return ok({ items: rows.map((r) => ({ ...r, usageCount: Number(r.usageCount) })) });
});

export const POST = withAuth(async (req, session) => {
  const input = await parseBody(req, createCategorySchema);
  const slug = slugify(input.name);

  const [clash] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.userId, session.userId), eq(categories.slug, slug)))
    .limit(1);
  if (clash) throw new ApiError(409, 'A category with that name already exists');

  const [{ count }] = await db
    .select({ count: sql<string>`COUNT(*)` })
    .from(categories)
    .where(eq(categories.userId, session.userId));

  const [row] = await db
    .insert(categories)
    .values({
      userId: session.userId,
      name: input.name,
      slug,
      icon: input.icon || '💸',
      color: input.color || pickColor(Number(count)),
      kind: input.kind || 'expense',
      sortOrder: input.sortOrder ?? Number(count),
    })
    .returning();

  return ok(row, 201);
});
