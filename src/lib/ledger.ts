import { and, eq, isNull, sql, desc, asc } from 'drizzle-orm';
import { db } from '@/db';
import { ledgerEntries, people } from '@/db/schema';
import { toMinor, sumToMinor } from './money';
import { ApiError } from './api';

/**
 * Peer ledger: who owes whom. Completely separate from expenses — no query in
 * this file touches the expenses table, and no analytics query touches this
 * one. Lending money is not spending.
 */

export type LedgerDirection = 'out' | 'in';

export type LedgerEntryDTO = {
  id: string;
  direction: LedgerDirection;
  amount: number;
  amountMinor: number;
  entryDate: string;
  note: string | null;
  person: { id: string; name: string; avatar: string; color: string };
  createdAt: string;
};

export type PeerBalance = {
  personId: string;
  name: string;
  avatar: string;
  color: string;
  relationshipType: string;
  outMinor: number;
  inMinor: number;
  /** out − in. Positive: they owe you. Negative: you owe them. */
  balanceMinor: number;
  entryCount: number;
  lastEntryDate: string | null;
};

function live(userId: string) {
  return and(eq(ledgerEntries.userId, userId), isNull(ledgerEntries.deletedAt));
}

const OUT = sql<string>`COALESCE(SUM(CASE WHEN ${ledgerEntries.direction} = 'out' THEN ${ledgerEntries.amountMinor} ELSE 0 END), 0)`;
const IN = sql<string>`COALESCE(SUM(CASE WHEN ${ledgerEntries.direction} = 'in' THEN ${ledgerEntries.amountMinor} ELSE 0 END), 0)`;

/** One row per person who has any ledger history, biggest debt first. */
export async function getPeerBalances(userId: string): Promise<PeerBalance[]> {
  const rows = await db
    .select({
      personId: people.id,
      name: people.name,
      avatar: people.avatar,
      color: people.color,
      relationshipType: people.relationshipType,
      out: OUT,
      inn: IN,
      count: sql<string>`COUNT(${ledgerEntries.id})`,
      last: sql<string | null>`MAX(${ledgerEntries.entryDate})`,
    })
    .from(ledgerEntries)
    .innerJoin(people, eq(people.id, ledgerEntries.personId))
    .where(live(userId))
    .groupBy(people.id, people.name, people.avatar, people.color, people.relationshipType)
    .orderBy(desc(sql`ABS(${OUT} - ${IN})`));

  return rows.map((r) => {
    const outMinor = sumToMinor(r.out);
    const inMinor = sumToMinor(r.inn);
    return {
      personId: r.personId,
      name: r.name,
      avatar: r.avatar,
      color: r.color,
      relationshipType: r.relationshipType,
      outMinor,
      inMinor,
      balanceMinor: outMinor - inMinor,
      entryCount: Number(r.count),
      lastEntryDate: r.last ?? null,
    };
  });
}

/** Headline figures: the sheet's GIVEN and TAKEN totals, plus the net. */
/** Every live entry, oldest first — the export's PEERS tab. */
export async function listAllLedgerEntries(userId: string): Promise<LedgerEntryDTO[]> {
  const rows = await db
    .select({ entry: ledgerEntries, person: people })
    .from(ledgerEntries)
    .innerJoin(people, eq(people.id, ledgerEntries.personId))
    .where(live(userId))
    .orderBy(asc(ledgerEntries.entryDate), asc(ledgerEntries.createdAt));

  return rows.map(({ entry, person }) => ({
    id: entry.id,
    direction: entry.direction as LedgerDirection,
    amount: entry.amountMinor / 100,
    amountMinor: entry.amountMinor,
    entryDate: entry.entryDate,
    note: entry.note,
    person: { id: person.id, name: person.name, avatar: person.avatar, color: person.color },
    createdAt: entry.createdAt.toISOString(),
  }));
}

export async function getPeerSummary(userId: string) {
  const balances = await getPeerBalances(userId);
  const owedToMeMinor = balances.filter((b) => b.balanceMinor > 0).reduce((s, b) => s + b.balanceMinor, 0);
  const owedByMeMinor = balances.filter((b) => b.balanceMinor < 0).reduce((s, b) => s - b.balanceMinor, 0);

  return {
    balances,
    owedToMeMinor,
    owedByMeMinor,
    netMinor: owedToMeMinor - owedByMeMinor,
    // Settled peers stay listed so history isn't lost, but they're separated out.
    theyOwe: balances.filter((b) => b.balanceMinor > 0),
    iOwe: balances.filter((b) => b.balanceMinor < 0),
    settled: balances.filter((b) => b.balanceMinor === 0),
  };
}

