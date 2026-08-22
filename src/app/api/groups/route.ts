import { db } from '@/db';
import { groups, groupMembers, people } from '@/db/schema';
import { eq, asc, inArray } from 'drizzle-orm';
import { ok, parseBody, withAuth } from '@/lib/api';
import { createGroupSchema } from '@/lib/validation';

export const GET = withAuth(async (_req, session) => {
  const rows = await db
    .select()
    .from(groups)
    .where(eq(groups.userId, session.userId))
    .orderBy(asc(groups.name));

  if (!rows.length) return ok({ items: [] });

  const members = await db
    .select({
      groupId: groupMembers.groupId,
      id: people.id,
      name: people.name,
      avatar: people.avatar,
      color: people.color,
    })
    .from(groupMembers)
    .innerJoin(people, eq(people.id, groupMembers.personId))
    .where(inArray(groupMembers.groupId, rows.map((r) => r.id)));

  const byGroup = new Map<string, typeof members>();
  for (const m of members) {
    const list = byGroup.get(m.groupId) ?? [];
    list.push(m);
    byGroup.set(m.groupId, list);
  }

  return ok({ items: rows.map((g) => ({ ...g, members: byGroup.get(g.id) ?? [] })) });
});

export const POST = withAuth(async (req, session) => {
  const input = await parseBody(req, createGroupSchema);
  const group = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(groups)
      .values({ userId: session.userId, name: input.name, icon: input.icon || '👥' })
      .returning();
    if (input.personIds?.length) {
      await tx.insert(groupMembers).values(input.personIds.map((personId) => ({ groupId: row.id, personId })));
    }
    return row;
  });
  return ok(group, 201);
});
