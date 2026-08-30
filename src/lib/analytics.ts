import { and, eq, gte, lte, isNull, sql, inArray, desc } from 'drizzle-orm';
import { db } from '@/db';
import { expenses, expensePeople, categories, people } from '@/db/schema';
import { sumToMinor } from './money';
import { daysBetween, monthRange, shiftMonth, todayISO, weekRange } from './dates';

/**
 * THE ONE RULE THIS FILE ENFORCES
 * -------------------------------
 * `expenses` is the only table that contributes to total spending.
 * Category totals and person totals are two independent *dimensions* of the
 * same rows. They are never added together, and the person dimension is
 * computed with a join that is always constrained to live expenses.
 *
 * A single expense tagged with 3 people contributes its full amount to each of
 * those 3 people's association totals — that is the intended "who was this
 * associated with" semantic — which is exactly why person totals can exceed
 * the grand total and must never be summed into it. Responses that carry a
 * person breakdown always ship `grandTotal` alongside so the UI has the real
 * number to display.
 *
 * THE SECOND RULE: INVESTING IS NOT SPENDING
 * ------------------------------------------
 * ₹10,000 into a SIP left the current account but did not leave your net
 * worth — it moved from one pocket to another, the same way a loan does.
 * Counting it as spending makes every month look ruinous and makes the
 * daily pace, the projection and the month-over-month comparison meaningless.
 *
 * So every query here excludes categories marked `kind = 'investment'` by
 * default. `include` opts back in: 'investment' for the investments screen,
 * 'all' for anything that genuinely means "money that moved".
 */

export type Filters = {
  userId: string;
  start?: string;
  end?: string;
  categoryIds?: string[];
  personIds?: string[];
  /** Defaults to 'spending' — investment categories are left out. */
  include?: 'spending' | 'investment' | 'all';
};

/**
 * Written as a subquery rather than a join so it can drop into any of these
 * queries without changing their row shape — a join to `categories` would
 * multiply nothing here, but it would force every caller to group by more
 * columns than it means to.
 */
export function kindPredicate(include: Filters['include']) {
  if (include === 'all') return undefined;
  const test = include === 'investment' ? sql`=` : sql`<>`;
  return sql`EXISTS (
    SELECT 1 FROM ${categories} c
    WHERE c.id = ${expenses.categoryId} AND c.kind ${test} 'investment'
  )`;
}

/** Base predicate: this user, not soft-deleted, inside the date window. */
function baseWhere(f: Filters) {
  const clauses = [eq(expenses.userId, f.userId), isNull(expenses.deletedAt)];
  if (f.start) clauses.push(gte(expenses.expenseDate, f.start));
  if (f.end) clauses.push(lte(expenses.expenseDate, f.end));
  if (f.categoryIds?.length) clauses.push(inArray(expenses.categoryId, f.categoryIds));
  const kind = kindPredicate(f.include);
  if (kind) clauses.push(kind);
  return and(...clauses);
}

/**
 * Person filtering uses EXISTS rather than a JOIN on purpose: joining would
 * duplicate an expense row once per matching participant and inflate SUM().
 */
function personFilter(personIds?: string[]) {
  if (!personIds?.length) return undefined;
  const includesUnassigned = personIds.includes('none');
  const real = personIds.filter((id) => id !== 'none');

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
  if (!parts.length) return undefined;
  return sql`(${sql.join(parts, sql` OR `)})`;
}

function whereAll(f: Filters) {
  const pf = personFilter(f.personIds);
  return pf ? and(baseWhere(f), pf) : baseWhere(f);
}

