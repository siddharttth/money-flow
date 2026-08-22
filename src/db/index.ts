import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
}

/**
 * Serverless-safe singleton. Vercel reuses the module across warm invocations,
 * so we cache the client on globalThis to avoid opening a pool per request.
 * max: 1 keeps us well inside Neon's free-tier connection budget.
 */
const globalForDb = globalThis as unknown as { __pg?: ReturnType<typeof postgres> };

const client =
  globalForDb.__pg ??
  postgres(connectionString, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 15,
    prepare: false, // required when going through a pgbouncer-style pooled URL
  });

if (process.env.NODE_ENV !== 'production') globalForDb.__pg = client;

export const db = drizzle(client, { schema });
export { schema, client };
