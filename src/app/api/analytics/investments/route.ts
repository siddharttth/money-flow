import { ok, query, withAuth } from '@/lib/api';
import { getInvestmentSummary } from '@/lib/investments';
import { currentMonth } from '@/lib/dates';

export const GET = withAuth(async (req, session) => {
  const month = query(req).get('month') ?? currentMonth();
  return ok(await getInvestmentSummary(session.userId, month));
});
