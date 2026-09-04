import { ok, withAuth } from '@/lib/api';
import { clearPersonLedger } from '@/lib/ledger';

type Ctx = { params: Promise<{ personId: string }> };

/** Soft-deletes every live entry with one person. The ids come back for undo. */
export const POST = withAuth<Ctx>(async (_req, session, { params }) => {
  const { personId } = await params;
  const { ids } = await clearPersonLedger(session.userId, personId);
  return ok({ cleared: ids.length, ids });
});
