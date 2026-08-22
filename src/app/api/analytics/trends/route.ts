import { ok, query, withAuth } from '@/lib/api';
import { getMonthlyTotals } from '@/lib/analytics';

export const GET = withAuth(async (req, session) => {
  const months = Math.min(Math.max(Number(query(req).get('months') ?? 6), 1), 24);
  return ok({ items: await getMonthlyTotals(session.userId, months) });
});
