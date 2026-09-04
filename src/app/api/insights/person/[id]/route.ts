import { db } from '@/db';
import { people } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { ApiError, ok, query, withAuth } from '@/lib/api';
import { getPersonCategoryBreakdown, listPersonExpenses } from '@/lib/analytics';
import { getPeerLedger } from '@/lib/ledger';
import { currentMonth, monthRange } from '@/lib/dates';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Everything the person drawer shows, in one request: lifetime and
 * this-month association totals, the peer ledger balance, and both history
 * tabs. One round trip keeps the drawer feeling instant.
 */
export const GET = withAuth<Ctx>(async (req, session, { params }) => {
  const { id } = await params;
  const month = query(req).get('month') ?? currentMonth();
  const { start, end } = monthRange(month);

  const [person] = await db
    .select()
    .from(people)
    .where(and(eq(people.id, id), eq(people.userId, session.userId)))
    .limit(1);
  if (!person) throw new ApiError(404, 'Person not found');

  const [lifetime, thisMonth, ledger, expenseFeed] = await Promise.all([
    getPersonCategoryBreakdown({ userId: session.userId, personId: id }),
    getPersonCategoryBreakdown({ userId: session.userId, personId: id, start, end }),
    getPeerLedger(session.userId, id).catch(() => null),
    /*
     * Shares, not the whole bills. The totals above are this person's share of
     * what they were part of, so the rows underneath have to be the same thing
     * or the list will not add up to the figure above it.
     */
    listPersonExpenses({ userId: session.userId, personId: id, limit: 60 }),
  ]);

  const sum = (rows: { totalMinor: number }[]) => rows.reduce((s, r) => s + r.totalMinor, 0);

  return ok({
    person: {
      id: person.id,
      name: person.name,
      relationshipType: person.relationshipType,
      color: person.color,
      isSelf: person.isSelf,
    },
    month,
    lifetimeMinor: sum(lifetime),
    monthMinor: sum(thisMonth),
    categories: lifetime.slice(0, 6),
    // Positive: they owe you. Negative: you owe them.
    balanceMinor: ledger?.balanceMinor ?? 0,
    lentMinor: ledger?.outMinor ?? 0,
    borrowedMinor: ledger?.inMinor ?? 0,
    expenses: expenseFeed,
    ledger: ledger?.entries ?? [],
  });
});
