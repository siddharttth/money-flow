import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { makeTestDb } from './helpers/db';

const testDb = await makeTestDb();
vi.mock('@/db', () => ({ db: testDb }));

const { users, categories, people, expenses, expensePeople } = await import('@/db/schema');
const { createExpense } = await import('@/lib/expenses');
const { getTotal, getCategoryBreakdown, getPersonBreakdown, getSummary, getMonthlyTotals, getDailyTotals } =
  await import('@/lib/analytics');
const { getFlow } = await import('@/lib/flow');
const { getInvestmentSummary } = await import('@/lib/investments');

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
    .values({ name: 'Test', email: `i${Math.random()}@example.com`, passwordHash: 'x' })
    .returning();
  userId = user.id;

  for (const [i, [name, kind]] of (
    [
      ['Outside Food', 'expense'],
      ['Shopping', 'expense'],
      ['Investment', 'investment'],
      ['Gold', 'investment'],
    ] as const
  ).entries()) {
    const [row] = await testDb
      .insert(categories)
      .values({ userId, name, slug: name.toLowerCase().replace(/ /g, '-'), kind, sortOrder: i })
      .returning();
    cat[name] = row.id;
  }

  for (const [i, name] of ['Me', 'Sankalp'].entries()) {
    const [row] = await testDb
      .insert(people)
      .values({ userId, name, isSelf: name === 'Me', sortOrder: i })
      .returning();
    person[name] = row.id;
  }
}

beforeEach(seed);
afterEach(() => vi.useRealTimers());

const add = (amount: number, category: string, date: string, personIds: string[] = []) =>
  createExpense(userId, { amount, categoryId: cat[category], expenseDate: date, note: null, personIds });

const AUG = { start: '2026-08-01', end: '2026-08-31' };

/** The user's own August: ₹35,013 total of which ₹10,000 was a SIP. */
async function seedAugust() {
  await add(25013, 'Outside Food', '2026-08-05');
  await add(10000, 'Investment', '2026-08-07');
}

describe('investing is not spending', () => {
  it('leaves investment out of the month total', async () => {
    await seedAugust();
    const { totalMinor, count } = await getTotal({ userId, ...AUG });
    expect(totalMinor).toBe(2_501_300);
    expect(count).toBe(1);
  });

  it('leaves it out of the category breakdown, and out of the shares', async () => {
    await seedAugust();
    const rows = await getCategoryBreakdown({ userId, ...AUG });
    expect(rows.map((r) => r.name)).toEqual(['Outside Food']);
    expect(rows[0].share).toBe(1);
  });

  it('leaves it out of the person breakdown and its grand total', async () => {
    await add(500, 'Outside Food', '2026-08-05', [person['Sankalp']]);
    await add(10000, 'Investment', '2026-08-07', [person['Sankalp']]);

    const { people: rows, grandTotalMinor } = await getPersonBreakdown({ userId, ...AUG });
    expect(grandTotalMinor).toBe(50_000);
    expect(rows.find((r) => r.name === 'Sankalp')!.totalMinor).toBe(50_000);
  });

  it('leaves it out of the daily totals', async () => {
    await add(300, 'Outside Food', '2026-08-05');
    await add(10000, 'Investment', '2026-08-05');
    const daily = await getDailyTotals({ userId, ...AUG });
    expect(daily).toEqual([{ date: '2026-08-05', totalMinor: 30_000, count: 1 }]);
  });

  it('leaves it out of the month-over-month trend', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-08-20T10:00:00Z'));
    await add(1000, 'Outside Food', '2026-08-05');
    await add(9000, 'Investment', '2026-08-06');

    const months = await getMonthlyTotals(userId, 3);
    expect(months.find((m) => m.month === '2026-08')!.totalMinor).toBe(100_000);
  });

  it('leaves it out of the summary and everything derived from it', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-08-20T10:00:00Z'));
    await seedAugust();

    const s = await getSummary(userId, '2026-08');
    expect(s.totalMinor).toBe(2_501_300);
    expect(s.transactionCount).toBe(1);
    expect(s.topCategory?.name).toBe('Outside Food');
  });

  it('leaves it out of every flow figure — pace, tickets, cadence', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-08-20T10:00:00Z'));
    await seedAugust();

    const f = await getFlow(userId, '2026-08');
    expect(f.pace.spentMinor).toBe(2_501_300);
    expect(f.tickets.count).toBe(1);
    // The SIP is the largest single amount, but it is not spending.
    expect(f.tickets.largest?.categoryName).toBe('Outside Food');
    // Only 5 Aug saw spending; the 7th was a contribution.
    expect(f.cadence.spendDays).toBe(1);
    expect(f.cadence.busiest?.date).toBe('2026-08-05');
    expect(f.momentum.map((m) => m.name)).not.toContain('Investment');
  });

  it('keeps a category filter honest — asking for the investment category yields nothing', async () => {
    await seedAugust();
    const { totalMinor } = await getTotal({ userId, ...AUG, categoryIds: [cat['Investment']] });
    expect(totalMinor).toBe(0);
  });

  it('can still be asked for everything that moved', async () => {
    await seedAugust();
    const { totalMinor } = await getTotal({ userId, ...AUG, include: 'all' });
    expect(totalMinor).toBe(3_501_300);
  });
});

