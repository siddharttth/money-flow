import { db } from '@/db';
import { categories } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { ok, parseBody, withAuth } from '@/lib/api';
import { reorderSchema } from '@/lib/validation';

export const POST = withAuth(async (req, session) => {
  const { ids } = await parseBody(req, reorderSchema);
  await db.transaction(async (tx) => {
    for (let i = 0; i < ids.length; i++) {
      await tx
        .update(categories)
        .set({ sortOrder: i, updatedAt: new Date() })
        .where(and(eq(categories.id, ids[i]), eq(categories.userId, session.userId)));
    }
  });
  return ok({ success: true });
});
