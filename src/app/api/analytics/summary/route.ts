import { ok, query, withAuth } from '@/lib/api';
import { getSummary } from '@/lib/analytics';
import { currentMonth } from '@/lib/dates';

export const GET = withAuth(async (req, session) => {
  const month = query(req).get('month') ?? currentMonth();
  return ok(await getSummary(session.userId, month));
});
