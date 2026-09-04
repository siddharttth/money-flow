import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeTestDb } from './helpers/db';

const testDb = await makeTestDb();
vi.mock('@/db', () => ({ db: testDb }));

const { users, categories, people, expenses, expensePeople } = await import('@/db/schema');
const { createExpense } = await import('@/lib/expenses');
const { getPersonBreakdown, getPersonCategoryBreakdown, listPersonExpenses, getTotal } = await import(
  '@/lib/analytics'
);
const { eq, and } = await import('drizzle-orm');

let userId: string;
const cat: Record<string, string> = {};
const person: Record<string, string> = {};

async function seed() {
  await testDb.delete(expensePeople);
  await testDb.delete(expenses);
  await testDb.delete(people);
  await testDb.delete(categories);
  await testDb.delete(users);

  const [user] = await testDb
    .insert(users)
    .values({ name: 'Test', email: `s${Math.random()}@example.com`, passwordHash: 'x' })
    .returning();
  userId = user.id;

  for (const [i, name] of ['Outside Food', 'Shopping'].entries()) {
    const [row] = await testDb
      .insert(categories)
      .values({ userId, name, slug: name.toLowerCase().replace(/ /g, '-'), sortOrder: i })
      .returning();
    cat[name] = row.id;
  }

  for (const [i, name] of ['Me', 'A', 'B', 'C'].entries()) {
    const [row] = await testDb
      .insert(people)
      .values({ userId, name, isSelf: name === 'Me', sortOrder: i })
      .returning();
    person[name] = row.id;
  }
}

beforeEach(seed);

const AUG = { start: '2026-08-01', end: '2026-08-31' };

const add = (amount: number, names: string[], date = '2026-08-05', category = 'Outside Food') =>
  createExpense(userId, {
    amount,
    categoryId: cat[category],
    expenseDate: date,
    note: null,
    personIds: names.map((n) => person[n]),
  });

const shares = async () => {
  const { people: rows } = await getPersonBreakdown({ userId, ...AUG });
  return Object.fromEntries(rows.map((r) => [r.name, r.totalMinor]));
};

describe('splitting an expense between people', () => {
  it('divides evenly — ₹75 across three is ₹25 each, not ₹75 each', async () => {
    await add(75, ['A', 'B', 'C']);
    expect(await shares()).toEqual({ A: 2500, B: 2500, C: 2500 });
  });

  it('gives one person the whole amount', async () => {
    await add(75, ['A']);
    expect(await shares()).toEqual({ A: 7500 });
  });

  it('halves a two-way expense', async () => {
    await add(75, ['A', 'B']);
    expect(await shares()).toEqual({ A: 3750, B: 3750 });
  });
});

describe('the remainder', () => {
  it('is handed out to the paisa rather than dropped', async () => {
    // ₹100 three ways is 3333.33 paise each; someone has to carry the extra.
    await add(100, ['A', 'B', 'C']);
    const s = await shares();
    const values = Object.values(s).sort((x, y) => y - x);

    expect(values).toEqual([3334, 3333, 3333]);
    expect(values.reduce((a, b) => a + b, 0)).toBe(10_000);
  });

  it('splits the same way every time it is read', async () => {
    await add(100, ['A', 'B', 'C']);
    const first = await shares();
    const second = await shares();
    expect(second).toEqual(first);
  });

  it('holds for an amount that divides badly by seven', async () => {
    await testDb
      .insert(people)
      .values(['D', 'E', 'F'].map((name, i) => ({ userId, name, sortOrder: 10 + i })))
      .returning()
      .then((rows) => rows.forEach((r) => (person[r.name] = r.id)));

    await add(1000, ['Me', 'A', 'B', 'C', 'D', 'E', 'F']);
    const values = Object.values(await shares());

    expect(values).toHaveLength(7);
    expect(values.reduce((a, b) => a + b, 0)).toBe(100_000);
    // Nobody is more than a paisa off the even share.
    for (const v of values) expect(Math.abs(v - 100_000 / 7)).toBeLessThan(1);
  });
});

describe('the totals now reconcile', () => {
  it('adds every share plus the untagged remainder back to the grand total', async () => {
    await add(75, ['A', 'B', 'C']);
    await add(100, ['A', 'B', 'C']);
    await add(500, ['Me']);
    await add(1234, ['A', 'B'], '2026-08-09', 'Shopping');

    // An expense with nobody on it at all.
    await testDb.insert(expenses).values({
      userId,
      amountMinor: 4200,
      categoryId: cat['Shopping'],
      expenseDate: '2026-08-10',
    });

    const { people: rows, unassignedMinor, grandTotalMinor } = await getPersonBreakdown({ userId, ...AUG });
    const summed = rows.reduce((s, r) => s + r.totalMinor, 0) + unassignedMinor;

    expect(grandTotalMinor).toBe((await getTotal({ userId, ...AUG })).totalMinor);
    expect(summed).toBe(grandTotalMinor);
  });

  it('counts a shared expense once for the month, as it always did', async () => {
    await add(2000, ['A', 'B', 'C']);
    expect((await getTotal({ userId, ...AUG })).totalMinor).toBe(200_000);
  });

  it('still counts the transaction once per person, not the share', async () => {
    await add(75, ['A', 'B', 'C']);
    const { people: rows } = await getPersonBreakdown({ userId, ...AUG });
    for (const r of rows) expect(r.count).toBe(1);
  });
});

