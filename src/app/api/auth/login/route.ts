import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { loginSchema } from '@/lib/validation';
import { createSession, verifyPassword } from '@/lib/auth';
import { ApiError, ok, parseBody, toErrorResponse } from '@/lib/api';

export async function POST(req: Request) {
  try {
    const input = await parseBody(req, loginSchema);
    const [user] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);

    // Same message either way — don't reveal which emails exist.
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      throw new ApiError(401, 'Incorrect email or password');
    }

    await createSession({ userId: user.id, email: user.email, name: user.name });
    return ok({ user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    return toErrorResponse(err);
  }
}
