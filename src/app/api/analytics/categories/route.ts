import { ok, query, withAuth } from '@/lib/api';
import { getCategoryBreakdown, getTotal, type Filters } from '@/lib/analytics';
import { monthRange } from '@/lib/dates';

const csv = (v: string | null) => (v ? v.split(',').filter(Boolean) : undefined);

export const GET = withAuth(async (req, session) => {
  const q = query(req);
  const month = q.get('month');
  const range = month ? monthRange(month) : { start: q.get('start') ?? undefined, end: q.get('end') ?? undefined };

  /* Defaults to spending. `?include=income` powers the income list in
     Settings, which needs the same breakdown for the other side of the ledger. */
  const include = q.get('include');
  const filters: Filters = {
    userId: session.userId,
    start: range.start,
    end: range.end,
    personIds: csv(q.get('personIds')),
    include:
      include === 'income' || include === 'investment' || include === 'all' ? include : undefined,
  };

  const [items, total] = await Promise.all([getCategoryBreakdown(filters), getTotal(filters)]);

  // Category totals DO sum to grandTotal — they partition the same expenses.
  return ok({ items, grandTotalMinor: total.totalMinor, transactionCount: total.count });
});
