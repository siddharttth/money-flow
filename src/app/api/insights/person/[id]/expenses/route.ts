import { db } from '@/db';
import { people } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { ApiError, ok, withAuth } from '@/lib/api';
import { listPersonExpenses } from '@/lib/analytics';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Every expense a person was part of, with their share — for the expense
 * bill. The drawer's own request stops at 60 rows, which is right for a list
 * on screen and wrong for a statement that has to add up to the lifetime
 * total above it.
 */
export const GET = withAuth<Ctx>(async (_req, session, { params }) => {
  const { id } = await params;
  const [person] = await db
    .select({ id: people.id })
    .from(people)
    .where(and(eq(people.id, id), eq(people.userId, session.userId)))
    .limit(1);
  if (!person) throw new ApiError(404, 'Person not found');

  return ok({ items: await listPersonExpenses({ userId: session.userId, personId: id, limit: null }) });
});
