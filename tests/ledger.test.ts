import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeTestDb } from './helpers/db';

const testDb = await makeTestDb();
vi.mock('@/db', () => ({ db: testDb }));

const { users, categories, people, expenses, expensePeople, ledgerEntries } = await import('@/db/schema');
const { createLedgerEntry, updateLedgerEntry, deleteLedgerEntry, getPeerSummary, getPeerLedger } = await import(
  '@/lib/ledger'
);
const { createExpense } = await import('@/lib/expenses');
const { getTotal, getPersonBreakdown } = await import('@/lib/analytics');

let userId: string;
const person: Record<string, string> = {};
let catId: string;

beforeEach(async () => {
  await testDb.delete(ledgerEntries);
  await testDb.delete(expensePeople);
  await testDb.delete(expenses);
  await testDb.delete(people);
  await testDb.delete(categories);
  await testDb.delete(users);

  const [user] = await testDb
    .insert(users)
    .values({ name: 'T', email: `l${Math.random()}@example.com`, passwordHash: 'x' })
    .returning();
  userId = user.id;

  const [cat] = await testDb
    .insert(categories)
    .values({ userId, name: 'Misc', slug: 'misc' })
    .returning();
  catId = cat.id;

  for (const [i, name] of ['Me', 'Aditi', 'Mummy', 'Anand'].entries()) {
    const [row] = await testDb
      .insert(people)
      .values({ userId, name, isSelf: name === 'Me', sortOrder: i })
      .returning();
    person[name] = row.id;
  }
});

const gave = (to: string, amount: number, date = '2026-08-04', note?: string) =>
  createLedgerEntry(userId, { personId: person[to], direction: 'out', amount, entryDate: date, note });

const got = (from: string, amount: number, date = '2026-08-10', note?: string) =>
  createLedgerEntry(userId, { personId: person[from], direction: 'in', amount, entryDate: date, note });

describe('balances', () => {
  it('nets giving and getting back into one balance', async () => {
    // Mirrors the sheet's aditi column: several given, one got back.
    await gave('Aditi', 200, '2026-08-04');
    await gave('Aditi', 500, '2026-08-10');
    await gave('Aditi', 351, '2026-08-12', 'recharge airtel');
    await got('Aditi', 1000, '2026-08-13');

    const { balances } = await getPeerSummary(userId);
    const aditi = balances.find((b) => b.name === 'Aditi')!;

    expect(aditi.outMinor).toBe(105100); // 1051
    expect(aditi.inMinor).toBe(100000); // 1000
    expect(aditi.balanceMinor).toBe(5100); // they owe 51
    expect(aditi.entryCount).toBe(4);
  });

  it('separates who owes me from who I owe', async () => {
    await gave('Anand', 1000);
    await gave('Mummy', 2500);
    await got('Aditi', 13950);

    const s = await getPeerSummary(userId);

    expect(s.owedToMeMinor).toBe(350000); // 1000 + 2500
    expect(s.owedByMeMinor).toBe(1395000); // 13950
    expect(s.netMinor).toBe(350000 - 1395000);
    expect(s.theyOwe.map((b) => b.name).sort()).toEqual(['Anand', 'Mummy']);
    expect(s.iOwe.map((b) => b.name)).toEqual(['Aditi']);
  });

  it('treats a fully repaid peer as settled, not owed', async () => {
    await gave('Anand', 1000);
    await got('Anand', 1000);

    const s = await getPeerSummary(userId);
    expect(s.owedToMeMinor).toBe(0);
    expect(s.owedByMeMinor).toBe(0);
    expect(s.settled.map((b) => b.name)).toEqual(['Anand']);
    // History is kept rather than deleted.
    expect(s.balances.find((b) => b.name === 'Anand')!.entryCount).toBe(2);
  });

  it('flips sign when repayment exceeds what was lent', async () => {
    await gave('Anand', 500);
    await got('Anand', 800);

    const s = await getPeerSummary(userId);
    expect(s.balances.find((b) => b.name === 'Anand')!.balanceMinor).toBe(-30000);
    expect(s.owedByMeMinor).toBe(30000);
  });
});

