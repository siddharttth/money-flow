import { ok, withAuth } from '@/lib/api';
import { getLifetimeTally } from '@/lib/plan';

/* Takes no month on purpose — see getLifetimeTally. */
export const GET = withAuth(async (_req, session) => ok(await getLifetimeTally(session.userId)));
