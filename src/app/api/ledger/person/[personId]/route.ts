import { ok, withAuth } from '@/lib/api';
import { getPeerLedger } from '@/lib/ledger';

type Ctx = { params: Promise<{ personId: string }> };

/** One peer's full history, with a running balance per entry. */
export const GET = withAuth<Ctx>(async (_req, session, { params }) => {
  const { personId } = await params;
  return ok(await getPeerLedger(session.userId, personId));
});