describe('per-peer history', () => {
  it('returns a running balance, newest first', async () => {
    await gave('Aditi', 200, '2026-08-04');
    await gave('Aditi', 500, '2026-08-10');
    await got('Aditi', 1000, '2026-08-13');

    const ledger = await getPeerLedger(userId, person['Aditi']);

    expect(ledger.entries).toHaveLength(3);
    expect(ledger.entries[0].entryDate).toBe('2026-08-13'); // newest first
    // Running balance is computed oldest-first: 200 -> 700 -> -300
    expect(ledger.entries.map((e) => e.runningBalanceMinor)).toEqual([-30000, 70000, 20000]);
    expect(ledger.balanceMinor).toBe(-30000);
  });

  it('keeps notes for sub-transactions', async () => {
    await gave('Aditi', 351, '2026-08-12', 'recharge airtel');
    const ledger = await getPeerLedger(userId, person['Aditi']);
    expect(ledger.entries[0].note).toBe('recharge airtel');
  });
});

describe('the ledger never touches spending analytics', () => {
  it('lending money is not an expense', async () => {
    await createExpense(userId, {
      amount: 500,
      categoryId: catId,
      expenseDate: '2026-08-05',
      note: null,
      personIds: [person['Aditi']],
    });
    await gave('Aditi', 10000, '2026-08-05');

    const range = { userId, start: '2026-08-01', end: '2026-08-31' };

    // The ₹10,000 loan must not appear anywhere in spending.
    expect((await getTotal(range)).totalMinor).toBe(50000);
    expect((await getTotal(range)).count).toBe(1);

    const { people: ppl, grandTotalMinor } = await getPersonBreakdown(range);
    expect(ppl.find((p) => p.name === 'Aditi')!.totalMinor).toBe(50000);
    expect(grandTotalMinor).toBe(50000);
  });

  it('borrowing money is not income or spending', async () => {
    await got('Aditi', 13950, '2026-08-05');
    const range = { userId, start: '2026-08-01', end: '2026-08-31' };
    expect((await getTotal(range)).totalMinor).toBe(0);
  });
});

describe('editing and deleting', () => {
  it('recomputes the balance after an edit', async () => {
    const e = await gave('Anand', 1000);
    await updateLedgerEntry(userId, e.id, { amount: 1500 });

    const s = await getPeerSummary(userId);
    expect(s.balances.find((b) => b.name === 'Anand')!.balanceMinor).toBe(150000);
  });

  it('flips the balance when the direction changes', async () => {
    const e = await gave('Anand', 1000);
    await updateLedgerEntry(userId, e.id, { direction: 'in' });

    const s = await getPeerSummary(userId);
    expect(s.balances.find((b) => b.name === 'Anand')!.balanceMinor).toBe(-100000);
    expect(s.owedByMeMinor).toBe(100000);
  });

  it('moves the entry when the person changes', async () => {
    const e = await gave('Anand', 1000);
    await updateLedgerEntry(userId, e.id, { personId: person['Mummy'] });

    const s = await getPeerSummary(userId);
    expect(s.balances.find((b) => b.name === 'Anand')).toBeUndefined();
    expect(s.balances.find((b) => b.name === 'Mummy')!.balanceMinor).toBe(100000);
  });

  it('drops a deleted entry from the balance', async () => {
    const e = await gave('Anand', 1000);
    await gave('Anand', 500);
    await deleteLedgerEntry(userId, e.id);

    const s = await getPeerSummary(userId);
    expect(s.balances.find((b) => b.name === 'Anand')!.balanceMinor).toBe(50000);
  });
});

describe('validation', () => {
  it('refuses a ledger entry against yourself', async () => {
    await expect(gave('Me', 100)).rejects.toThrow(/other than yourself/);
  });

  it('refuses another account\'s person', async () => {
    const [other] = await testDb
      .insert(users)
      .values({ name: 'O', email: `o${Math.random()}@example.com`, passwordHash: 'x' })
      .returning();
    const [foreign] = await testDb.insert(people).values({ userId: other.id, name: 'Theirs' }).returning();

    await expect(
      createLedgerEntry(userId, { personId: foreign.id, direction: 'out', amount: 10, entryDate: '2026-08-01' }),
    ).rejects.toThrow(/does not exist/);
  });

  it('keeps two accounts\' ledgers apart', async () => {
    await gave('Anand', 1000);
    const [other] = await testDb
      .insert(users)
      .values({ name: 'O', email: `o${Math.random()}@example.com`, passwordHash: 'x' })
      .returning();
    expect((await getPeerSummary(other.id)).balances).toHaveLength(0);
  });
});
