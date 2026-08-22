import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

/**
 * The connection is created LAZILY, on the first actual query.
 *
 * Connecting at module load would throw during `next build`, because Next
 * imports every route module to collect its config — long before any request
 * exists and, on a fresh deploy, before DATABASE_URL has been attached. The
 * proxy below keeps `db` importable everywhere while deferring the connection
 * to the moment it is genuinely needed.
 */

type Db = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as {
  __pgClient?: ReturnType<typeof postgres>;
  __pgDb?: Db;
};

function connect(): Db {
  if (globalForDb.__pgDb) return globalForDb.__pgDb;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. Locally: copy .env.example to .env. On Vercel: add a Postgres database or set the variable in project settings.',
    );
  }

  // Serverless-safe singleton: Vercel reuses the module across warm
  // invocations, so caching on globalThis avoids a pool per request.
  // max: 1 keeps us inside Neon's free-tier connection budget.
  const client =
    globalForDb.__pgClient ??
    postgres(connectionString, {
      max: 1,
      idle_timeout: 20,
      connect_timeout: 15,
      prepare: false, // required behind a pgbouncer-style pooled URL
    });

  globalForDb.__pgClient = client;
  globalForDb.__pgDb = drizzle(client, { schema });
  return globalForDb.__pgDb;
}

/** Behaves exactly like a Drizzle instance; connects on first use. */
export const db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    const real = connect() as unknown as Record<string | symbol, unknown>;
    const value = Reflect.get(real, prop, receiver);
    return typeof value === 'function' ? value.bind(real) : value;
  },
});

/** Closes the pool — only needed by one-shot scripts like the seeder. */
export async function closeDb(): Promise<void> {
  await globalForDb.__pgClient?.end();
  globalForDb.__pgClient = undefined;
  globalForDb.__pgDb = undefined;
}

export { schema };
