import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { makeTestDb } from './helpers/db';

const testDb = await makeTestDb();
vi.mock('@/db', () => ({ db: testDb }));

const { users, categories, people, expenses, expensePeople, ledgerEntries } = await import('@/db/schema');
const { createExpense } = await import('@/lib/expenses');
const { getFlow, SMALL_TICKET_MINOR } = await import('@/lib/flow');

let userId: string;
const cat: Record<string, string> = {};
const person: Record<string, string> = {};

async function seed() {
  await testDb.delete(expensePeople);
  await testDb.delete(ledgerEntries);
  await testDb.delete(expenses);
  await testDb.delete(people);
  await testDb.delete(categories);
  await testDb.delete(users);

  const [user] = await testDb
    .insert(users)
    .values({ name: 'Test', email: `f${Math.random()}@example.com`, passwordHash: 'x' })
    .returning();
  userId = user.id;

  for (const [i, name] of ['Food', 'Transport', 'Rent'].entries()) {
    const [row] = await testDb
      .insert(categories)
      .values({ userId, name, slug: name.toLowerCase(), sortOrder: i })
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

const add = (amount: number, category: string, date: string, note: string | null = null) =>
  createExpense(userId, { amount, categoryId: cat[category], expenseDate: date, note, personIds: [] });

/*
 * May 2026 is used throughout: 31 days, and comfortably in the past relative to
 * the suite's real clock, so `isCurrentMonth` is false and every figure covers
 * the whole month. The current-month branch gets its own block with a frozen
 * clock.
 */
describe('pace', () => {
  it('reports the month total, the previous month, and a projection that equals the actual for a past month', async () => {
    await add(1000, 'Food', '2026-05-05');
    await add(500, 'Transport', '2026-05-20');
    await add(2000, 'Rent', '2026-04-03'); // previous month

    const f = await getFlow(userId, '2026-05');

    expect(f.isCurrentMonth).toBe(false);
    expect(f.pace.spentMinor).toBe(150_000);
    expect(f.pace.monthDays).toBe(31);
    expect(f.pace.elapsedDays).toBe(31);
    expect(f.pace.prevFullMinor).toBe(200_000);
    // A past month is fully elapsed, so the projection is just the total.
    expect(f.pace.projectedMinor).toBe(150_000);
    expect(f.pace.perDayMinor).toBe(Math.round(150_000 / 31));
  });

  it('compares against the previous month at the SAME day of month, not its full total', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-05-10T09:00:00Z'));

    await add(600, 'Food', '2026-05-02');
    await add(400, 'Food', '2026-05-09');
    // April: 300 before the 10th, 5000 after. Only the first should count.
    await add(300, 'Food', '2026-04-04');
    await add(5000, 'Rent', '2026-04-25');

    const f = await getFlow(userId, '2026-05');

    expect(f.isCurrentMonth).toBe(true);
    expect(f.pace.elapsedDays).toBe(10);
    expect(f.pace.spentMinor).toBe(100_000);
    expect(f.pace.prevSameDayMinor).toBe(30_000);
    expect(f.pace.prevFullMinor).toBe(530_000);
    expect(f.pace.deltaPct).toBeCloseTo(((100_000 - 30_000) / 30_000) * 100, 6);
  });
});

describe('cumulative curve', () => {
  it('accumulates both months and never decreases', async () => {
    await add(100, 'Food', '2026-05-01');
    await add(200, 'Food', '2026-05-03');
    await add(700, 'Food', '2026-05-31');
    await add(50, 'Food', '2026-04-02');

    const f = await getFlow(userId, '2026-05');

    expect(f.cumulative).toHaveLength(31);
    expect(f.cumulative[0]).toMatchObject({ day: 1, date: '2026-05-01', thisMinor: 10_000 });
    expect(f.cumulative[2].thisMinor).toBe(30_000);
    expect(f.cumulative.at(-1)!.thisMinor).toBe(100_000);
    expect(f.cumulative.at(-1)!.prevMinor).toBe(5_000);

    for (let i = 1; i < f.cumulative.length; i++) {
      expect(f.cumulative[i].thisMinor).toBeGreaterThanOrEqual(f.cumulative[i - 1].thisMinor);
    }
  });

  it('stops at today for the current month rather than drawing a flat tail', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-05-07T12:00:00Z'));
    await add(100, 'Food', '2026-05-02');

    const f = await getFlow(userId, '2026-05');

    expect(f.cumulative).toHaveLength(7);
    expect(f.cumulative.at(-1)!.date).toBe('2026-05-07');
  });
});

