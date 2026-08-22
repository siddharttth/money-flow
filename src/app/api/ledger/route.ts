import { ok, parseBody, withAuth } from '@/lib/api';
import { createLedgerSchema } from '@/lib/validation';
import { createLedgerEntry, getPeerSummary } from '@/lib/ledger';

/** Balances per peer plus the GIVEN / TAKEN headline totals. */
export const GET = withAuth(async (_req, session) => {
  return ok(await getPeerSummary(session.userId));
});

export const POST = withAuth(async (req, session) => {
  const input = await parseBody(req, createLedgerSchema);
  return ok(await createLedgerEntry(session.userId, input), 201);
});
