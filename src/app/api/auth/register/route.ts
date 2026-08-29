import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { registerSchema } from '@/lib/validation';
import { createSession, hashPassword } from '@/lib/auth';
import { ApiError, ok, parseBody, toErrorResponse } from '@/lib/api';
import { bootstrapUser } from '@/db/bootstrap';

export async function POST(req: Request) {
  try {
    const input = await parseBody(req, registerSchema);

    // Optional gate so a personal deployment isn't open to the world.
    const code = process.env.SIGNUP_CODE;
    if (code && input.signupCode !== code) {
      throw new ApiError(403, 'Invalid invite code');
    }

    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
    if (existing) throw new ApiError(409, 'An account with this email already exists');

    const [user] = await db
      .insert(users)
      .values({ name: input.name, email: input.email, passwordHash: await hashPassword(input.password) })
      .returning();

    await bootstrapUser(user.id);
    await createSession({ userId: user.id, email: user.email, name: user.name });

    return ok({ user: { id: user.id, name: user.name, email: user.email } }, 201);
  } catch (err) {
    return toErrorResponse(err);
  }
}
