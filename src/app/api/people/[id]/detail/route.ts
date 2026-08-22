import { db } from '@/db';
import { people } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { ApiError, ok, query, withAuth } from '@/lib/api';
import { getPersonCategoryBreakdown } from '@/lib/analytics';
import { listExpenses } from '@/lib/expenses';

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
    listExpenses({ userId: session.userId, start, end, personIds: [id], limit: 100 }),
  ]);

  return ok({
    person,
    // The person's association total, derived from their category rows — this
    // is a dimension of spending, never something to add to the grand total.
    totalMinor: categories.reduce((s, c) => s + c.totalMinor, 0),
    transactionCount: expenses.total,
    categories,
    expenses: expenses.items,
  });
});
