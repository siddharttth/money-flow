import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { makeTestDb } from './helpers/db';

const testDb = await makeTestDb();
vi.mock('@/db', () => ({ db: testDb }));

const { users, categories, people, expenses, expensePeople } = await import('@/db/schema');
const { createExpense } = await import('@/lib/expenses');
const { getTotal } = await import('@/lib/analytics');
const { getRecurringCharges, splitCommitted } = await import('@/lib/recurring');
const { getFunds, requiredSavingsMinor } = await import('@/lib/funds');
const { getMonthlyPlan, getSweep, getSavingsHistory } = await import('@/lib/plan');
const { eq } = await import('drizzle-orm');

let userId: string;
const cat: Record<string, string> = {};

async function makeCategory(name: string, kind = 'expense', extra: Record<string, unknown> = {}) {
  const [row] = await testDb
    .insert(categories)
    .values({ userId, name, slug: `${name.toLowerCase().replace(/[^a-z]/g, '-')}-${Math.random()}`, kind, ...extra })
    .returning();
  cat[name] = row.id;
  return row.id;
}

async function seed() {
  await testDb.delete(expensePeople);
  await testDb.delete(expenses);
  await testDb.delete(people);
  await testDb.delete(categories);
  await testDb.delete(users);

  const [user] = await testDb
    .insert(users)
    .values({ name: 'Test', email: `p${Math.random()}@example.com`, passwordHash: 'x' })
    .returning();
  userId = user.id;

  await makeCategory('Outside Food');
  await makeCategory('Bills');
  await makeCategory('Salary', 'income');
  await makeCategory('SIP', 'investment');
}

beforeEach(seed);
afterEach(() => vi.useRealTimers());

const add = (amount: number, category: string, date: string, note: string | null = null) =>
  createExpense(userId, { amount, categoryId: cat[category], expenseDate: date, note, personIds: [] });

const AUG = { start: '2026-08-01', end: '2026-08-31' };

describe('income', () => {
  it('is kept out of spending entirely', async () => {
    await add(52000, 'Salary', '2026-08-01', 'August pay');
    await add(500, 'Outside Food', '2026-08-05');

    expect((await getTotal({ userId, ...AUG })).totalMinor).toBe(50_000);
    expect((await getTotal({ userId, ...AUG, include: 'income' })).totalMinor).toBe(5_200_000);
    expect((await getTotal({ userId, ...AUG, include: 'all' })).totalMinor).toBe(5_250_000);
  });

  it('gives a savings rate once there is something to divide by', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-08-20T10:00:00Z'));
    await add(50000, 'Salary', '2026-08-01');
    await add(10000, 'Outside Food', '2026-08-05');

    const plan = await getMonthlyPlan(userId, '2026-08');
    expect(plan.hasIncome).toBe(true);
    expect(plan.savingsRatePct).toBeCloseTo(80, 6);
    expect(plan.netMinor).toBe(4_000_000);
  });

  it('says so rather than dividing by zero when no income is recorded', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-08-20T10:00:00Z'));
    await add(500, 'Outside Food', '2026-08-05');

    const plan = await getMonthlyPlan(userId, '2026-08');
    expect(plan.hasIncome).toBe(false);
    expect(plan.savingsRatePct).toBeNull();
    expect(plan.perDayMinor).toBe(0);
  });

  it('counts investing as kept, not spent', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-08-20T10:00:00Z'));
    await add(50000, 'Salary', '2026-08-01');
    await add(10000, 'SIP', '2026-08-07', 'SIP');

    const plan = await getMonthlyPlan(userId, '2026-08');
    expect(plan.spentMinor).toBe(0);
    expect(plan.investedMinor).toBe(1_000_000);
    expect(plan.savingsRatePct).toBe(100);
  });
});

