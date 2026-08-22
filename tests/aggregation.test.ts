import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeTestDb } from './helpers/db';

/**
 * The service layer imports `@/db`. Pointing that module at an in-process
 * Postgres lets these tests run the REAL createExpense/analytics code paths
 * against real SQL — which is the only way to prove the double-counting rule.
 */
const testDb = await makeTestDb();
vi.mock('@/db', () => ({ db: testDb }));

const { users, categories, people, expenses, expensePeople } = await import('@/db/schema');
const { createExpense, updateExpense, deleteExpense, listExpenses, duplicateExpense } = await import('@/lib/expenses');
const { getTotal, getCategoryBreakdown, getPersonBreakdown, getSummary, getDailyTotals } = await import(
  '@/lib/analytics'
);
const { eq } = await import('drizzle-orm');

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
    .values({ name: 'Test', email: `t${Math.random()}@example.com`, passwordHash: 'x' })
    .returning();
  userId = user.id;

  for (const [i, name] of ['Outside Food', 'Shopping', 'Misc', 'Transport', 'Investment'].entries()) {
    const [row] = await testDb
      .insert(categories)
      .values({ userId, name, slug: name.toLowerCase().replace(/ /g, '-'), sortOrder: i })
      .returning();
    cat[name] = row.id;
  }

  for (const [i, name] of ['Me', 'Sankalp', 'Mummy', 'Aditi', 'Aarya'].entries()) {
    const [row] = await testDb
      .insert(people)
      .values({ userId, name, isSelf: name === 'Me', sortOrder: i })
      .returning();
    person[name] = row.id;
  }
}

beforeEach(seed);

const AUG = { start: '2026-08-01', end: '2026-08-31' };
const JUL = { start: '2026-07-01', end: '2026-07-31' };

/** The exact scenario from the spec. */
async function seedScenario() {
  await createExpense(userId, {
    amount: 800,
    categoryId: cat['Outside Food'],
    expenseDate: '2026-08-23',
    note: 'Dinner',
    personIds: [person['Sankalp']],
  });
  await createExpense(userId, {
    amount: 500,
    categoryId: cat['Shopping'],
    expenseDate: '2026-08-23',
    note: null,
    personIds: [person['Me']],
  });
  await createExpense(userId, {
    amount: 1620,
    categoryId: cat['Misc'],
    expenseDate: '2026-08-22',
    note: null,
    personIds: [person['Mummy']],
  });
}

describe('expenses with no person default to "Me"', () => {
  it('assigns "Me" when the person list is omitted entirely', async () => {
    const e = await createExpense(userId, {
      amount: 1200,
      categoryId: cat['Shopping'],
      expenseDate: '2026-08-15',
      note: null,
      personIds: [],
    });

    expect(e.people.map((p) => p.name)).toEqual(['Me']);

    const { people: ppl, unassignedMinor, grandTotalMinor } = await getPersonBreakdown({ userId, ...AUG });
    expect(ppl.find((p) => p.name === 'Me')!.totalMinor).toBe(120000);
    expect(unassignedMinor).toBe(0);
    // The defaulting must not change what was actually spent.
    expect(grandTotalMinor).toBe(120000);
  });

  it('leaves an explicit person alone', async () => {
    const e = await createExpense(userId, {
      amount: 800,
      categoryId: cat['Outside Food'],
      expenseDate: '2026-08-23',
      note: null,
      personIds: [person['Sankalp']],
    });
    // "Me" is a fallback, never an addition.
    expect(e.people.map((p) => p.name)).toEqual(['Sankalp']);
  });

  it('does not add "Me" to a multi-person expense', async () => {
    const e = await createExpense(userId, {
      amount: 2000,
      categoryId: cat['Outside Food'],
      expenseDate: '2026-08-10',
      note: null,
      personIds: [person['Sankalp'], person['Aarya']],
    });

    expect(e.people.map((p) => p.name).sort()).toEqual(['Aarya', 'Sankalp']);
    expect((await getTotal({ userId, ...AUG })).totalMinor).toBe(200000);
  });

  it('keeps a duplicated expense on its original person', async () => {
    const e = await createExpense(userId, {
      amount: 500,
      categoryId: cat['Misc'],
      expenseDate: '2026-08-05',
      note: null,
      personIds: [person['Mummy']],
    });
    const copy = await duplicateExpense(userId, e.id);
    expect(copy.people.map((p) => p.name)).toEqual(['Mummy']);
  });
});

