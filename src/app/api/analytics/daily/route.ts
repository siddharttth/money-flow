import { ok, query, withAuth } from '@/lib/api';
import { getDailyTotals } from '@/lib/analytics';
import { monthRange, currentMonth } from '@/lib/dates';

const csv = (v: string | null) => (v ? v.split(',').filter(Boolean) : undefined);

export const GET = withAuth(async (req, session) => {
  const q = query(req);
  const { start, end } = monthRange(q.get('month') ?? currentMonth());
  const items = await getDailyTotals({
    userId: session.userId,
    start,
    end,
    categoryIds: csv(q.get('categoryIds')),
    personIds: csv(q.get('personIds')),
  });
  return ok({ items });
});
