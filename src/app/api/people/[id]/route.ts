import { db } from '@/db';
import { people, expensePeople, groupMembers } from '@/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { ApiError, ok, parseBody, withAuth } from '@/lib/api';
import { updatePersonSchema } from '@/lib/validation';

type Ctx = { params: Promise<{ id: string }> };

async function owned(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(people)
    .where(and(eq(people.id, id), eq(people.userId, userId)))
    .limit(1);
  if (!row) throw new ApiError(404, 'Person not found');
  return row;
}

export const GET = withAuth<Ctx>(async (_req, session, { params }) => {
  const { id } = await params;
  return ok(await owned(session.userId, id));
});

export const PATCH = withAuth<Ctx>(async (req, session, { params }) => {
  const { id } = await params;
  await owned(session.userId, id);
  const input = await parseBody(req, updatePersonSchema);

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of ['name', 'relationshipType', 'avatar', 'color', 'isActive'] as const) {
    if (input[key] !== undefined) patch[key] = input[key];
  }

  const person = await db.transaction(async (tx) => {
    const [row] = await tx.update(people).set(patch).where(eq(people.id, id)).returning();
    if (input.groupIds) {
      await tx.delete(groupMembers).where(eq(groupMembers.personId, id));
      if (input.groupIds.length) {
        await tx.insert(groupMembers).values(input.groupIds.map((groupId) => ({ groupId, personId: id })));
      }
    }
    return row;
  });

  return ok(person);
});

/** Same safety rule as categories: a person with history is disabled, not erased. */
export const DELETE = withAuth<Ctx>(async (_req, session, { params }) => {
  const { id } = await params;
  const person = await owned(session.userId, id);
  if (person.isSelf) throw new ApiError(422, 'The "Me" person cannot be removed');

  const [{ count }] = await db
    .select({ count: sql<string>`COUNT(*)` })
    .from(expensePeople)
    .where(eq(expensePeople.personId, id));

  if (Number(count) > 0) {
    await db.update(people).set({ isActive: false, updatedAt: new Date() }).where(eq(people.id, id));
    return ok({
      success: true,
      mode: 'disabled',
      message: `${count} expense(s) are associated with this person, so they were hidden instead of deleted.`,
    });
  }

  await db.delete(people).where(eq(people.id, id));
  return ok({ success: true, mode: 'deleted' });
});
