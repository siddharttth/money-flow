import { db } from '@/db';
import { people } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { ApiError, ok, query, withAuth } from '@/lib/api';
import { getPersonCategoryBreakdown, listPersonExpenses } from '@/lib/analytics';

type Ctx = { params: Promise<{ id: string }> };

/** Everything the person detail page needs in one request. */
export const GET = withAuth<Ctx>(async (req, session, { params }) => {
  const { id } = await params;
  const q = query(req);
  const start = q.get('start') ?? undefined;
  const end = q.get('end') ?? undefined;

  const [person] = await db
    .select()
    .from(people)
    .where(and(eq(people.id, id), eq(people.userId, session.userId)))
    .limit(1);
  if (!person) throw new ApiError(404, 'Person not found');

  const [categories, expenses] = await Promise.all([
    getPersonCategoryBreakdown({ userId: session.userId, start, end, personId: id }),
    listPersonExpenses({ userId: session.userId, start, end, personId: id, limit: 100 }),
  ]);

  return ok({
    person,
    // This person's share of what they were part of. The rows below carry the
    // same shares, so the list adds up to this figure.
    totalMinor: categories.reduce((s, c) => s + c.totalMinor, 0),
    transactionCount: expenses.length,
    categories,
    expenses,
  });
});
