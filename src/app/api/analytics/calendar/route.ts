import { ok, withAuth } from '@/lib/api';
import { getSpendCalendar } from '@/lib/analytics';

/* All time, like everything on Lifetime — no month to pass. */
export const GET = withAuth(async (_req, session) => ok(await getSpendCalendar(session.userId)));
