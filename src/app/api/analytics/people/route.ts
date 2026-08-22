import { ok, query, withAuth } from '@/lib/api';
import { getPersonBreakdown } from '@/lib/analytics';
import { monthRange } from '@/lib/dates';

const csv = (v: string | null) => (v ? v.split(',').filter(Boolean) : undefined);

export const GET = withAuth(async (req, session) => {
  const q = query(req);
  const month = q.get('month');
  const range = month ? monthRange(month) : { start: q.get('start') ?? undefined, end: q.get('end') ?? undefined };

  const result = await getPersonBreakdown({
    userId: session.userId,
    start: range.start,
    end: range.end,
    categoryIds: csv(q.get('categoryIds')),
  });

  const associationTotal = result.people.reduce((s, p) => s + p.totalMinor, 0);

  return ok({
    ...result,
    // Explicitly separated so no client is tempted to treat one as the other.
    associationTotalMinor: associationTotal,
    note:
      'grandTotalMinor is real money spent. Person totals are an association ' +
      'dimension of the same expenses and must never be added to it.',
  });
});
