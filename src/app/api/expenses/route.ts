import { ok, parseBody, query, withAuth } from '@/lib/api';
import { createExpenseSchema } from '@/lib/validation';
import { createExpense, listExpenses } from '@/lib/expenses';

const csv = (v: string | null) => (v ? v.split(',').filter(Boolean) : undefined);
const num = (v: string | null) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);

export const GET = withAuth(async (req, session) => {
  const q = query(req);
  const result = await listExpenses({
    userId: session.userId,
    start: q.get('start') ?? undefined,
    end: q.get('end') ?? undefined,
    categoryIds: csv(q.get('categoryIds')),
    personIds: csv(q.get('personIds')),
    minAmount: num(q.get('minAmount')),
    maxAmount: num(q.get('maxAmount')),
    search: q.get('search') ?? undefined,
    sort: (q.get('sort') as never) ?? 'date_desc',
    limit: num(q.get('limit')),
    offset: num(q.get('offset')),
  });
  return ok(result);
});

export const POST = withAuth(async (req, session) => {
  const input = await parseBody(req, createExpenseSchema);
  return ok(await createExpense(session.userId, input), 201);
});