function toDTO(row: typeof ledgerEntries.$inferSelect, person: PeerBalance | { id: string; name: string; avatar: string; color: string }): LedgerEntryDTO {
  return {
    id: row.id,
    direction: row.direction as LedgerDirection,
    amount: row.amountMinor / 100,
    amountMinor: row.amountMinor,
    entryDate: row.entryDate,
    note: row.note,
    person: 'id' in person
      ? { id: person.id, name: person.name, avatar: person.avatar, color: person.color }
      : { id: '', name: '', avatar: '', color: '' },
    createdAt: row.createdAt.toISOString(),
  };
}

/** Full history for one peer, newest first, with a running balance. */
export async function getPeerLedger(userId: string, personId: string) {
  const [person] = await db
    .select()
    .from(people)
    .where(and(eq(people.id, personId), eq(people.userId, userId)))
    .limit(1);
  if (!person) throw new ApiError(404, 'Person not found');

  const rows = await db
    .select()
    .from(ledgerEntries)
    .where(and(live(userId), eq(ledgerEntries.personId, personId)))
    .orderBy(asc(ledgerEntries.entryDate), asc(ledgerEntries.createdAt));

  // Running balance computed oldest-first, then reversed for display.
  let running = 0;
  const withRunning = rows.map((r) => {
    running += r.direction === 'out' ? r.amountMinor : -r.amountMinor;
    return {
      ...toDTO(r, person),
      runningBalanceMinor: running,
    };
  });

  const outMinor = rows.filter((r) => r.direction === 'out').reduce((s, r) => s + r.amountMinor, 0);
  const inMinor = rows.filter((r) => r.direction === 'in').reduce((s, r) => s + r.amountMinor, 0);

  return {
    person: {
      id: person.id,
      name: person.name,
      avatar: person.avatar,
      color: person.color,
      relationshipType: person.relationshipType,
    },
    outMinor,
    inMinor,
    balanceMinor: outMinor - inMinor,
    entries: withRunning.reverse(),
  };
}

async function assertPerson(userId: string, personId: string) {
  const [row] = await db
    .select({ id: people.id, isSelf: people.isSelf })
    .from(people)
    .where(and(eq(people.id, personId), eq(people.userId, userId)))
    .limit(1);
  if (!row) throw new ApiError(422, 'Person does not exist');
  // Lending to yourself is meaningless and would show a phantom debt.
  if (row.isSelf) throw new ApiError(422, 'Pick someone other than yourself');
  return row;
}

export async function createLedgerEntry(
  userId: string,
  input: { personId: string; direction: LedgerDirection; amount: number; entryDate: string; note?: string | null },
) {
  await assertPerson(userId, input.personId);
  const [row] = await db
    .insert(ledgerEntries)
    .values({
      userId,
      personId: input.personId,
      direction: input.direction,
      amountMinor: toMinor(input.amount),
      entryDate: input.entryDate,
      note: input.note?.trim() || null,
    })
    .returning();
  return row;
}

export async function updateLedgerEntry(
  userId: string,
  id: string,
  input: { personId?: string; direction?: LedgerDirection; amount?: number; entryDate?: string; note?: string | null },
) {
  const [existing] = await db
    .select()
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.id, id), live(userId)))
    .limit(1);
  if (!existing) throw new ApiError(404, 'Entry not found');
  if (input.personId) await assertPerson(userId, input.personId);

  const patch: Partial<typeof ledgerEntries.$inferInsert> = { updatedAt: new Date() };
  if (input.personId !== undefined) patch.personId = input.personId;
  if (input.direction !== undefined) patch.direction = input.direction;
  if (input.amount !== undefined) patch.amountMinor = toMinor(input.amount);
  if (input.entryDate !== undefined) patch.entryDate = input.entryDate;
  if (input.note !== undefined) patch.note = input.note?.trim() || null;

  const [row] = await db.update(ledgerEntries).set(patch).where(eq(ledgerEntries.id, id)).returning();
  return row;
}

/** Soft delete, matching expenses — so an undo is a real restore. */
export async function deleteLedgerEntry(userId: string, id: string) {
  const result = await db
    .update(ledgerEntries)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(ledgerEntries.id, id), live(userId)))
    .returning({ id: ledgerEntries.id });
  if (!result.length) throw new ApiError(404, 'Entry not found');
}

export async function restoreLedgerEntry(userId: string, id: string) {
  const result = await db
    .update(ledgerEntries)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(and(eq(ledgerEntries.id, id), eq(ledgerEntries.userId, userId)))
    .returning({ id: ledgerEntries.id });
  if (!result.length) throw new ApiError(404, 'Entry not found');
}