describe('recurring charges', () => {
  /** wifi in June and July, so August should expect it. */
  async function seedWifi() {
    await add(589, 'Bills', '2026-06-12', 'wifi');
    await add(589, 'Bills', '2026-07-12', 'wifi');
  }

  it('recognises a charge seen in two of the previous months', async () => {
    await seedWifi();
    const charges = await getRecurringCharges(userId, '2026-08');

    expect(charges).toHaveLength(1);
    expect(charges[0]).toMatchObject({ label: 'wifi', typicalMinor: 58_900, typicalDay: 12, monthsSeen: 2 });
  });

  it('ignores something that has only happened once', async () => {
    await add(1600, 'Outside Food', '2026-07-04', 'trolley bag');
    expect(await getRecurringCharges(userId, '2026-08')).toHaveLength(0);
  });

  it('recognises an unlabelled charge by its repeating amount', async () => {
    await add(599, 'Bills', '2026-06-01');
    await add(599, 'Bills', '2026-07-01');

    const charges = await getRecurringCharges(userId, '2026-08');
    expect(charges).toHaveLength(1);
    expect(charges[0]).toMatchObject({ label: '', typicalMinor: 59_900 });
  });

  it('marks one that has already landed this month, and leaves the rest due', async () => {
    await seedWifi();
    await add(1000, 'Bills', '2026-06-17', 'Gym');
    await add(1000, 'Bills', '2026-07-17', 'Gym');
    await add(589, 'Bills', '2026-08-12', 'wifi');

    const charges = await getRecurringCharges(userId, '2026-08');
    const wifi = charges.find((c) => c.label === 'wifi')!;
    const gym = charges.find((c) => c.label === 'gym')!;

    expect(wifi.paidMinor).toBe(58_900);
    expect(wifi.paidDate).toBe('2026-08-12');
    expect(gym.paidMinor).toBeNull();
  });

  it('does not call something recurring on the strength of this month alone', async () => {
    await add(500, 'Outside Food', '2026-08-01', 'lunch');
    await add(500, 'Outside Food', '2026-08-15', 'lunch');
    expect(await getRecurringCharges(userId, '2026-08')).toHaveLength(0);
  });
});

describe('committed versus discretionary', () => {
  it('splits the month, and the two halves add back to the total', async () => {
    await add(589, 'Bills', '2026-06-12', 'wifi');
    await add(589, 'Bills', '2026-07-12', 'wifi');
    await add(589, 'Bills', '2026-08-12', 'wifi');
    await add(2000, 'Outside Food', '2026-08-14');

    const spent = (await getTotal({ userId, ...AUG })).totalMinor;
    const split = splitCommitted(await getRecurringCharges(userId, '2026-08'), spent);

    expect(split.committedPaidMinor).toBe(58_900);
    expect(split.discretionaryMinor).toBe(200_000);
    expect(split.committedPaidMinor + split.discretionaryMinor).toBe(spent);
  });

  it('lists what has not landed yet, soonest first', async () => {
    for (const m of ['06', '07']) {
      await add(1000, 'Bills', `2026-${m}-17`, 'Gym');
      await add(589, 'Bills', `2026-${m}-12`, 'wifi');
    }

    const split = splitCommitted(await getRecurringCharges(userId, '2026-08'), 0);
    expect(split.upcoming.map((c) => c.label)).toEqual(['wifi', 'gym']);
    expect(split.committedDueMinor).toBe(158_900);
  });

  it('keeps a recurring investment out of committed spending', async () => {
    await add(10000, 'SIP', '2026-06-07', 'SIP');
    await add(10000, 'SIP', '2026-07-07', 'SIP');

    const split = splitCommitted(await getRecurringCharges(userId, '2026-08'), 0);
    expect(split.committedDueMinor).toBe(0);
    expect(split.committedInvestingMinor).toBe(1_000_000);
  });
});

