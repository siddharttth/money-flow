import { NextResponse } from 'next/server';
import { ZodError, ZodType, ZodTypeDef } from 'zod';
import { getSession, type SessionPayload } from './auth';

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function fail(status: number, message: string, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

/**
 * Wraps a route handler: enforces auth, converts thrown errors into clean JSON.
 * Every data route in the app goes through this, so an unauthenticated request
 * can never reach a query.
 */
export function withAuth<Ctx>(
  handler: (req: Request, session: SessionPayload, ctx: Ctx) => Promise<Response>,
) {
  return async (req: Request, ctx: Ctx): Promise<Response> => {
    try {
      const session = await getSession();
      if (!session) return fail(401, 'Not authenticated');
      return await handler(req, session, ctx);
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}

export function toErrorResponse(err: unknown): Response {
  if (err instanceof ZodError) {
    return fail(422, 'Validation failed', err.flatten().fieldErrors);
  }
  if (err instanceof ApiError) {
    return fail(err.status, err.message, err.details);
  }
  console.error('[api] unhandled', err);
  const message = err instanceof Error ? err.message : 'Internal server error';
  return fail(500, message);
}

/** Generic over both Zod types so schemas using `.default()` — whose input and
 *  output shapes differ — still resolve to the parsed OUTPUT type. */
export async function parseBody<Out, In>(req: Request, schema: ZodType<Out, ZodTypeDef, In>): Promise<Out> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError(400, 'Request body must be valid JSON');
  }
  return schema.parse(raw);
}

export function query(req: Request): URLSearchParams {
  return new URL(req.url).searchParams;
}