describe('the sample scenario', () => {
  beforeEach(seedScenario);

  it('totals ₹2,920 — person totals are NOT added on top of category totals', async () => {
    const { totalMinor, count } = await getTotal({ userId, ...AUG });
    expect(totalMinor).toBe(292000);
    expect(count).toBe(3);
  });

  it('breaks down by category, summing to the grand total', async () => {
    const rows = await getCategoryBreakdown({ userId, ...AUG });
    const byName = Object.fromEntries(rows.map((r) => [r.name, r.totalMinor]));

    expect(byName['Outside Food']).toBe(80000);
    expect(byName['Shopping']).toBe(50000);
    expect(byName['Misc']).toBe(162000);
    // Categories partition the expenses — they must sum to the real total.
    expect(rows.reduce((s, r) => s + r.totalMinor, 0)).toBe(292000);
  });

  it('breaks down by person as an independent dimension', async () => {
    const { people: rows, grandTotalMinor } = await getPersonBreakdown({ userId, ...AUG });
    const byName = Object.fromEntries(rows.map((r) => [r.name, r.totalMinor]));

    expect(byName['Sankalp']).toBe(80000);
    expect(byName['Me']).toBe(50000);
    expect(byName['Mummy']).toBe(162000);
    // Reported separately so nothing can add the two dimensions together.
    expect(grandTotalMinor).toBe(292000);
  });

  it('answers all three questions from the same ₹800 transaction', async () => {
    const cats = await getCategoryBreakdown({ userId, ...AUG });
    const { people: ppl } = await getPersonBreakdown({ userId, ...AUG });

    expect(cats.find((c) => c.name === 'Outside Food')!.totalMinor).toBe(80000);
    expect(ppl.find((p) => p.name === 'Sankalp')!.totalMinor).toBe(80000);
    // ...and the expense itself exists exactly once.
    const { total } = await listExpenses({ userId, categoryIds: [cat['Outside Food']], ...AUG });
    expect(total).toBe(1);
  });
});

describe('multiple people on one expense', () => {
  it('never multiplies actual spending', async () => {
    await createExpense(userId, {
      amount: 2000,
      categoryId: cat['Outside Food'],
      expenseDate: '2026-08-10',
      note: null,
      personIds: [person['Me'], person['Sankalp'], person['Aarya']],
    });

    // THE assertion: 3 participants must not turn ₹2,000 into ₹6,000.
    const { totalMinor, count } = await getTotal({ userId, ...AUG });
    expect(totalMinor).toBe(200000);
    expect(count).toBe(1);

    const cats = await getCategoryBreakdown({ userId, ...AUG });
    expect(cats.reduce((s, c) => s + c.totalMinor, 0)).toBe(200000);

    // Each person is associated with the full amount — that IS the semantic —
    // which is why the association total (₹6,000) is reported separately.
    const { people: ppl, grandTotalMinor } = await getPersonBreakdown({ userId, ...AUG });
    expect(ppl).toHaveLength(3);
    expect(ppl.every((p) => p.totalMinor === 200000)).toBe(true);
    expect(ppl.reduce((s, p) => s + p.totalMinor, 0)).toBe(600000);
    expect(grandTotalMinor).toBe(200000);
  });

  it('counts an expense once when filtering by several of its people', async () => {
    await createExpense(userId, {
      amount: 2000,
      categoryId: cat['Outside Food'],
      expenseDate: '2026-08-10',
      note: null,
      personIds: [person['Me'], person['Sankalp']],
    });

    const filtered = await getTotal({ userId, ...AUG, personIds: [person['Me'], person['Sankalp']] });
    expect(filtered.totalMinor).toBe(200000);
    expect(filtered.count).toBe(1);
  });
});

describe('editing keeps every aggregation in sync', () => {
  let id: string;

  beforeEach(async () => {
    const e = await createExpense(userId, {
      amount: 800,
      categoryId: cat['Outside Food'],
      expenseDate: '2026-08-23',
      note: 'Dinner',
      personIds: [person['Sankalp']],
    });
    id = e.id;
  });

  it('updates totals when the amount changes', async () => {
    await updateExpense(userId, id, { amount: 1000 });

    expect((await getTotal({ userId, ...AUG })).totalMinor).toBe(100000);
    const cats = await getCategoryBreakdown({ userId, ...AUG });
    expect(cats.find((c) => c.name === 'Outside Food')!.totalMinor).toBe(100000);
    const { people: ppl } = await getPersonBreakdown({ userId, ...AUG });
    expect(ppl.find((p) => p.name === 'Sankalp')!.totalMinor).toBe(100000);
  });

  it('moves the money when the category changes', async () => {
    await updateExpense(userId, id, { categoryId: cat['Shopping'] });

    const cats = await getCategoryBreakdown({ userId, ...AUG });
    expect(cats.find((c) => c.name === 'Outside Food')).toBeUndefined();
    expect(cats.find((c) => c.name === 'Shopping')!.totalMinor).toBe(80000);
    // The person association is untouched by a category change.
    const { people: ppl } = await getPersonBreakdown({ userId, ...AUG });
    expect(ppl.find((p) => p.name === 'Sankalp')!.totalMinor).toBe(80000);
  });

  it('moves the association when the person changes', async () => {
    await updateExpense(userId, id, { personIds: [person['Aditi']] });

    const { people: ppl } = await getPersonBreakdown({ userId, ...AUG });
    expect(ppl.find((p) => p.name === 'Sankalp')).toBeUndefined();
    expect(ppl.find((p) => p.name === 'Aditi')!.totalMinor).toBe(80000);
    // The category and the grand total are unchanged.
    expect((await getTotal({ userId, ...AUG })).totalMinor).toBe(80000);
  });

  it('moves the expense between months when the date changes', async () => {
    await updateExpense(userId, id, { expenseDate: '2026-07-15' });

    expect((await getTotal({ userId, ...AUG })).totalMinor).toBe(0);
    expect((await getTotal({ userId, ...JUL })).totalMinor).toBe(80000);
  });

  it('falls back to "Me" when the person list is emptied', async () => {
    await updateExpense(userId, id, { personIds: [] });

    const { people: ppl, unassignedMinor } = await getPersonBreakdown({ userId, ...AUG });
    expect(ppl.map((p) => p.name)).toEqual(['Me']);
    expect(ppl[0].totalMinor).toBe(80000);
    // Nothing is left dangling in the unassigned bucket.
    expect(unassignedMinor).toBe(0);
  });
});