describe('a per-person category breakdown', () => {
  it('carries shares, and adds up to that person’s total', async () => {
    await add(75, ['A', 'B', 'C']);
    await add(300, ['A'], '2026-08-06', 'Shopping');

    const rows = await getPersonCategoryBreakdown({ userId, ...AUG, personId: person['A'] });
    expect(Object.fromEntries(rows.map((r) => [r.name, r.totalMinor]))).toEqual({
      Shopping: 30_000,
      'Outside Food': 2500,
    });

    const { people: all } = await getPersonBreakdown({ userId, ...AUG });
    expect(rows.reduce((s, r) => s + r.totalMinor, 0)).toBe(all.find((p) => p.name === 'A')!.totalMinor);
  });
});

describe('the expense list behind a person', () => {
  it('gives each row the share, the whole bill, and how many ways it went', async () => {
    await add(75, ['A', 'B', 'C']);

    const [row] = await listPersonExpenses({ userId, ...AUG, personId: person['A'] });
    expect(row).toMatchObject({ shareMinor: 2500, amountMinor: 7500, participants: 3 });
  });

  it('reports a solo expense as one way, not a split', async () => {
    await add(500, ['A']);
    const [row] = await listPersonExpenses({ userId, ...AUG, personId: person['A'] });
    expect(row).toMatchObject({ shareMinor: 50_000, amountMinor: 50_000, participants: 1 });
  });

  it('adds up to the same figure the breakdown reports', async () => {
    await add(100, ['A', 'B', 'C']);
    await add(75, ['A', 'B']);
    await add(19, ['A']);

    const rows = await listPersonExpenses({ userId, ...AUG, personId: person['A'] });
    const { people: all } = await getPersonBreakdown({ userId, ...AUG });

    expect(rows.reduce((s, r) => s + r.shareMinor, 0)).toBe(all.find((p) => p.name === 'A')!.totalMinor);
  });
});

describe('an explicit share', () => {
  it('overrides the even split wherever one is stored', async () => {
    const e = await add(90, ['A', 'B', 'C']);

    // The column has been there since the beginning for exactly this.
    await testDb
      .update(expensePeople)
      .set({ shareAmountMinor: 5000 })
      .where(and(eq(expensePeople.expenseId, e.id), eq(expensePeople.personId, person['A'])));

    const s = await shares();
    expect(s['A']).toBe(5000);
    expect(s['B']).toBe(3000);
    expect(s['C']).toBe(3000);
  });
});

describe('recording the others’ shares as a loan', () => {
  it('creates one ledger entry per person who is not me, for their share', async () => {
    const { ledgerEntries } = await import('@/db/schema');

    await createExpense(userId, {
      amount: 900,
      categoryId: cat['Outside Food'],
      expenseDate: '2026-08-16',
      note: 'Dinner',
      personIds: [person['Me'], person['A'], person['B']],
      lendShares: true,
    });

    const rows = await testDb.select().from(ledgerEntries).where(eq(ledgerEntries.userId, userId));

    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.direction === 'out')).toBe(true);
    expect(rows.reduce((s, r) => s + r.amountMinor, 0)).toBe(60_000);
    expect(rows[0].note).toBe('Share of Dinner');
  });

  it('leaves me out of it — you cannot lend to yourself', async () => {
    const { ledgerEntries } = await import('@/db/schema');

    await createExpense(userId, {
      amount: 900,
      categoryId: cat['Outside Food'],
      expenseDate: '2026-08-16',
      note: null,
      personIds: [person['Me'], person['A'], person['B']],
      lendShares: true,
    });

    const rows = await testDb.select().from(ledgerEntries).where(eq(ledgerEntries.userId, userId));
    expect(rows.some((r) => r.personId === person['Me'])).toBe(false);
  });

  it('hands out the same shares the analytics do, to the paisa', async () => {
    const { ledgerEntries } = await import('@/db/schema');

    await createExpense(userId, {
      amount: 100,
      categoryId: cat['Outside Food'],
      expenseDate: '2026-08-16',
      note: null,
      personIds: [person['A'], person['B'], person['C']],
      lendShares: true,
    });

    const rows = await testDb.select().from(ledgerEntries).where(eq(ledgerEntries.userId, userId));
    const byPerson = Object.fromEntries(rows.map((r) => [r.personId, r.amountMinor]));
    const s = await shares();

    for (const name of ['A', 'B', 'C']) {
      expect(byPerson[person[name]]).toBe(s[name]);
    }
    expect(rows.reduce((a, r) => a + r.amountMinor, 0)).toBe(10_000);
  });

  it('does nothing at all when the expense is only yours', async () => {
    const { ledgerEntries } = await import('@/db/schema');

    await createExpense(userId, {
      amount: 500,
      categoryId: cat['Outside Food'],
      expenseDate: '2026-08-16',
      note: null,
      personIds: [person['A']],
      lendShares: true,
    });

    expect(await testDb.select().from(ledgerEntries).where(eq(ledgerEntries.userId, userId))).toHaveLength(0);
  });

  it('stays off unless asked — the flag is opt-in', async () => {
    const { ledgerEntries } = await import('@/db/schema');

    await createExpense(userId, {
      amount: 900,
      categoryId: cat['Outside Food'],
      expenseDate: '2026-08-16',
      note: null,
      personIds: [person['A'], person['B']],
    });

    expect(await testDb.select().from(ledgerEntries).where(eq(ledgerEntries.userId, userId))).toHaveLength(0);
  });
});
