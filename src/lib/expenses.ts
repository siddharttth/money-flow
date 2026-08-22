import { and, eq, gte, lte, isNull, sql, inArray, desc, asc } from 'drizzle-orm';
import { db } from '@/db';
import { expenses, expensePeople, categories, people } from '@/db/schema';
import { toMinor } from './money';
import { ApiError } from './api';
import type { CreateExpenseInput, UpdateExpenseInput } from './validation';

export type ExpenseDTO = {
  id: string;
  amount: number;
  amountMinor: number;
  expenseDate: string;
  note: string | null;
  paymentMethod: string | null;
  category: { id: string; name: string; icon: string; color: string; kind: string };
  people: { id: string; name: string; avatar: string; color: string }[];
  createdAt: string;
  updatedAt: string;
};

export type ListParams = {
  userId: string;
  start?: string;
  end?: string;
  categoryIds?: string[];
  personIds?: string[];
  minAmount?: number;
  maxAmount?: number;
  search?: string;
  sort?: 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc';
  limit?: number;
  offset?: number;
};

function listWhere(p: ListParams) {
  const clauses = [eq(expenses.userId, p.userId), isNull(expenses.deletedAt)];
  if (p.start) clauses.push(gte(expenses.expenseDate, p.start));
  if (p.end) clauses.push(lte(expenses.expenseDate, p.end));
  if (p.categoryIds?.length) clauses.push(inArray(expenses.categoryId, p.categoryIds));
  if (p.minAmount != null) clauses.push(gte(expenses.amountMinor, toMinor(p.minAmount)));
  if (p.maxAmount != null) clauses.push(lte(expenses.amountMinor, toMinor(p.maxAmount)));
  if (p.search) clauses.push(sql`${expenses.note} ILIKE ${'%' + p.search + '%'}`);

  if (p.personIds?.length) {
    const includesUnassigned = p.personIds.includes('none');
    const real = p.personIds.filter((id) => id !== 'none');
    const parts: ReturnType<typeof sql>[] = [];
    if (real.length) {
      parts.push(sql`EXISTS (
        SELECT 1 FROM ${expensePeople} ep
        WHERE ep.expense_id = ${expenses.id}
          AND ep.person_id IN ${sql`(${sql.join(real.map((id) => sql`${id}::uuid`), sql`, `)})`}
      )`);
    }
    if (includesUnassigned) {
      parts.push(sql`NOT EXISTS (SELECT 1 FROM ${expensePeople} ep WHERE ep.expense_id = ${expenses.id})`);
    }
    if (parts.length) clauses.push(sql`(${sql.join(parts, sql` OR `)})`);
  }

  return and(...clauses);
}

function orderBy(sort: ListParams['sort']) {
  switch (sort) {
    case 'date_asc':
      return [asc(expenses.expenseDate), asc(expenses.createdAt)];
    case 'amount_desc':
      return [desc(expenses.amountMinor), desc(expenses.expenseDate)];
    case 'amount_asc':
      return [asc(expenses.amountMinor), desc(expenses.expenseDate)];
    default:
      return [desc(expenses.expenseDate), desc(expenses.createdAt)];
  }
}

/**
 * Participants are fetched in a second query and stitched in, rather than via a
 * JOIN, so the expense rows themselves are never duplicated.
 */
async function attachPeople(rows: (typeof expenses.$inferSelect & { category: typeof categories.$inferSelect })[]) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const links = await db
    .select({
      expenseId: expensePeople.expenseId,
      id: people.id,
      name: people.name,
      avatar: people.avatar,
      color: people.color,
    })
    .from(expensePeople)
    .innerJoin(people, eq(people.id, expensePeople.personId))
    .where(inArray(expensePeople.expenseId, ids));

  const byExpense = new Map<string, ExpenseDTO['people']>();
  for (const l of links) {
    const list = byExpense.get(l.expenseId) ?? [];
    list.push({ id: l.id, name: l.name, avatar: l.avatar, color: l.color });
    byExpense.set(l.expenseId, list);
  }

  return rows.map((r) => toDTO(r, byExpense.get(r.id) ?? []));
}