describe('weekday rhythm', () => {
  it('averages over the days that actually saw spending, not over every calendar day', async () => {
    // 2026-05-02 and 2026-05-09 are both Saturdays.
    await add(300, 'Food', '2026-05-02');
    await add(100, 'Food', '2026-05-02');
    await add(400, 'Food', '2026-05-09');

    const f = await getFlow(userId, '2026-05');
    const sat = f.weekday.find((w) => w.label === 'Sat')!;

    expect(sat.totalMinor).toBe(80_000);
    expect(sat.count).toBe(3);
    // Two Saturdays with spending → ₹400 a Saturday, not ₹800 / 5 Saturdays.
    expect(sat.avgMinor).toBe(40_000);

    expect(f.weekday).toHaveLength(7);
    expect(f.weekday.find((w) => w.label === 'Mon')!.totalMinor).toBe(0);
  });
});

describe('ticket sizes', () => {
  it('reports the median, the average and the small-ticket bucket', async () => {
    await add(100, 'Food', '2026-05-01'); // small
    await add(150, 'Food', '2026-05-02'); // small
    await add(200, 'Food', '2026-05-03'); // small — the threshold is inclusive
    await add(900, 'Rent', '2026-05-04');
    await add(2000, 'Rent', '2026-05-05');

    const f = await getFlow(userId, '2026-05');

    expect(f.tickets.count).toBe(5);
    expect(f.tickets.medianMinor).toBe(20_000);
    expect(f.tickets.averageMinor).toBe(Math.round(335_000 / 5));
    expect(f.tickets.smallThresholdMinor).toBe(SMALL_TICKET_MINOR);
    expect(f.tickets.smallCount).toBe(3);
    expect(f.tickets.smallTotalMinor).toBe(45_000);
    expect(f.tickets.largest).toMatchObject({ amountMinor: 200_000, date: '2026-05-05', categoryName: 'Rent' });
  });

  it('has no largest and a zero median when the month is empty', async () => {
    const f = await getFlow(userId, '2026-05');
    expect(f.tickets.count).toBe(0);
    expect(f.tickets.largest).toBeNull();
    expect(f.tickets.medianMinor).toBe(0);
    expect(f.tickets.averageMinor).toBe(0);
  });
});

describe('concentration', () => {
  it('is 1 when everything sits in one category and falls as spend spreads out', async () => {
    await add(1000, 'Food', '2026-05-01');
    let f = await getFlow(userId, '2026-05');
    expect(f.concentration.topShare).toBe(1);
    expect(f.concentration.herfindahl).toBe(1);
    expect(f.concentration.activeCategories).toBe(1);

    await add(1000, 'Rent', '2026-05-02');
    f = await getFlow(userId, '2026-05');
    expect(f.concentration.topShare).toBeCloseTo(0.5, 10);
    expect(f.concentration.herfindahl).toBeCloseTo(0.5, 10);
    expect(f.concentration.top3Share).toBeCloseTo(1, 10);
    expect(f.concentration.activeCategories).toBe(2);
  });
});