describe('deletion', () => {
  it('removes the expense from every aggregation', async () => {
    const e = await createExpense(userId, {
      amount: 800,
      categoryId: cat['Outside Food'],
      expenseDate: '2026-08-23',
      note: null,
      personIds: [person['Sankalp']],
    });

    await deleteExpense(userId, e.id);

    expect((await getTotal({ userId, ...AUG })).totalMinor).toBe(0);
    expect(await getCategoryBreakdown({ userId, ...AUG })).toHaveLength(0);
    expect((await getPersonBreakdown({ userId, ...AUG })).people).toHaveLength(0);
    expect((await listExpenses({ userId, ...AUG })).total).toBe(0);
  });

  it('is a soft delete — the row survives for recovery', async () => {
    const e = await createExpense(userId, {
      amount: 800,
      categoryId: cat['Outside Food'],
      expenseDate: '2026-08-23',
      note: null,
      personIds: [],
    });
    await deleteExpense(userId, e.id);

    const [row] = await testDb.select().from(expenses).where(eq(expenses.id, e.id));
    expect(row).toBeDefined();
    expect(row.deletedAt).not.toBeNull();
  });
});

describe('month isolation', () => {
  it('does not leak August data into July', async () => {
    await createExpense(userId, { amount: 800, categoryId: cat['Outside Food'], expenseDate: '2026-08-01', note: null, personIds: [] });
    await createExpense(userId, { amount: 500, categoryId: cat['Outside Food'], expenseDate: '2026-07-31', note: null, personIds: [] });

    expect((await getTotal({ userId, ...AUG })).totalMinor).toBe(80000);
    expect((await getTotal({ userId, ...JUL })).totalMinor).toBe(50000);
  });

  it('includes both boundary days of the month', async () => {
    await createExpense(userId, { amount: 100, categoryId: cat['Misc'], expenseDate: '2026-08-01', note: null, personIds: [] });
    await createExpense(userId, { amount: 100, categoryId: cat['Misc'], expenseDate: '2026-08-31', note: null, personIds: [] });

    expect((await getTotal({ userId, ...AUG })).count).toBe(2);
  });
});

describe('user isolation', () => {
  it('never mixes two accounts together', async () => {
    await createExpense(userId, { amount: 800, categoryId: cat['Outside Food'], expenseDate: '2026-08-23', note: null, personIds: [] });

    const [other] = await testDb
      .insert(users)
      .values({ name: 'Other', email: `o${Math.random()}@example.com`, passwordHash: 'x' })
      .returning();

    expect((await getTotal({ userId: other.id, ...AUG })).totalMinor).toBe(0);
    expect((await listExpenses({ userId: other.id, ...AUG })).total).toBe(0);
  });

  it('refuses an expense pointing at another account\'s category', async () => {
    const [other] = await testDb
      .insert(users)
      .values({ name: 'Other', email: `o${Math.random()}@example.com`, passwordHash: 'x' })
      .returning();
    const [foreign] = await testDb
      .insert(categories)
      .values({ userId: other.id, name: 'Theirs', slug: 'theirs' })
      .returning();

    await expect(
      createExpense(userId, { amount: 100, categoryId: foreign.id, expenseDate: '2026-08-01', note: null, personIds: [] }),
    ).rejects.toThrow(/does not exist/);
  });
});