describe('funds', () => {
  async function bikeFund(target = 42000, date: string | null = '2027-03-31') {
    return makeCategory('Bike fund', 'investment', {
      targetMinor: target * 100,
      targetDate: date,
    });
  }

  it('reports progress against the target', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-09-01T10:00:00Z'));
    await bikeFund();
    await add(18400, 'Bike fund', '2026-08-01');

    const [fund] = await getFunds(userId, '2026-09');
    expect(fund).toMatchObject({
      name: 'Bike fund',
      targetMinor: 4_200_000,
      savedMinor: 1_840_000,
      remainingMinor: 2_360_000,
      isComplete: false,
    });
    expect(fund.progress).toBeCloseTo(0.438, 3);
  });

  it('works out what has to go in each month to land on time', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-09-01T10:00:00Z'));
    await bikeFund(42000, '2027-01-01');
    await add(2000, 'Bike fund', '2026-08-01');

    const [fund] = await getFunds(userId, '2026-09');
    expect(fund.monthsLeft).toBe(5);
    expect(fund.requiredPerMonthMinor).toBe(Math.ceil(4_000_000 / 5));
  });

  it('says whether you are ahead of the line or behind it', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-09-01T10:00:00Z'));
    // Started 1 Aug, due 1 Oct — a 61-day span, 31 days of it gone.
    await makeCategory('Trip', 'investment', { targetMinor: 1_000_000, targetDate: '2026-10-01' });
    await add(8000, 'Trip', '2026-08-01');

    const [fund] = await getFunds(userId, '2026-09');
    expect(fund.expectedByNowMinor).toBe(Math.round(1_000_000 * (31 / 61)));
    expect(fund.paceDeltaMinor).toBe(800_000 - Math.round(1_000_000 * (31 / 61)));
    expect(fund.paceDeltaMinor).toBeGreaterThan(0);
  });

  it('does not report a fund set up before anyone paid in as already behind', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-09-01T10:00:00Z'));
    await makeCategory('Later', 'investment', { targetMinor: 1_000_000, targetDate: '2027-09-01' });

    const [fund] = await getFunds(userId, '2026-09');
    expect(fund.savedMinor).toBe(0);
    expect(fund.paceDeltaMinor).toBe(0);
  });

  it('shows a fund with nothing in it yet rather than hiding it', async () => {
    await bikeFund();
    const funds = await getFunds(userId, '2026-09');
    expect(funds).toHaveLength(1);
    expect(funds[0].savedMinor).toBe(0);
  });

  it('marks one that is done and stops asking for money', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-09-01T10:00:00Z'));
    await bikeFund(1000);
    await add(1200, 'Bike fund', '2026-08-01');

    const [fund] = await getFunds(userId, '2026-09');
    expect(fund.isComplete).toBe(true);
    expect(fund.progress).toBe(1);
    expect(requiredSavingsMinor([fund])).toBe(0);
  });

  it('leaves an ordinary investment category out — a fund needs a target', async () => {
    await add(10000, 'SIP', '2026-08-07');
    expect(await getFunds(userId, '2026-09')).toHaveLength(0);
  });
});

describe('safe to spend', () => {
  it('is what is left after everything known, divided by the days remaining', async () => {
    // 20 Aug: 12 days left including today.
    vi.useFakeTimers().setSystemTime(new Date('2026-08-20T10:00:00Z'));

    await add(50000, 'Salary', '2026-08-01');
    await add(10000, 'Outside Food', '2026-08-05');
    // wifi recurs and has not landed yet this month.
    await add(1000, 'Bills', '2026-06-12', 'wifi');
    await add(1000, 'Bills', '2026-07-12', 'wifi');

    const plan = await getMonthlyPlan(userId, '2026-08');

    expect(plan.daysLeft).toBe(12);
    expect(plan.committed.committedDueMinor).toBe(100_000);
    // 50,000 − 10,000 spent − 1,000 still due = 39,000 free.
    expect(plan.freeMinor).toBe(3_900_000);
    expect(plan.perDayMinor).toBe(Math.floor(3_900_000 / 12));
  });

  it('holds back what the funds still need this month', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-08-01T10:00:00Z'));
    await add(50000, 'Salary', '2026-08-01');
    await makeCategory('Bike fund', 'investment', { targetMinor: 1_000_000, targetDate: '2026-10-01' });

    const plan = await getMonthlyPlan(userId, '2026-08');
    expect(plan.savingsTargetMinor).toBeGreaterThan(0);
    expect(plan.freeMinor).toBe(5_000_000 - plan.savingsTargetMinor);
  });

  it('does not ask for the fund money twice once it has gone in', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-08-01T10:00:00Z'));
    await add(50000, 'Salary', '2026-08-01');
    await makeCategory('Bike fund', 'investment', { targetMinor: 1_000_000, targetDate: '2026-10-01' });

    const before = await getMonthlyPlan(userId, '2026-08');
    await add(5000, 'Bike fund', '2026-08-01');
    const after = await getMonthlyPlan(userId, '2026-08');

    expect(after.savingsTargetMinor).toBeLessThan(before.savingsTargetMinor);
    // The money moved from "to be saved" to "already saved" — not spent twice.
    expect(after.investedMinor).toBe(500_000);
  });

  it('flags an overspent month instead of printing a cheerful zero', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-08-20T10:00:00Z'));
    await add(1000, 'Salary', '2026-08-01');
    await add(5000, 'Outside Food', '2026-08-05');

    const plan = await getMonthlyPlan(userId, '2026-08');
    expect(plan.overspent).toBe(true);
    expect(plan.freeMinor).toBeLessThan(0);
    expect(plan.perDayMinor).toBe(0);
  });
});

