import { ok, withAuth } from '@/lib/api';
import { restoreLedgerEntry } from '@/lib/ledger';

type Ctx = { params: Promise<{ id: string }> };

export const POST = withAuth<Ctx>(async (_req, session, { params }) => {
  const { id } = await params;
  await restoreLedgerEntry(session.userId, id);
  return ok({ success: true, id });
});
