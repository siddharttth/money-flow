import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import * as schema from '@/db/schema';

/**
 * A real Postgres (compiled to WASM) running in-process, built from the same
 * migration SQL that ships to production. The aggregation tests therefore
 * exercise the actual queries — SUM, GROUP BY, EXISTS and all — not a mock.
 */
export async function makeTestDb() {
  const client = new PGlite();
  const dir = path.resolve(__dirname, '../../drizzle');

  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(path.join(dir, file), 'utf8');
    // Drizzle separates statements with this marker.
    for (const statement of sql.split('--> statement-breakpoint')) {
      const trimmed = statement.trim();
      if (trimmed) await client.exec(trimmed);
    }
  }

  return drizzle(client, { schema });
}
