import { ok, withAuth } from '@/lib/api';
import { restoreExpense } from '@/lib/expenses';

type Ctx = { params: Promise<{ id: string }> };

/** Undo for a soft-deleted expense — clears deleted_at and it counts again. */
export const POST = withAuth<Ctx>(async (_req, session, { params }) => {
  const { id } = await params;
  return ok(await restoreExpense(session.userId, id));
});
