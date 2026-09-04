import { ok, query, withAuth } from '@/lib/api';
import { getMonthlyPlan, getSweep } from '@/lib/plan';
import { currentMonth } from '@/lib/dates';

/** The month as a plan: income, what is committed, and what is free. */
export const GET = withAuth(async (req, session) => {
  const month = query(req).get('month') ?? currentMonth();
  const [plan, sweep] = await Promise.all([
    getMonthlyPlan(session.userId, month),
    getSweep(session.userId, month),
  ]);
  return ok({ ...plan, sweep });
});