/** Total actual money spent. Single table, zero joins — cannot double count. */
export async function getTotal(f: Filters): Promise<{ totalMinor: number; count: number }> {
  const [row] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${expenses.amountMinor}), 0)`,
      count: sql<string>`COUNT(*)`,
    })
    .from(expenses)
    .where(whereAll(f));

  return { totalMinor: sumToMinor(row?.total), count: Number(row?.count ?? 0) };
}

export type CategoryStat = {
  categoryId: string;
  name: string;
  slug: string;
  icon: string;
  color: string;
  kind: string;
  totalMinor: number;
  count: number;
  share: number;
};

/** Spending grouped by category. These DO sum to the grand total. */
export async function getCategoryBreakdown(f: Filters): Promise<CategoryStat[]> {
  const rows = await db
    .select({
      categoryId: categories.id,
      name: categories.name,
      slug: categories.slug,
      icon: categories.icon,
      color: categories.color,
      kind: categories.kind,
      total: sql<string>`COALESCE(SUM(${expenses.amountMinor}), 0)`,
      count: sql<string>`COUNT(${expenses.id})`,
    })
    .from(expenses)
    .innerJoin(categories, eq(categories.id, expenses.categoryId))
    .where(whereAll(f))
    .groupBy(categories.id, categories.name, categories.slug, categories.icon, categories.color, categories.kind)
    .orderBy(desc(sql`SUM(${expenses.amountMinor})`));

  const grand = rows.reduce((s, r) => s + sumToMinor(r.total), 0);

  return rows.map((r) => ({
    categoryId: r.categoryId,
    name: r.name,
    slug: r.slug,
    icon: r.icon,
    color: r.color,
    kind: r.kind,
    totalMinor: sumToMinor(r.total),
    count: Number(r.count),
    share: grand > 0 ? sumToMinor(r.total) / grand : 0,
  }));
}

export type PersonStat = {
  personId: string;
  name: string;
  avatar: string;
  color: string;
  relationshipType: string;
  isSelf: boolean;
  totalMinor: number;
  count: number;
};

/**
 * Spending *associated with* each person.
 * COALESCE(share, amount) means the day splitting ships, filling in
 * share_amount_minor changes this number and nothing else.
 */
export async function getPersonBreakdown(
  f: Filters,
): Promise<{ people: PersonStat[]; unassignedMinor: number; unassignedCount: number; grandTotalMinor: number }> {
  const rows = await db
    .select({
      personId: people.id,
      name: people.name,
      avatar: people.avatar,
      color: people.color,
      relationshipType: people.relationshipType,
      isSelf: people.isSelf,
      total: sql<string>`COALESCE(SUM(COALESCE(${expensePeople.shareAmountMinor}, ${expenses.amountMinor})), 0)`,
      count: sql<string>`COUNT(${expenses.id})`,
    })
    .from(expensePeople)
    .innerJoin(expenses, eq(expenses.id, expensePeople.expenseId))
    .innerJoin(people, eq(people.id, expensePeople.personId))
    .where(whereAll(f))
    .groupBy(people.id, people.name, people.avatar, people.color, people.relationshipType, people.isSelf)
    .orderBy(desc(sql`SUM(COALESCE(${expensePeople.shareAmountMinor}, ${expenses.amountMinor}))`));

  // Expenses with nobody attached — reported separately, never folded into a person.
  const [unassigned] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${expenses.amountMinor}), 0)`,
      count: sql<string>`COUNT(*)`,
    })
    .from(expenses)
    .where(
      and(
        whereAll(f),
        sql`NOT EXISTS (SELECT 1 FROM ${expensePeople} ep WHERE ep.expense_id = ${expenses.id})`,
      ),
    );

  const { totalMinor } = await getTotal(f);

  return {
    people: rows.map((r) => ({
      personId: r.personId,
      name: r.name,
      avatar: r.avatar,
      color: r.color,
      relationshipType: r.relationshipType,
      isSelf: r.isSelf,
      totalMinor: sumToMinor(r.total),
      count: Number(r.count),
    })),
    unassignedMinor: sumToMinor(unassigned?.total),
    unassignedCount: Number(unassigned?.count ?? 0),
    grandTotalMinor: totalMinor,
  };
}

/** Person x category matrix — powers the per-person category breakdown. */
export async function getPersonCategoryBreakdown(f: Filters & { personId: string }) {
  const rows = await db
    .select({
      categoryId: categories.id,
      name: categories.name,
      icon: categories.icon,
      color: categories.color,
      total: sql<string>`COALESCE(SUM(COALESCE(${expensePeople.shareAmountMinor}, ${expenses.amountMinor})), 0)`,
      count: sql<string>`COUNT(${expenses.id})`,
    })
    .from(expensePeople)
    .innerJoin(expenses, eq(expenses.id, expensePeople.expenseId))
    .innerJoin(categories, eq(categories.id, expenses.categoryId))
    .where(and(whereAll(f), eq(expensePeople.personId, f.personId)))
    .groupBy(categories.id, categories.name, categories.icon, categories.color)
    .orderBy(desc(sql`SUM(COALESCE(${expensePeople.shareAmountMinor}, ${expenses.amountMinor}))`));

  return rows.map((r) => ({
    categoryId: r.categoryId,
    name: r.name,
    icon: r.icon,
    color: r.color,
    totalMinor: sumToMinor(r.total),
    count: Number(r.count),
  }));
}