function toDTO(
  row: typeof expenses.$inferSelect & { category: typeof categories.$inferSelect },
  participants: ExpenseDTO['people'],
): ExpenseDTO {
  return {
    id: row.id,
    amount: row.amountMinor / 100,
    amountMinor: row.amountMinor,
    expenseDate: row.expenseDate,
    note: row.note,
    paymentMethod: row.paymentMethod,
    category: {
      id: row.category.id,
      name: row.category.name,
      icon: row.category.icon,
      color: row.category.color,
      kind: row.category.kind,
    },
    people: participants,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listExpenses(p: ListParams): Promise<{ items: ExpenseDTO[]; total: number; totalMinor: number }> {
  const limit = Math.min(p.limit ?? 50, 200);
  const offset = p.offset ?? 0;
  const where = listWhere(p);

  const [rows, [agg]] = await Promise.all([
    db
      .select({ expense: expenses, category: categories })
      .from(expenses)
      .innerJoin(categories, eq(categories.id, expenses.categoryId))
      .where(where)
      .orderBy(...orderBy(p.sort))
      .limit(limit)
      .offset(offset),
    db
      .select({
        count: sql<string>`COUNT(*)`,
        total: sql<string>`COALESCE(SUM(${expenses.amountMinor}), 0)`,
      })
      .from(expenses)
      .where(where),
  ]);

  const items = await attachPeople(rows.map((r) => ({ ...r.expense, category: r.category })));

  return {
    items,
    total: Number(agg?.count ?? 0),
    totalMinor: Number(agg?.total ?? 0),
  };
}

export async function getExpense(userId: string, id: string): Promise<ExpenseDTO> {
  const [row] = await db
    .select({ expense: expenses, category: categories })
    .from(expenses)
    .innerJoin(categories, eq(categories.id, expenses.categoryId))
    .where(and(eq(expenses.id, id), eq(expenses.userId, userId), isNull(expenses.deletedAt)))
    .limit(1);

  if (!row) throw new ApiError(404, 'Expense not found');
  const [dto] = await attachPeople([{ ...row.expense, category: row.category }]);
  return dto;
}

/** Category must exist, belong to this user, and be active. */
async function assertCategory(userId: string, categoryId: string) {
  const [cat] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
    .limit(1);
  if (!cat) throw new ApiError(422, 'Category does not exist');
  if (!cat.isActive) throw new ApiError(422, `Category "${cat.name}" is disabled`);
}

/** Silently drops person ids that aren't this user's, rather than trusting input. */
async function validPersonIds(userId: string, ids: string[]): Promise<string[]> {
  const unique = [...new Set(ids)];
  if (!unique.length) return [];
  const rows = await db
    .select({ id: people.id })
    .from(people)
    .where(and(eq(people.userId, userId), inArray(people.id, unique)));
  if (rows.length !== unique.length) throw new ApiError(422, 'One or more people do not exist');
  return rows.map((r) => r.id);
}

export async function createExpense(userId: string, input: CreateExpenseInput): Promise<ExpenseDTO> {
  await assertCategory(userId, input.categoryId);
  const personIds = await validPersonIds(userId, input.personIds ?? []);

  const id = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(expenses)
      .values({
        userId,
        amountMinor: toMinor(input.amount),
        categoryId: input.categoryId,
        expenseDate: input.expenseDate,
        note: input.note?.trim() || null,
        paymentMethod: input.paymentMethod || null,
      })
      .returning({ id: expenses.id });

    if (personIds.length) {
      await tx.insert(expensePeople).values(
        personIds.map((personId) => ({ expenseId: row.id, personId, shareAmountMinor: null })),
      );
    }
    return row.id;
  });

  return getExpense(userId, id);
}

/**
 * Edits rewrite the participant set wholesale inside the same transaction, so
 * category/person/amount analytics can never observe a half-updated expense.
 */
export async function updateExpense(userId: string, id: string, input: UpdateExpenseInput): Promise<ExpenseDTO> {
  const [existing] = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.id, id), eq(expenses.userId, userId), isNull(expenses.deletedAt)))
    .limit(1);
  if (!existing) throw new ApiError(404, 'Expense not found');

  if (input.categoryId) await assertCategory(userId, input.categoryId);
  const personIds = input.personIds ? await validPersonIds(userId, input.personIds) : null;

  await db.transaction(async (tx) => {
    const patch: Partial<typeof expenses.$inferInsert> = { updatedAt: new Date() };
    if (input.amount !== undefined) patch.amountMinor = toMinor(input.amount);
    if (input.categoryId !== undefined) patch.categoryId = input.categoryId;
    if (input.expenseDate !== undefined) patch.expenseDate = input.expenseDate;
    if (input.note !== undefined) patch.note = input.note?.trim() || null;
    if (input.paymentMethod !== undefined) patch.paymentMethod = input.paymentMethod || null;

    await tx.update(expenses).set(patch).where(eq(expenses.id, id));

    if (personIds) {
      await tx.delete(expensePeople).where(eq(expensePeople.expenseId, id));
      if (personIds.length) {
        await tx.insert(expensePeople).values(
          personIds.map((personId) => ({ expenseId: id, personId, shareAmountMinor: null })),
        );
      }
    }
  });

  return getExpense(userId, id);
}

/** Soft delete — the row stays, but every analytics query filters it out. */
export async function deleteExpense(userId: string, id: string): Promise<void> {
  const result = await db
    .update(expenses)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(expenses.id, id), eq(expenses.userId, userId), isNull(expenses.deletedAt)))
    .returning({ id: expenses.id });

  if (!result.length) throw new ApiError(404, 'Expense not found');
}

export async function restoreExpense(userId: string, id: string): Promise<ExpenseDTO> {
  const result = await db
    .update(expenses)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(and(eq(expenses.id, id), eq(expenses.userId, userId)))
    .returning({ id: expenses.id });
  if (!result.length) throw new ApiError(404, 'Expense not found');
  return getExpense(userId, id);
}

export async function duplicateExpense(userId: string, id: string, expenseDate?: string): Promise<ExpenseDTO> {
  const source = await getExpense(userId, id);
  return createExpense(userId, {
    amount: source.amount,
    categoryId: source.category.id,
    expenseDate: expenseDate ?? source.expenseDate,
    note: source.note,
    personIds: source.people.map((p) => p.id),
    paymentMethod: source.paymentMethod,
  });
}
