import { ok, query, withAuth } from '@/lib/api';
import { getIncomeOverview } from '@/lib/income';
import { currentMonth } from '@/lib/dates';

export const GET = withAuth(async (req, session) =>
  ok(await getIncomeOverview(session.userId, query(req).get('month') ?? currentMonth())),
);