/** Per-day totals for the trend chart and the month's day-grouped list. */
export async function getDailyTotals(f: Filters): Promise<{ date: string; totalMinor: number; count: number }[]> {
  const rows = await db
    .select({
      date: expenses.expenseDate,
      total: sql<string>`COALESCE(SUM(${expenses.amountMinor}), 0)`,
      count: sql<string>`COUNT(*)`,
    })
    .from(expenses)
    .where(whereAll(f))
    .groupBy(expenses.expenseDate)
    .orderBy(expenses.expenseDate);

  return rows.map((r) => ({ date: r.date, totalMinor: sumToMinor(r.total), count: Number(r.count) }));
}

/** Month-over-month totals, oldest first. */
export async function getMonthlyTotals(userId: string, months: number) {
  const start = monthRange(shiftMonth(currentMonthOf(todayISO()), -(months - 1))).start;
  const rows = await db
    .select({
      month: sql<string>`to_char(${expenses.expenseDate}, 'YYYY-MM')`,
      total: sql<string>`COALESCE(SUM(${expenses.amountMinor}), 0)`,
      count: sql<string>`COUNT(*)`,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.userId, userId),
        isNull(expenses.deletedAt),
        gte(expenses.expenseDate, start),
        kindPredicate('spending'),
      ),
    )
    .groupBy(sql`to_char(${expenses.expenseDate}, 'YYYY-MM')`)
    .orderBy(sql`to_char(${expenses.expenseDate}, 'YYYY-MM')`);

  return rows.map((r) => ({ month: r.month, totalMinor: sumToMinor(r.total), count: Number(r.count) }));
}

function currentMonthOf(iso: string): string {
  return iso.slice(0, 7);
}

/** Everything the dashboard header needs, in one round trip. */
export async function getSummary(userId: string, month: string) {
  const { start, end } = monthRange(month);
  const prev = monthRange(shiftMonth(month, -1));
  const today = todayISO();
  const week = weekRange(today);

  const [thisMonth, lastMonth, todayTotal, weekTotal, daily, catStats] = await Promise.all([
    getTotal({ userId, start, end }),
    getTotal({ userId, start: prev.start, end: prev.end }),
    getTotal({ userId, start: today, end: today }),
    getTotal({ userId, start: week.start, end: week.end }),
    getDailyTotals({ userId, start, end }),
    getCategoryBreakdown({ userId, start, end }),
  ]);

  const topDay = daily.reduce<{ date: string; totalMinor: number } | null>(
    (best, d) => (!best || d.totalMinor > best.totalMinor ? { date: d.date, totalMinor: d.totalMinor } : best),
    null,
  );

  // Average across elapsed days for the current month, full length for past months.
  const monthIsCurrent = month === today.slice(0, 7);
  const elapsed = monthIsCurrent ? daysBetween(start, today) : daysBetween(start, end);
  const avgDailyMinor = elapsed > 0 ? Math.round(thisMonth.totalMinor / elapsed) : 0;

  const changePct =
    lastMonth.totalMinor > 0
      ? ((thisMonth.totalMinor - lastMonth.totalMinor) / lastMonth.totalMinor) * 100
      : null;

  return {
    month,
    totalMinor: thisMonth.totalMinor,
    transactionCount: thisMonth.count,
    todayMinor: todayTotal.totalMinor,
    weekMinor: weekTotal.totalMinor,
    avgDailyMinor,
    previousMonth: { month: shiftMonth(month, -1), totalMinor: lastMonth.totalMinor },
    changePct,
    topCategory: catStats[0] ?? null,
    topDay,
    daysWithSpending: daily.length,
    activeDays: elapsed,
  };
}
