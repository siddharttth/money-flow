import 'dotenv/config';
import { db, closeDb } from './index';
import { users, categories, people, expenses, expensePeople, ledgerEntries } from './schema';
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
  { name: 'Mummy', relationshipType: 'family', color: '#a85a76' },
  { name: 'Aditi', relationshipType: 'family', color: '#7d6098' },
  { name: 'Aarya', relationshipType: 'family', color: '#5f8a5a' },
  { name: 'Sankalp', relationshipType: 'friend', color: '#4a7a96' },
  { name: 'Randoms', relationshipType: 'other', color: '#6b7280' },
];

type Row = [day: number, amount: number, category: string, person: string | null, note: string | null];

/** August 2026 — mirrors the kind of month the sheet held. */
const AUGUST: Row[] = [
  [1, 599, 'Bills / Recharge', 'Me', 'Mobile recharge'],
  [2, 484, 'Outside Food', 'Sankalp', 'Lunch'],
  // Three small runs on one day — the ledger folds these into a single
  // ₹430 row with the entries a tap away.
  [3, 250, 'Ciggs / Alc', 'Me', null],
  [3, 120, 'Ciggs / Alc', 'Me', null],
  [3, 60, 'Ciggs / Alc', 'Me', null],
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

/** June 2026 — needed for the three-month momentum baseline. */
const JUNE: Row[] = [
  [1, 599, 'Bills / Recharge', 'Me', 'Mobile recharge'],
  [3, 220, 'Outside Food', 'Me', 'Chai'],
  [5, 10000, 'Investment', 'Me', 'SIP'],
  [9, 310, 'Fruits / Veggies', 'Mummy', null],
  [12, 1250, 'Shopping', 'Aditi', null],
  [15, 180, 'Transport', 'Me', 'Metro'],
  [16, 240, 'Outside Food', 'Me', 'Chai'],
  [19, 720, 'Misc', 'Randoms', null],
  [23, 540, 'Ciggs / Alc', 'Sankalp', null],
  [27, 460, 'Outside Food', 'Aarya', null],
];

/** May 2026 — the far end of the trailing window and the 12-month chart. */
const MAY: Row[] = [
  [2, 549, 'Bills / Recharge', 'Me', null],
  [6, 10000, 'Investment', 'Me', 'SIP'],
  [8, 260, 'Outside Food', 'Me', 'Chai'],
  [13, 2100, 'Shopping', 'Aarya', 'Shoes'],
  [17, 340, 'Fruits / Veggies', 'Mummy', null],
  [20, 130, 'Transport', 'Me', 'Auto'],
  [24, 880, 'Misc', 'Mummy', 'Medicines'],
  [29, 410, 'Ciggs / Alc', 'Me', null],
];

/** A handful of loans, so the ledger and its analytics are not empty. */
const LEDGER: [month: string, day: number, direction: 'out' | 'in', amount: number, person: string, note: string | null][] = [
  ['2026-07', 12, 'out', 3000, 'Sankalp', 'Trip advance'],
  ['2026-07', 30, 'in', 1000, 'Sankalp', 'Part settled'],
  ['2026-08', 6, 'out', 1500, 'Randoms', null],
  ['2026-08', 18, 'in', 2500, 'Aditi', 'Borrowed for rent'],
];

async function main() {
  const [existing] = await db.select().from(users).where(eq(users.email, EMAIL)).limit(1);

  if (existing) {
    console.log(`↻ Resetting demo data for ${EMAIL}`);
    // Only the transactions are wiped; categories/people the user edited stay.
    const owned = await db.select({ id: expenses.id }).from(expenses).where(eq(expenses.userId, existing.id));
    for (const e of owned) await db.delete(expensePeople).where(eq(expensePeople.expenseId, e.id));
    await db.delete(expenses).where(eq(expenses.userId, existing.id));
    await db.delete(ledgerEntries).where(eq(ledgerEntries.userId, existing.id));
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
  for (const [month, rows] of [
    ['2026-08', AUGUST],
    ['2026-07', JULY],
    ['2026-06', JUNE],
    ['2026-05', MAY],
  ] as const) {
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

  for (const [month, day, direction, amount, person, note] of LEDGER) {
    const pid = personId(person);
    if (!pid) continue;
    await db.insert(ledgerEntries).values({
      userId: user.id,
      personId: pid,
      direction,
      amountMinor: toMinor(amount),
      entryDate: `${month}-${String(day).padStart(2, '0')}`,
      note,
    });
  }

  const total = [...AUGUST, ...JULY, ...JUNE, ...MAY].reduce((s, r) => s + r[1], 0);
  console.log(`✅ Seeded ${inserted} expenses (₹${total.toLocaleString('en-IN')}) for ${EMAIL}`);
  console.log(`   Sign in with: ${EMAIL} / ${PASSWORD}`);
  await closeDb();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