describe('the investments screen', () => {
  it('reports the month, the lifetime and the split against spending', async () => {
    await seedAugust();
    await add(5000, 'Investment', '2026-07-07');

    const inv = await getInvestmentSummary(userId, '2026-08');

    expect(inv.monthMinor).toBe(1_000_000);
    expect(inv.previousMonthMinor).toBe(500_000);
    expect(inv.lifetimeMinor).toBe(1_500_000);
    expect(inv.contributionCount).toBe(2);
    expect(inv.firstDate).toBe('2026-07-07');
    // The other side of the same month, so the screen can state both.
    expect(inv.monthSpendingMinor).toBe(2_501_300);
  });

  it('averages over the months that saw a contribution, not every month', async () => {
    await add(1000, 'Investment', '2026-06-01');
    await add(3000, 'Investment', '2026-08-01');

    const inv = await getInvestmentSummary(userId, '2026-08');
    expect(inv.activeMonths).toBe(2);
    expect(inv.averageMonthMinor).toBe(200_000);
    expect(inv.byMonth).toEqual([
      { month: '2026-06', totalMinor: 100_000 },
      { month: '2026-08', totalMinor: 300_000 },
    ]);
  });

  it('splits across every investment category, biggest first', async () => {
    await add(1000, 'Investment', '2026-08-01');
    await add(4000, 'Gold', '2026-08-02');
    await add(9999, 'Outside Food', '2026-08-03');

    const inv = await getInvestmentSummary(userId, '2026-08');
    expect(inv.byCategory.map((c) => [c.name, c.totalMinor])).toEqual([
      ['Gold', 400_000],
      ['Investment', 100_000],
    ]);
  });

  it('lists the contributions themselves, newest first', async () => {
    await add(1000, 'Investment', '2026-08-01');
    await add(2000, 'Gold', '2026-08-09');

    const inv = await getInvestmentSummary(userId, '2026-08');
    expect(inv.recent.map((r) => r.date)).toEqual(['2026-08-09', '2026-08-01']);
    expect(inv.recent[0].category.name).toBe('Gold');
  });

  it('is empty rather than broken for an account that invests nothing', async () => {
    await add(500, 'Outside Food', '2026-08-05');
    const inv = await getInvestmentSummary(userId, '2026-08');
    expect(inv).toMatchObject({
      lifetimeMinor: 0,
      monthMinor: 0,
      activeMonths: 0,
      averageMonthMinor: 0,
      contributionCount: 0,
      firstDate: null,
      byCategory: [],
      byMonth: [],
      recent: [],
    });
  });

  it('follows the category, so re-marking one moves its history across', async () => {
    await add(1000, 'Shopping', '2026-08-01');
    expect((await getInvestmentSummary(userId, '2026-08')).monthMinor).toBe(0);
    expect((await getTotal({ userId, ...AUG })).totalMinor).toBe(100_000);

    const { eq } = await import('drizzle-orm');
    await testDb.update(categories).set({ kind: 'investment' }).where(eq(categories.id, cat['Shopping']));

    expect((await getInvestmentSummary(userId, '2026-08')).monthMinor).toBe(100_000);
    expect((await getTotal({ userId, ...AUG })).totalMinor).toBe(0);
  });
});

describe('income is not spending either', () => {
  it('does not report a salary as the month’s spending on the split', async () => {
    const [salary] = await testDb
      .insert(categories)
      .values({ userId, name: 'Salary', slug: 'salary', kind: 'income', sortOrder: 9 })
      .returning();

    await createExpense(userId, {
      amount: 52000,
      categoryId: salary.id,
      expenseDate: '2026-08-01',
      note: null,
      personIds: [],
    });
    await add(2749, 'Outside Food', '2026-08-05');
    await add(10000, 'Investment', '2026-08-07');

    const inv = await getInvestmentSummary(userId, '2026-08');
    expect(inv.monthSpendingMinor).toBe(274_900);
    expect(inv.monthMinor).toBe(1_000_000);
  });
});
