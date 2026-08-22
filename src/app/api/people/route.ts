import { db } from '@/db';
import { people, expensePeople, expenses, groupMembers } from '@/db/schema';
import { and, eq, asc, sql } from 'drizzle-orm';
import { ApiError, ok, parseBody, query, withAuth } from '@/lib/api';
import { createPersonSchema } from '@/lib/validation';
import { pickColor } from '@/lib/defaults';

export const GET = withAuth(async (req, session) => {
  const includeInactive = query(req).get('includeInactive') === 'true';
  const rows = await db
    .select({
      id: people.id,
      name: people.name,
      relationshipType: people.relationshipType,
      avatar: people.avatar,
      color: people.color,
      isSelf: people.isSelf,
      isActive: people.isActive,
      sortOrder: people.sortOrder,
      usageCount: sql<string>`(
        SELECT COUNT(*) FROM ${expensePeople} ep
        JOIN ${expenses} e ON e.id = ep.expense_id
        WHERE ep.person_id = ${people.id} AND e.deleted_at IS NULL
      )`,
    })
    .from(people)
    .where(
      includeInactive
        ? eq(people.userId, session.userId)
        : and(eq(people.userId, session.userId), eq(people.isActive, true)),
    )
    .orderBy(asc(people.sortOrder), asc(people.name));

  return ok({ items: rows.map((r) => ({ ...r, usageCount: Number(r.usageCount) })) });
});

export const POST = withAuth(async (req, session) => {
  const input = await parseBody(req, createPersonSchema);

  const [clash] = await db
    .select({ id: people.id })
    .from(people)
    .where(and(eq(people.userId, session.userId), eq(people.name, input.name)))
    .limit(1);
  if (clash) throw new ApiError(409, 'Someone with that name already exists');

  const [{ count }] = await db
    .select({ count: sql<string>`COUNT(*)` })
    .from(people)
    .where(eq(people.userId, session.userId));

  const person = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(people)
      .values({
        userId: session.userId,
        name: input.name,
        relationshipType: input.relationshipType || 'other',
        avatar: input.avatar || '🙂',
        color: input.color || pickColor(Number(count)),
        sortOrder: Number(count),
      })
      .returning();

    if (input.groupIds?.length) {
      await tx.insert(groupMembers).values(input.groupIds.map((groupId) => ({ groupId, personId: row.id })));
    }
    return row;
  });

  return ok(person, 201);
});
