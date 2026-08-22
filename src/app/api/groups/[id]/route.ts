import { db } from '@/db';
import { groups, groupMembers } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { ApiError, ok, parseBody, withAuth } from '@/lib/api';
import { updateGroupSchema } from '@/lib/validation';

type Ctx = { params: Promise<{ id: string }> };

async function owned(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(groups)
    .where(and(eq(groups.id, id), eq(groups.userId, userId)))
    .limit(1);
  if (!row) throw new ApiError(404, 'Group not found');
  return row;
}

export const PATCH = withAuth<Ctx>(async (req, session, { params }) => {
  const { id } = await params;
  await owned(session.userId, id);
  const input = await parseBody(req, updateGroupSchema);

  const row = await db.transaction(async (tx) => {
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) patch.name = input.name;
    if (input.icon !== undefined) patch.icon = input.icon;
    const [updated] = await tx.update(groups).set(patch).where(eq(groups.id, id)).returning();

    if (input.personIds) {
      await tx.delete(groupMembers).where(eq(groupMembers.groupId, id));
      if (input.personIds.length) {
        await tx.insert(groupMembers).values(input.personIds.map((personId) => ({ groupId: id, personId })));
      }
    }
    return updated;
  });

  return ok(row);
});

export const DELETE = withAuth<Ctx>(async (_req, session, { params }) => {
  const { id } = await params;
  await owned(session.userId, id);
  await db.delete(groups).where(eq(groups.id, id));
  return ok({ success: true });
});