describe('decimal amounts', () => {
  it('adds up exactly, with no float drift', async () => {
    for (const amount of [0.1, 0.2, 1234.56, 484.44]) {
      await createExpense(userId, { amount, categoryId: cat['Misc'], expenseDate: '2026-08-05', note: null, personIds: [] });
    }
    // 0.1 + 0.2 + 1234.56 + 484.44 = 1719.30 exactly
    expect((await getTotal({ userId, ...AUG })).totalMinor).toBe(171930);
  });
});

describe('summary + daily totals', () => {
  beforeEach(seedScenario);

  it('reports the month, its transactions and the top category', async () => {
    const s = await getSummary(userId, '2026-08');
    expect(s.totalMinor).toBe(292000);
    expect(s.transactionCount).toBe(3);
    expect(s.topCategory?.name).toBe('Misc'); // ₹1,620 is the largest
    // 22 Aug is ₹1,620 — bigger than 23 Aug's ₹800 + ₹500.
    expect(s.topDay?.date).toBe('2026-08-22');
    expect(s.topDay?.totalMinor).toBe(162000);
  });

  it('compares against the previous month', async () => {
    await createExpense(userId, { amount: 1460, categoryId: cat['Misc'], expenseDate: '2026-07-10', note: null, personIds: [] });

    const s = await getSummary(userId, '2026-08');
    expect(s.previousMonth.totalMinor).toBe(146000);
    // 2920 vs 1460 = +100%
    expect(s.changePct).toBeCloseTo(100, 1);
  });

  it('groups daily totals correctly', async () => {
    const daily = await getDailyTotals({ userId, ...AUG });
    expect(daily).toEqual([
      { date: '2026-08-22', totalMinor: 162000, count: 1 },
      { date: '2026-08-23', totalMinor: 130000, count: 2 },
    ]);
  });
});

describe('filtering', () => {
  beforeEach(seedScenario);

  it('filters by category without touching other dimensions', async () => {
    const { totalMinor } = await getTotal({ userId, ...AUG, categoryIds: [cat['Outside Food']] });
    expect(totalMinor).toBe(80000);
  });

  it('filters by person', async () => {
    const { totalMinor } = await getTotal({ userId, ...AUG, personIds: [person['Sankalp']] });
    expect(totalMinor).toBe(80000);
  });

  it('has nothing unassigned, since expenses default to "Me"', async () => {
    await createExpense(userId, { amount: 1200, categoryId: cat['Shopping'], expenseDate: '2026-08-15', note: null, personIds: [] });

    const { totalMinor, count } = await getTotal({ userId, ...AUG, personIds: ['none'] });
    expect(totalMinor).toBe(0);
    expect(count).toBe(0);
  });

  it('combines a category and a person filter', async () => {
    const { totalMinor } = await getTotal({
      userId,
      ...AUG,
      categoryIds: [cat['Outside Food']],
      personIds: [person['Me']],
    });
    // The ₹800 Outside Food expense belongs to Sankalp, not Me.
    expect(totalMinor).toBe(0);
  });
});

describe('duplicate', () => {
  it('creates a second, independent transaction with the same shape', async () => {
    const e = await createExpense(userId, {
      amount: 800,
      categoryId: cat['Outside Food'],
      expenseDate: '2026-08-23',
      note: 'Dinner',
      personIds: [person['Sankalp']],
    });

    const copy = await duplicateExpense(userId, e.id);

    expect(copy.id).not.toBe(e.id);
    expect(copy.amount).toBe(800);
    expect(copy.people.map((p) => p.name)).toEqual(['Sankalp']);
    expect((await getTotal({ userId, ...AUG })).totalMinor).toBe(160000);
  });
});

describe('validation at the service layer', () => {
  it('rejects a disabled category', async () => {
    await testDb.update(categories).set({ isActive: false }).where(eq(categories.id, cat['Shopping']));

    await expect(
      createExpense(userId, { amount: 100, categoryId: cat['Shopping'], expenseDate: '2026-08-01', note: null, personIds: [] }),
    ).rejects.toThrow(/disabled/);
  });

  it('rejects an unknown person', async () => {
    await expect(
      createExpense(userId, {
        amount: 100,
        categoryId: cat['Misc'],
        expenseDate: '2026-08-01',
        note: null,
        personIds: ['00000000-0000-0000-0000-000000000000'],
      }),
    ).rejects.toThrow(/do not exist/);
  });

  it('404s on another account\'s expense', async () => {
    const e = await createExpense(userId, { amount: 100, categoryId: cat['Misc'], expenseDate: '2026-08-01', note: null, personIds: [] });
    const [other] = await testDb
      .insert(users)
      .values({ name: 'Other', email: `o${Math.random()}@example.com`, passwordHash: 'x' })
      .returning();

    await expect(deleteExpense(other.id, e.id)).rejects.toThrow(/not found/);
  });
});
