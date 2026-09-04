import { ok, query, withAuth } from '@/lib/api';
import { getSavingsHistory } from '@/lib/plan';

export const GET = withAuth(async (req, session) => {
  const months = Math.min(Math.max(Number(query(req).get('months') ?? 6), 1), 24);
  return ok({ items: await getSavingsHistory(session.userId, months) });
});
