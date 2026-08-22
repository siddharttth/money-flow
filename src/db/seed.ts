import 'dotenv/config';
import { db, closeDb } from './index';
import { users, categories, people, expenses, expensePeople } from './schema';
import { bootstrapUser } from './bootstrap';
import { hashPassword } from '@/lib/auth';
import { eq } from 'drizzle-orm';
import { toMinor } from '@/lib/money';

/**
 * Creates a demo account with realistic data shaped like the original
 * spreadsheet, so every screen has something meaningful to show.
 *   npm run seed
 */

const EMAIL = process.env.SEED_EMAIL ?? 'demo@moneyflow.app';
const PASSWORD = process.env.SEED_PASSWORD ?? 'demo1234';

const EXTRA_PEOPLE = [
  { name: 'Mummy', relationshipType: 'family', avatar: '👵', color: '#ec4899' },
  { name: 'Aditi', relationshipType: 'family', avatar: '👩', color: '#a855f7' },
  { name: 'Aarya', relationshipType: 'family', avatar: '👧', color: '#22c55e' },
  { name: 'Sankalp', relationshipType: 'friend', avatar: '🧑', color: '#3b82f6' },
  { name: 'Randoms', relationshipType: 'other', avatar: '🤝', color: '#64748b' },
];

type Row = [day: number, amount: number, category: string, person: string | null, note: string | null];

/** August 2026 — mirrors the kind of month the sheet held. */
const AUGUST: Row[] = [
  [1, 599, 'Bills / Recharge', 'Me', 'Mobile recharge'],
  [2, 484, 'Outside Food', 'Sankalp', 'Lunch'],
  [3, 250, 'Ciggs / Alc', 'Me', null],
  [4, 1200, 'Shopping', null, 'Kurta'],
  [5, 320, 'Fruits / Veggies', 'Mummy', 'Weekly veggies'],
  [5, 90, 'Transport', 'Me', 'Auto'],
  [7, 10000, 'Investment', 'Me', 'SIP'],
  [7, 640, 'Outside Food', 'Aditi', 'Cafe'],
  [8, 430, 'Ciggs / Alc', 'Sankalp', null],
  [9, 268, 'Fruits / Veggies', 'Mummy', null],
  [10, 1543, 'Shopping', 'Aarya', 'School supplies'],
  [11, 210, 'Transport', 'Me', 'Cab'],
  [12, 990, 'Bills / Recharge', null, 'Electricity'],
  [14, 520, 'Misc', 'Randoms', 'Gift'],
  [15, 1600, 'Shopping', 'Sankalp', null],
  [16, 380, 'Outside Food', 'Me', 'Dinner'],
  [17, 251, 'Ciggs / Alc', 'Me', null],
  [19, 450, 'Transport', 'Sankalp', 'Cab'],
  [20, 617, 'Outside Food', 'Aarya', 'Pizza'],
  [21, 150, 'Transport', 'Me', 'Metro'],
  [22, 1620, 'Misc', 'Mummy', 'Medicines'],
  [22, 50, 'Transport', 'Me', null],
  [23, 800, 'Outside Food', 'Sankalp', 'Dinner'],
  [23, 500, 'Shopping', 'Me', null],
  [23, 1000, 'Ciggs / Alc', 'Me', null],
];

/** July 2026 — gives the month-over-month comparison something to compare to. */
const JULY: Row[] = [
  [2, 549, 'Bills / Recharge', 'Me', null],
  [4, 1800, 'Shopping', 'Aditi', null],
  [6, 10000, 'Investment', 'Me', 'SIP'],
  [8, 420, 'Outside Food', 'Sankalp', null],
  [11, 300, 'Fruits / Veggies', 'Mummy', null],
  [14, 780, 'Outside Food', 'Me', null],
  [18, 260, 'Transport', 'Me', null],
  [21, 1350, 'Misc', 'Randoms', null],
  [25, 640, 'Ciggs / Alc', 'Me', null],
  [28, 900, 'Shopping', 'Aarya', null],
];

async function main() {
  const [existing] = await db.select().from(users).where(eq(users.email, EMAIL)).limit(1);

  if (existing) {
    console.log(`↻ Resetting demo data for ${EMAIL}`);
    // Only the transactions are wiped; categories/people the user edited stay.
    const owned = await db.select({ id: expenses.id }).from(expenses).where(eq(expenses.userId, existing.id));
    for (const e of owned) await db.delete(expensePeople).where(eq(expensePeople.expenseId, e.id));
    await db.delete(expenses).where(eq(expenses.userId, existing.id));
  }

  const user =
    existing ??
    (await (async () => {
      const [created] = await db
        .insert(users)
        .values({ name: 'Demo', email: EMAIL, passwordHash: await hashPassword(PASSWORD) })
        .returning();
      await bootstrapUser(created.id);
      return created;
    })());

  // Add the friends/family beyond the "Me" that bootstrap creates.
  const havePeople = await db.select().from(people).where(eq(people.userId, user.id));
  for (const [i, p] of EXTRA_PEOPLE.entries()) {
    if (havePeople.some((x) => x.name === p.name)) continue;
    await db.insert(people).values({ ...p, userId: user.id, sortOrder: havePeople.length + i });
  }

  const cats = await db.select().from(categories).where(eq(categories.userId, user.id));
  const ppl = await db.select().from(people).where(eq(people.userId, user.id));
  const catId = (name: string) => cats.find((c) => c.name === name)?.id;
  const personId = (name: string) => ppl.find((p) => p.name === name)?.id;

  let inserted = 0;
  for (const [month, rows] of [['2026-08', AUGUST], ['2026-07', JULY]] as const) {
    for (const [day, amount, category, person, note] of rows) {
      const categoryId = catId(category);
      if (!categoryId) continue;
      const [row] = await db
        .insert(expenses)
        .values({
          userId: user.id,
          amountMinor: toMinor(amount),
          categoryId,
          expenseDate: `${month}-${String(day).padStart(2, '0')}`,
          note,
          source: 'manual',
        })
        .returning({ id: expenses.id });

      const pid = person ? personId(person) : undefined;
      if (pid) await db.insert(expensePeople).values({ expenseId: row.id, personId: pid });
      inserted++;
    }
  }

  const total = [...AUGUST, ...JULY].reduce((s, r) => s + r[1], 0);
  console.log(`✅ Seeded ${inserted} expenses (₹${total.toLocaleString('en-IN')}) for ${EMAIL}`);
  console.log(`   Sign in with: ${EMAIL} / ${PASSWORD}`);
  await closeDb();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
