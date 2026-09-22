import { ok, parseBody, withAuth } from '@/lib/api';
import { updateLedgerSchema } from '@/lib/validation';
import { deleteLedgerEntry, getLedgerEntry, updateLedgerEntry } from '@/lib/ledger';

type Ctx = { params: Promise<{ id: string }> };

/* The edit sheet opens from a merged transaction row, which does not carry
   the person or the major-unit amount the form needs. */
export const GET = withAuth<Ctx>(async (_req, session, { params }) => {
  const { id } = await params;
  return ok(await getLedgerEntry(session.userId, id));
});

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
