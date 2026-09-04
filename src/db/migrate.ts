import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

/**
 * Applies any migration the database has not seen.
 *
 * This runs as part of `vercel-build`, ahead of `next build`, because the
 * alternative has already bitten once: a deploy shipped code that read
 * `categories.target_minor` to a database where the column did not exist, and
 * every screen that touched a category answered "column does not exist". Code
 * and schema go out together or not at all — a failure here should stop the
 * build, not become a broken production.
 *
 * The unpooled connection is preferred where one exists. Migrations take
 * advisory locks and run DDL in a transaction, and a transaction-mode pooler
 * is the wrong thing to do that through.
 */
async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) {
    console.error('✖ No DATABASE_URL (or DATABASE_URL_UNPOOLED) — cannot migrate.');
    process.exit(1);
  }

  const sql = postgres(url, { max: 1 });
  await migrate(drizzle(sql), { migrationsFolder: './drizzle' });
  await sql.end();
  console.log('✅ migrations applied');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
