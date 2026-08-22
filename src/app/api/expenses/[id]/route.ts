import { ok, parseBody, withAuth } from '@/lib/api';
import { updateExpenseSchema } from '@/lib/validation';
import { deleteExpense, getExpense, updateExpense } from '@/lib/expenses';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withAuth<Ctx>(async (_req, session, { params }) => {
  const { id } = await params;
  return ok(await getExpense(session.userId, id));
});

export const PATCH = withAuth<Ctx>(async (req, session, { params }) => {
  const { id } = await params;
  const input = await parseBody(req, updateExpenseSchema);
  return ok(await updateExpense(session.userId, id, input));
});

export const DELETE = withAuth<Ctx>(async (_req, session, { params }) => {
  const { id } = await params;
  await deleteExpense(session.userId, id);
  return ok({ success: true, id });
});
