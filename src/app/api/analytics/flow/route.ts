import { ok, query, withAuth } from '@/lib/api';
import { getFlow } from '@/lib/flow';
import { currentMonth } from '@/lib/dates';

export const GET = withAuth(async (req, session) => {
  const month = query(req).get('month') ?? currentMonth();
  return ok(await getFlow(session.userId, month));
});