describe('category momentum', () => {
  it('compares this month against the mean of the previous three', async () => {
    // Food: 300 + 300 + 600 over Feb–Apr → baseline 400.
    await add(300, 'Food', '2026-02-10');
    await add(300, 'Food', '2026-03-10');
    await add(600, 'Food', '2026-04-10');
    await add(1000, 'Food', '2026-05-10');

    const f = await getFlow(userId, '2026-05');
    const food = f.momentum.find((m) => m.name === 'Food')!;

    expect(food.baselineMinor).toBe(40_000);
    expect(food.thisMinor).toBe(100_000);
    expect(food.deltaMinor).toBe(60_000);
    expect(food.deltaPct).toBeCloseTo(150, 6);
    expect(food.isNew).toBe(false);
  });

  it('marks a category with no history as new rather than reporting an infinite rise', async () => {
    await add(500, 'Transport', '2026-05-04');

    const f = await getFlow(userId, '2026-05');
    const t = f.momentum.find((m) => m.name === 'Transport')!;

    expect(t.baselineMinor).toBe(0);
    expect(t.deltaPct).toBeNull();
    expect(t.isNew).toBe(true);
  });

  it('keeps a category that stopped being used, so a drop to zero is visible', async () => {
    await add(900, 'Rent', '2026-04-01');
    await add(100, 'Food', '2026-05-01');

    const f = await getFlow(userId, '2026-05');
    const rent = f.momentum.find((m) => m.name === 'Rent')!;

    expect(rent.thisMinor).toBe(0);
    expect(rent.baselineMinor).toBe(30_000);
    expect(rent.deltaMinor).toBe(-30_000);
  });
});

describe('cadence', () => {
  it('counts spend days, quiet days and the longest quiet run', async () => {
    await add(100, 'Food', '2026-05-01');
    await add(100, 'Food', '2026-05-02');
    await add(100, 'Food', '2026-05-10');

    const f = await getFlow(userId, '2026-05');

    expect(f.cadence.spendDays).toBe(3);
    expect(f.cadence.quietDays).toBe(28);
    expect(f.cadence.longestSpendRun).toBe(2);
    // The 11th to the 31st is 21 days, longer than the 3rd–9th gap of 7.
    expect(f.cadence.longestQuietRun).toBe(21);
  });

  it('does not count days that have not happened yet as quiet', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-05-04T08:00:00Z'));
    await add(100, 'Food', '2026-05-01');

    const f = await getFlow(userId, '2026-05');

    expect(f.cadence.spendDays).toBe(1);
    expect(f.cadence.quietDays).toBe(3);
    expect(f.cadence.longestQuietRun).toBe(3);
  });

  it('names the busiest day', async () => {
    await add(100, 'Food', '2026-05-01');
    await add(900, 'Rent', '2026-05-06');
    await add(200, 'Food', '2026-05-06');

    const f = await getFlow(userId, '2026-05');
    expect(f.cadence.busiest).toEqual({ date: '2026-05-06', totalMinor: 110_000 });
  });
});

describe('halves', () => {
  it('splits the month down the middle', async () => {
    await add(100, 'Food', '2026-05-16'); // 31 days → first half is 1–16
    await add(200, 'Food', '2026-05-17');

    const f = await getFlow(userId, '2026-05');
    expect(f.halves.firstMinor).toBe(10_000);
    expect(f.halves.secondMinor).toBe(20_000);
  });
});

describe('ledger flow', () => {
  it('reports lending separately from spending and never mixes the two', async () => {
    await add(1000, 'Food', '2026-05-03');
    await testDb.insert(ledgerEntries).values([
      { userId, personId: person['Sankalp'], direction: 'out', amountMinor: 50_000, entryDate: '2026-05-04' },
      { userId, personId: person['Sankalp'], direction: 'in', amountMinor: 20_000, entryDate: '2026-05-05' },
      { userId, personId: person['Sankalp'], direction: 'out', amountMinor: 99_000, entryDate: '2026-06-01' },
    ]);

    const f = await getFlow(userId, '2026-05');

    expect(f.ledger).toEqual({ lentMinor: 50_000, borrowedMinor: 20_000, netMinor: 30_000, entryCount: 2 });
    // The ledger movement must not have touched the spending figure.
    expect(f.pace.spentMinor).toBe(100_000);
  });
});

describe('repeats', () => {
  it('groups notes case- and whitespace-insensitively and ignores one-offs', async () => {
    await add(120, 'Food', '2026-05-01', 'Chai');
    await add(120, 'Food', '2026-05-08', ' chai ');
    await add(130, 'Food', '2026-05-15', 'CHAI');
    await add(900, 'Rent', '2026-05-02', 'One off');

    const f = await getFlow(userId, '2026-05');

    expect(f.repeats).toHaveLength(1);
    expect(f.repeats[0]).toMatchObject({ label: 'chai', categoryName: 'Food', count: 3, totalMinor: 37_000 });
  });
});
