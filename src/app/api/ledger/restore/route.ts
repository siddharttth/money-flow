import { ApiError, ok, parseBody, withAuth } from '@/lib/api';
import { restoreLedgerEntries } from '@/lib/ledger';
import { z } from 'zod';

const schema = z.object({ ids: z.array(z.string().uuid()).min(1).max(1000) });

/** Bulk undo for a cleared ledger. */
export const POST = withAuth(async (req, session) => {
  const { ids } = await parseBody(req, schema);
  const restored = await restoreLedgerEntries(session.userId, ids);
  if (!restored) throw new ApiError(404, 'Nothing to restore');
  return ok({ restored });
});
