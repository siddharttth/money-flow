import { ok, query, withAuth } from '@/lib/api';
import { getTransactions, type TxKind } from '@/lib/transactions';

const csv = (v: string | null) => (v ? v.split(',').filter(Boolean) : undefined);
const num = (v: string | null) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);

/** Merged feed of expenses and ledger entries, for the transactions screen. */
export const GET = withAuth(async (req, session) => {
  const q = query(req);
  return ok(
    await getTransactions({
      userId: session.userId,
      start: q.get('start') ?? undefined,
      end: q.get('end') ?? undefined,
      categoryIds: csv(q.get('categoryIds')),
      personIds: csv(q.get('personIds')),
      kinds: csv(q.get('kinds')) as TxKind[] | undefined,
      search: q.get('search') ?? undefined,
      limit: num(q.get('limit')),
      offset: num(q.get('offset')),
    }),
  );
});