describe('the underspend sweep', () => {
  it('offers the difference when the month that just ended was cheaper', async () => {
    await add(5000, 'Outside Food', '2026-07-10');
    await add(3000, 'Outside Food', '2026-08-10');

    const sweep = await getSweep(userId, '2026-09');
    expect(sweep).toMatchObject({
      month: '2026-08',
      previousMonth: '2026-07',
      spentMinor: 300_000,
      previousSpentMinor: 500_000,
      savedMinor: 200_000,
    });
  });

  it('offers nothing when the month cost more', async () => {
    await add(3000, 'Outside Food', '2026-07-10');
    await add(5000, 'Outside Food', '2026-08-10');
    expect((await getSweep(userId, '2026-09')).savedMinor).toBe(0);
  });

  it('ignores investing, which was never spending to begin with', async () => {
    await add(5000, 'Outside Food', '2026-07-10');
    await add(3000, 'Outside Food', '2026-08-10');
    await add(10000, 'SIP', '2026-08-07');

    expect((await getSweep(userId, '2026-09')).savedMinor).toBe(200_000);
  });
});

describe('telling a bill from a habit', () => {
  it('ignores something bought several times in a month', async () => {
    // Chai: twice in June, once in July. A habit, not a commitment.
    await add(220, 'Outside Food', '2026-06-03', 'Chai');
    await add(240, 'Outside Food', '2026-06-16', 'Chai');
    await add(230, 'Outside Food', '2026-07-08', 'Chai');

    expect(await getRecurringCharges(userId, '2026-08')).toHaveLength(0);
  });

  it('ignores a charge whose price swings', async () => {
    await add(880, 'Bills', '2026-06-24', 'medicines');
    await add(1620, 'Bills', '2026-07-22', 'medicines');

    expect(await getRecurringCharges(userId, '2026-08')).toHaveLength(0);
  });

  it('keeps one that lands once a month at a steady price', async () => {
    await add(589, 'Bills', '2026-06-12', 'wifi');
    await add(599, 'Bills', '2026-07-12', 'wifi');

    const charges = await getRecurringCharges(userId, '2026-08');
    expect(charges.map((c) => c.label)).toEqual(['wifi']);
  });
});

describe('income that has not arrived yet', () => {
  it('stands in the median of the last three months until this month is logged', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-08-10T10:00:00Z'));
    await add(50000, 'Salary', '2026-05-01');
    await add(60000, 'Salary', '2026-06-01');
    await add(52000, 'Salary', '2026-07-01');

    const plan = await getMonthlyPlan(userId, '2026-08');

    expect(plan.incomeMinor).toBe(0);
    expect(plan.usingEstimate).toBe(true);
    expect(plan.expectedIncomeMinor).toBe(5_200_000); // the median, not the mean
    expect(plan.hasIncome).toBe(true);
    expect(plan.perDayMinor).toBeGreaterThan(0);
  });

  it('hands over to the real figure the moment it lands', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-08-10T10:00:00Z'));
    await add(52000, 'Salary', '2026-07-01');
    expect((await getMonthlyPlan(userId, '2026-08')).usingEstimate).toBe(true);

    await add(31000, 'Salary', '2026-08-09');
    const plan = await getMonthlyPlan(userId, '2026-08');

    expect(plan.usingEstimate).toBe(false);
    expect(plan.expectedIncomeMinor).toBe(3_100_000);
    expect(plan.incomeMinor).toBe(3_100_000);
  });

  it('quotes a savings rate only against income that actually arrived', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-08-10T10:00:00Z'));
    await add(52000, 'Salary', '2026-07-01');
    await add(1000, 'Outside Food', '2026-08-02');

    const plan = await getMonthlyPlan(userId, '2026-08');
    expect(plan.usingEstimate).toBe(true);
    expect(plan.savingsRatePct).toBeNull();
  });

  it('has nothing to estimate from on a brand-new account', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-08-10T10:00:00Z'));
    const plan = await getMonthlyPlan(userId, '2026-08');

    expect(plan.hasIncome).toBe(false);
    expect(plan.usingEstimate).toBe(false);
    expect(plan.expectedIncomeMinor).toBe(0);
  });

  it('ignores months that had no income rather than averaging in a zero', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-08-10T10:00:00Z'));
    // Nothing in June or July; ₹40,000 in May.
    await add(40000, 'Salary', '2026-05-01');

    const plan = await getMonthlyPlan(userId, '2026-08');
    expect(plan.expectedIncomeMinor).toBe(4_000_000);
  });
});

