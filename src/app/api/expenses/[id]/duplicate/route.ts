import { ok, withAuth } from '@/lib/api';
import { duplicateExpense } from '@/lib/expenses';

type Ctx = { params: Promise<{ id: string }> };

export const POST = withAuth<Ctx>(async (req, session, { params }) => {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  return ok(await duplicateExpense(session.userId, id, body?.expenseDate), 201);
});
