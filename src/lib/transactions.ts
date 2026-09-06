import { and, eq, gte, lte, isNull, sql, inArray, desc } from 'drizzle-orm';
import { db } from '@/db';
import { expenses, expensePeople, ledgerEntries, categories, people } from '@/db/schema';

/**
 * A single feed over the two things a user thinks of as "transactions":
 * spending (expenses) and money movement with a peer (ledger entries).
 *
 * They stay in separate tables because lending is not spending — see
 * lib/ledger.ts. This view unions them for display only; nothing here is used
 * to compute a spending total, and each row carries its `kind` so the UI never
 * has to guess which side it came from.
 */

export type TxKind = 'expense' | 'lent' | 'borrowed';

export type Transaction = {
  id: string;
  kind: TxKind;
  amountMinor: number;
  date: string;
  note: string | null;
  /** `kind` rides along so a list can separate spending from investing
   *  without a second query — see the note at the top of analytics.ts. */
  category: { id: string; name: string; icon: string; color: string; kind: string } | null;
  people: { id: string; name: string; color: string }[];
};

export type FeedParams = {
  userId: string;
  start?: string;
  end?: string;
  categoryIds?: string[];
  personIds?: string[];
  kinds?: TxKind[];
  search?: string;
  limit?: number;
  offset?: number;
};

/** What the filter comes to, whatever slice of it is currently loaded. */
export type FeedTotals = {
  spentMinor: number;
  investedMinor: number;
  incomeMinor: number;
  lentMinor: number;
  borrowedMinor: number;
  count: number;
};

export async function getTransactions(
  p: FeedParams,
): Promise<{ items: Transaction[]; hasMore: boolean; totals: FeedTotals }> {
  const limit = Math.min(p.limit ?? 100, 300);
  const offset = p.offset ?? 0;
  const kinds = p.kinds?.length ? p.kinds : (['expense', 'lent', 'borrowed'] as TxKind[]);

  const wantExpenses = kinds.includes('expense');
  const wantLedger = kinds.includes('lent') || kinds.includes('borrowed');

  /*
   * TOTALS DESCRIBE THE FILTER, NOT THE PAGE.
   *
   * The screen used to sum the rows it had been handed — capped at 150 and
   * raised 150 at a time by "Load more" — so a month with 200 transactions
   * showed a "Spent" figure missing fifty of them, which silently corrected
   * itself when you scrolled. A stat that changes as you scroll is not a stat.
   */
  const [expenseRows, ledgerRows, totals] = await Promise.all([
    wantExpenses ? fetchExpenses(p, limit + offset) : Promise.resolve([]),
    wantLedger ? fetchLedger(p, kinds, limit + offset) : Promise.resolve([]),
    feedTotals(p, kinds),
  ]);

  const merged = [...expenseRows, ...ledgerRows].sort((a, b) =>
    a.date === b.date ? b.amountMinor - a.amountMinor : a.date < b.date ? 1 : -1,
  );

  return { items: merged.slice(offset, offset + limit), hasMore: merged.length > offset + limit, totals };
}

/** The same WHERE clause as the feed, aggregated instead of paged. */
async function feedTotals(p: FeedParams, kinds: TxKind[]): Promise<FeedTotals> {
  const wantExpenses = kinds.includes('expense');
  const wantLedger = kinds.includes('lent') || kinds.includes('borrowed');

  const [exp, led] = await Promise.all([
    wantExpenses ? expenseTotals(p) : Promise.resolve({ spent: 0, invested: 0, income: 0, count: 0 }),
    wantLedger ? ledgerTotals(p, kinds) : Promise.resolve({ lent: 0, borrowed: 0, count: 0 }),
  ]);

  return {
    spentMinor: exp.spent,
    investedMinor: exp.invested,
    incomeMinor: exp.income,
    lentMinor: led.lent,
    borrowedMinor: led.borrowed,
    count: exp.count + led.count,
  };
}

async function expenseTotals(p: FeedParams) {
  const [row] = await db
    .select({
      spent: sql<string>`COALESCE(SUM(${expenses.amountMinor}) FILTER (WHERE ${categories.kind} = 'expense'), 0)`,
      invested: sql<string>`COALESCE(SUM(${expenses.amountMinor}) FILTER (WHERE ${categories.kind} = 'investment'), 0)`,
      income: sql<string>`COALESCE(SUM(${expenses.amountMinor}) FILTER (WHERE ${categories.kind} = 'income'), 0)`,
      count: sql<string>`COUNT(*)`,
    })
    .from(expenses)
    .innerJoin(categories, eq(categories.id, expenses.categoryId))
    .where(and(...expenseClauses(p)));

  return {
    spent: Number(row?.spent ?? 0),
    invested: Number(row?.invested ?? 0),
    income: Number(row?.income ?? 0),
    count: Number(row?.count ?? 0),
  };
}

