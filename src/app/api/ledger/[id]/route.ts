import { ok, parseBody, withAuth } from '@/lib/api';
import { updateLedgerSchema } from '@/lib/validation';
import { deleteLedgerEntry, updateLedgerEntry } from '@/lib/ledger';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = withAuth<Ctx>(async (req, session, { params }) => {
  const { id } = await params;
  const input = await parseBody(req, updateLedgerSchema);
  return ok(await updateLedgerEntry(session.userId, id, input));
});

export const DELETE = withAuth<Ctx>(async (_req, session, { params }) => {
  const { id } = await params;
  await deleteLedgerEntry(session.userId, id);
  return ok({ success: true, id });
});
