import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { fail, ok, toErrorResponse } from '@/lib/api';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return fail(401, 'Not authenticated');
    const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
    if (!user) return fail(401, 'Not authenticated');
    return ok({ user: { id: user.id, name: user.name, email: user.email, currency: user.currency } });
  } catch (err) {
    return toErrorResponse(err);
  }
}