async function ledgerTotals(p: FeedParams, kinds: TxKind[]) {
  const [row] = await db
    .select({
      lent: sql<string>`COALESCE(SUM(${ledgerEntries.amountMinor}) FILTER (WHERE ${ledgerEntries.direction} = 'out'), 0)`,
      borrowed: sql<string>`COALESCE(SUM(${ledgerEntries.amountMinor}) FILTER (WHERE ${ledgerEntries.direction} = 'in'), 0)`,
      count: sql<string>`COUNT(*)`,
    })
    .from(ledgerEntries)
    .where(and(...ledgerClauses(p, kinds)));

  return {
    lent: Number(row?.lent ?? 0),
    borrowed: Number(row?.borrowed ?? 0),
    count: Number(row?.count ?? 0),
  };
}

/*
 * The filter, in one place.
 *
 * Extracted so the paged query and the totals query cannot drift apart — the
 * whole reason the strip is trustworthy is that it is the same predicate.
 */
function expenseClauses(p: FeedParams) {
  const clauses = [eq(expenses.userId, p.userId), isNull(expenses.deletedAt)];
  if (p.start) clauses.push(gte(expenses.expenseDate, p.start));
  if (p.end) clauses.push(lte(expenses.expenseDate, p.end));
  if (p.categoryIds?.length) clauses.push(inArray(expenses.categoryId, p.categoryIds));
  if (p.search) clauses.push(sql`${expenses.note} ILIKE ${'%' + p.search + '%'}`);
  if (p.personIds?.length) {
    clauses.push(sql`EXISTS (
      SELECT 1 FROM ${expensePeople} ep
      WHERE ep.expense_id = ${expenses.id}
        AND ep.person_id IN ${sql`(${sql.join(p.personIds.map((id) => sql`${id}::uuid`), sql`, `)})`}
    )`);
  }
  return clauses;
}

function ledgerClauses(p: FeedParams, kinds: TxKind[]) {
  const clauses = [eq(ledgerEntries.userId, p.userId), isNull(ledgerEntries.deletedAt)];
  if (p.start) clauses.push(gte(ledgerEntries.entryDate, p.start));
  if (p.end) clauses.push(lte(ledgerEntries.entryDate, p.end));
  if (p.personIds?.length) clauses.push(inArray(ledgerEntries.personId, p.personIds));
  if (p.search) clauses.push(sql`${ledgerEntries.note} ILIKE ${'%' + p.search + '%'}`);

  const dirs: string[] = [];
  if (kinds.includes('lent')) dirs.push('out');
  if (kinds.includes('borrowed')) dirs.push('in');
  if (dirs.length === 1) clauses.push(eq(ledgerEntries.direction, dirs[0]));
  // A category filter is meaningless here — ledger entries have no category —
  // so it excludes them entirely rather than being ignored.
  if (p.categoryIds?.length) clauses.push(sql`false`);
  return clauses;
}

async function fetchExpenses(p: FeedParams, take: number): Promise<Transaction[]> {
  const clauses = expenseClauses(p);

  const rows = await db
    .select({ e: expenses, c: categories })
    .from(expenses)
    .innerJoin(categories, eq(categories.id, expenses.categoryId))
    .where(and(...clauses))
    .orderBy(desc(expenses.expenseDate), desc(expenses.createdAt))
    .limit(take);

  if (!rows.length) return [];

  const links = await db
    .select({ expenseId: expensePeople.expenseId, id: people.id, name: people.name, color: people.color })
    .from(expensePeople)
    .innerJoin(people, eq(people.id, expensePeople.personId))
    .where(inArray(expensePeople.expenseId, rows.map((r) => r.e.id)));

  const byExpense = new Map<string, Transaction['people']>();
  for (const l of links) {
    const list = byExpense.get(l.expenseId) ?? [];
    list.push({ id: l.id, name: l.name, color: l.color });
    byExpense.set(l.expenseId, list);
  }

  return rows.map((r) => ({
    id: r.e.id,
    kind: 'expense' as const,
    amountMinor: r.e.amountMinor,
    date: r.e.expenseDate,
    note: r.e.note,
    category: { id: r.c.id, name: r.c.name, icon: r.c.icon, color: r.c.color, kind: r.c.kind },
    people: byExpense.get(r.e.id) ?? [],
  }));
}

async function fetchLedger(p: FeedParams, kinds: TxKind[], take: number): Promise<Transaction[]> {
  if (p.categoryIds?.length) return [];
  const clauses = ledgerClauses(p, kinds);

  const rows = await db
    .select({ l: ledgerEntries, p: people })
    .from(ledgerEntries)
    .innerJoin(people, eq(people.id, ledgerEntries.personId))
    .where(and(...clauses))
    .orderBy(desc(ledgerEntries.entryDate), desc(ledgerEntries.createdAt))
    .limit(take);

  return rows.map((r) => ({
    id: r.l.id,
    kind: (r.l.direction === 'out' ? 'lent' : 'borrowed') as TxKind,
    amountMinor: r.l.amountMinor,
    date: r.l.entryDate,
    note: r.l.note,
    category: null,
    people: [{ id: r.p.id, name: r.p.name, color: r.p.color }],
  }));
}