describe('the tally — what the month came to', () => {
  it('reconciles: what came in, less what was spent, is what was saved', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-08-20T10:00:00Z'));
    await add(50000, 'Salary', '2026-08-01');
    await add(4000, 'Outside Food', '2026-08-05');
    await add(8000, 'SIP', '2026-08-07');

    const { tally } = await getMonthlyPlan(userId, '2026-08');
    expect(tally.known).toBe(true);
    expect(tally.inMinor).toBe(5_000_000);
    expect(tally.outMinor).toBe(400_000);
    expect(tally.savedMinor).toBe(4_600_000);
    // Saved splits into the part already moved and the part still liquid.
    expect(tally.investedMinor).toBe(800_000);
    expect(tally.inHandMinor).toBe(3_800_000);
    expect(tally.investedMinor + tally.inHandMinor).toBe(tally.savedMinor);
    expect(Math.round(tally.ratePct!)).toBe(92);
  });

  it('never quietly tallies an estimate — an unpaid month is not a saved month', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-08-20T10:00:00Z'));
    // Two paid months behind it, so the plan HAS an estimate to lean on.
    await add(50000, 'Salary', '2026-06-01');
    await add(50000, 'Salary', '2026-07-01');
    await add(4000, 'Outside Food', '2026-08-05');

    const plan = await getMonthlyPlan(userId, '2026-08');
    expect(plan.usingEstimate).toBe(true);
    expect(plan.expectedIncomeMinor).toBe(5_000_000);
    // ...and the tally still refuses to report money nobody has been paid.
    expect(plan.tally.known).toBe(false);
    expect(plan.tally.inMinor).toBe(0);
    expect(plan.tally.ratePct).toBeNull();
  });

  it('goes negative when the month ate into what was already there', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-08-20T10:00:00Z'));
    await add(10000, 'Salary', '2026-08-01');
    await add(14000, 'Outside Food', '2026-08-05');

    const { tally } = await getMonthlyPlan(userId, '2026-08');
    expect(tally.savedMinor).toBe(-400_000);
    expect(tally.ratePct).toBeLessThan(0);
  });
});

describe('a goal does not claim a pace it has not earned', () => {
  it('withholds pace and projection from a fund a few days old', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-08-05T10:00:00Z'));
    await makeCategory('Bike', 'investment', { targetMinor: 8_000_000, targetDate: '2027-03-31' });
    await add(8000, 'Bike', '2026-08-02');

    const [fund] = await getFunds(userId, '2026-08');
    // The arithmetic still runs — it is the confidence that is withheld.
    expect(fund.paceDeltaMinor).toBeGreaterThan(0);
    expect(fund.paceConfident).toBe(false);
    expect(fund.projectedDate).toBeNull();
  });

  it('states a pace once the fund has been running three weeks', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-08-31T10:00:00Z'));
    await makeCategory('Bike', 'investment', { targetMinor: 8_000_000, targetDate: '2027-03-31' });
    await add(8000, 'Bike', '2026-08-02');

    const [fund] = await getFunds(userId, '2026-08');
    expect(fund.paceConfident).toBe(true);
  });

  it('needs a second contribution before it will project a finish date', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-09-10T10:00:00Z'));
    await makeCategory('Bike', 'investment', { targetMinor: 8_000_000, targetDate: '2027-03-31' });
    await add(8000, 'Bike', '2026-08-02');
    // 39 days of history, but one deposit is a lump sum, not a rate.
    expect((await getFunds(userId, '2026-09'))[0].projectedDate).toBeNull();

    await add(8000, 'Bike', '2026-09-02');
    expect((await getFunds(userId, '2026-09'))[0].projectedDate).not.toBeNull();
  });
});

describe('a shortfall says which kind of shortfall it is', () => {
  async function ambitiousGoals() {
    vi.useFakeTimers().setSystemTime(new Date('2026-08-05T10:00:00Z'));
    await add(50000, 'Salary', '2026-08-01');
    await makeCategory('Bike', 'investment', { targetMinor: 8_000_000, targetDate: '2026-12-31' });
    await makeCategory('Buffer', 'investment', { targetMinor: 20_000_000, targetDate: '2026-12-31' });
  }

  it('blames the goals when spending is nowhere near the problem', async () => {
    await ambitiousGoals();
    await add(4000, 'Outside Food', '2026-08-03');

    const plan = await getMonthlyPlan(userId, '2026-08');
    expect(plan.freeMinor).toBeLessThan(0);
    expect(plan.freeBeforeGoalsMinor).toBeGreaterThan(0);
    expect(plan.shortfall).toBe('goals');
    // And the month itself was a good one, which is why the distinction matters.
    expect(plan.tally.savedMinor).toBe(4_600_000);
  });

  it('blames the spending when the spending really is the problem', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-08-05T10:00:00Z'));
    await add(10000, 'Salary', '2026-08-01');
    await add(14000, 'Outside Food', '2026-08-03');

    const plan = await getMonthlyPlan(userId, '2026-08');
    expect(plan.shortfall).toBe('spending');
    expect(plan.freeBeforeGoalsMinor).toBeLessThan(0);
  });

  it('says nothing at all when there is money left', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-08-05T10:00:00Z'));
    await add(50000, 'Salary', '2026-08-01');
    await add(4000, 'Outside Food', '2026-08-03');

    expect((await getMonthlyPlan(userId, '2026-08')).shortfall).toBe('none');
  });
});

