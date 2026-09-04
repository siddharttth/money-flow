import { ok, query, withAuth } from '@/lib/api';
import { getFunds } from '@/lib/funds';
import { currentMonth } from '@/lib/dates';

export const GET = withAuth(async (req, session) => {
  const month = query(req).get('month') ?? currentMonth();
  return ok({ items: await getFunds(session.userId, month) });
});
