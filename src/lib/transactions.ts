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
  category: { id: string; name: string; icon: string; color: string } | null;
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

export async function getTransactions(p: FeedParams): Promise<{ items: Transaction[]; hasMore: boolean }> {
  const limit = Math.min(p.limit ?? 100, 300);
  const offset = p.offset ?? 0;
  const kinds = p.kinds?.length ? p.kinds : (['expense', 'lent', 'borrowed'] as TxKind[]);

  const wantExpenses = kinds.includes('expense');
  const wantLedger = kinds.includes('lent') || kinds.includes('borrowed');

  const [expenseRows, ledgerRows] = await Promise.all([
    wantExpenses ? fetchExpenses(p, limit + offset) : Promise.resolve([]),
    wantLedger ? fetchLedger(p, kinds, limit + offset) : Promise.resolve([]),
  ]);

  const merged = [...expenseRows, ...ledgerRows].sort((a, b) =>
    a.date === b.date ? b.amountMinor - a.amountMinor : a.date < b.date ? 1 : -1,
  );

  return { items: merged.slice(offset, offset + limit), hasMore: merged.length > offset + limit };
}

async function fetchExpenses(p: FeedParams, take: number): Promise<Transaction[]> {
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
    category: { id: r.c.id, name: r.c.name, icon: r.c.icon, color: r.c.color },
    people: byExpense.get(r.e.id) ?? [],
  }));
}

async function fetchLedger(p: FeedParams, kinds: TxKind[], take: number): Promise<Transaction[]> {
  // A category filter is meaningless for ledger entries — they have no category.
  if (p.categoryIds?.length) return [];

  const clauses = [eq(ledgerEntries.userId, p.userId), isNull(ledgerEntries.deletedAt)];
  if (p.start) clauses.push(gte(ledgerEntries.entryDate, p.start));
  if (p.end) clauses.push(lte(ledgerEntries.entryDate, p.end));
  if (p.personIds?.length) clauses.push(inArray(ledgerEntries.personId, p.personIds));
  if (p.search) clauses.push(sql`${ledgerEntries.note} ILIKE ${'%' + p.search + '%'}`);

  const dirs: string[] = [];
  if (kinds.includes('lent')) dirs.push('out');
  if (kinds.includes('borrowed')) dirs.push('in');
  if (dirs.length === 1) clauses.push(eq(ledgerEntries.direction, dirs[0]));

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