describe('saving as a habit, month over month', () => {
  it('reports what came in, what went out and what stayed, per month', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-08-15T10:00:00Z'));
    await add(50000, 'Salary', '2026-07-01');
    await add(20000, 'Outside Food', '2026-07-08');
    await add(5000, 'SIP', '2026-07-09');

    await add(50000, 'Salary', '2026-08-01');
    await add(10000, 'Outside Food', '2026-08-08');

    const history = await getSavingsHistory(userId, 3);
    expect(history.map((h) => h.month)).toEqual(['2026-07', '2026-08']);

    const [jul, aug] = history;
    expect(jul).toMatchObject({ inMinor: 5_000_000, outMinor: 2_000_000, investedMinor: 500_000, savedMinor: 3_000_000 });
    expect(Math.round(jul.ratePct!)).toBe(60);
    expect(aug.savedMinor).toBe(4_000_000);
    expect(Math.round(aug.ratePct!)).toBe(80);
  });

  it('keeps a month with no income instead of quietly flattering the average', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-08-15T10:00:00Z'));
    await add(3000, 'Outside Food', '2026-07-08');
    await add(50000, 'Salary', '2026-08-01');

    const history = await getSavingsHistory(userId, 3);
    const jul = history.find((h) => h.month === '2026-07')!;
    expect(jul.inMinor).toBe(0);
    expect(jul.ratePct).toBeNull();
    // Spending with nothing coming in is a negative month, and says so.
    expect(jul.savedMinor).toBe(-300_000);
  });

  it('does not let an investment leak into the spending column', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-08-15T10:00:00Z'));
    await add(50000, 'Salary', '2026-08-01');
    await add(9000, 'SIP', '2026-08-02');

    const [aug] = await getSavingsHistory(userId, 1);
    expect(aug.outMinor).toBe(0);
    expect(aug.investedMinor).toBe(900_000);
    expect(aug.savedMinor).toBe(5_000_000);
  });
});

describe('investing more than the month produced', () => {
  /** The reported figures: ₹33,133 in, ₹25,366 spent, ₹12,000 invested. */
  async function theReportedMonth() {
    vi.useFakeTimers().setSystemTime(new Date('2026-08-31T10:00:00Z'));
    await add(33133, 'Salary', '2026-08-01');
    await add(25366, 'Outside Food', '2026-08-10');
    await add(12000, 'SIP', '2026-08-15');
    return (await getMonthlyPlan(userId, '2026-08')).tally;
  }

  it('reports a negative in hand rather than its absolute value', async () => {
    const t = await theReportedMonth();
    expect(t.savedMinor).toBe(776_700);
    expect(t.investedMinor).toBe(1_200_000);
    // The card printed a cheerful gold ₹4,233 here. It is money leaving.
    expect(t.inHandMinor).toBe(-423_300);
  });

  it('still keeps the three legs reconciling to the saved figure', async () => {
    const t = await theReportedMonth();
    expect(t.investedMinor + t.inHandMinor).toBe(t.savedMinor);
    expect(t.inMinor - t.outMinor).toBe(t.savedMinor);
  });

  it('leaves the savings rate alone — the month did save, on paper', async () => {
    const t = await theReportedMonth();
    expect(Math.round(t.ratePct!)).toBe(23);
    expect(t.savedMinor).toBeGreaterThan(0);
  });

  it('keeps in hand positive when investing stays inside what the month made', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-08-31T10:00:00Z'));
    await add(33133, 'Salary', '2026-08-01');
    await add(25366, 'Outside Food', '2026-08-10');
    await add(5000, 'SIP', '2026-08-15');

    const { tally } = await getMonthlyPlan(userId, '2026-08');
    expect(tally.inHandMinor).toBe(276_700);
  });
});
