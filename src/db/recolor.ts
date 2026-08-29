import 'dotenv/config';
import { db, closeDb } from './index';
import { categories, people, users as usersTable } from './schema';
import { DEFAULT_CATEGORIES, PALETTE, pickColor } from '@/lib/defaults';
import { eq } from 'drizzle-orm';

/**
 * Repaints existing categories and people into the current palette.
 *
 *   npm run recolor              # every account
 *   npm run recolor -- a@b.com   # one account
 *
 * Colours are stored per row, so changing the defaults only affects rows
 * created afterwards — accounts made before the palette changed keep whatever
 * they were seeded with. That is correct for a user who picked their own
 * colours and wrong for everyone who never touched them, which is why this is
 * a deliberate command rather than a migration.
 *
 * Rows keep their identity: a category that matches a seeded name gets that
 * name's colour, and everything else is dealt the palette in sort order, so
 * two categories never collide until there are more than ten.
 */
async function main() {
  const email = process.argv[2];

  let only: string | null = null;
  if (email) {
    const [row] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (!row) {
      console.error(`No account with email ${email}`);
      process.exit(1);
    }
    only = row.id;
  }

  const allCategories = (await db.select().from(categories)).filter((c) => !only || c.userId === only);
  const allPeople = (await db.select().from(people)).filter((p) => !only || p.userId === only);

  const users = new Set([...allCategories.map((c) => c.userId), ...allPeople.map((p) => p.userId)]);

  let touched = 0;

  for (const userId of users) {
    const mine = allCategories.filter((c) => c.userId === userId).sort((a, b) => a.sortOrder - b.sortOrder);
    let spare = 0;

    for (const c of mine) {
      const seeded = DEFAULT_CATEGORIES.find((d) => d.name === c.name || d.slug === c.slug);
      const next = seeded ? seeded.color : pickColor(spare++);
      if (next === c.color) continue;
      await db.update(categories).set({ color: next }).where(eq(categories.id, c.id));
      touched++;
    }

    const mates = allPeople.filter((p) => p.userId === userId).sort((a, b) => a.sortOrder - b.sortOrder);
    let index = 0;
    for (const p of mates) {
      // "Me" always takes the house green; everyone else is dealt in order.
      const next = p.isSelf ? PALETTE[0] : pickColor(1 + (index++ % (PALETTE.length - 1)));
      if (next === p.color) continue;
      await db.update(people).set({ color: next }).where(eq(people.id, p.id));
      touched++;
    }
  }

  console.log(
    `✅ Recoloured ${touched} row${touched === 1 ? '' : 's'} across ${users.size} account${users.size === 1 ? '' : 's'}`,
  );
  await closeDb();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
