import { db } from '@/db';
import { categories, people, expenses, expensePeople } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { ApiError, ok, parseBody, withAuth } from '@/lib/api';
import { importCommitSchema } from '@/lib/validation';
import { pickColor, slugify } from '@/lib/defaults';
import { getSelfPersonId } from '@/lib/expenses';
import { toMinor } from '@/lib/money';
import { randomUUID } from 'crypto';

/**
 * Writes the previewed rows. Categories/people are matched case-insensitively
 * by name and created on demand, so importing twice does not fork the taxonomy.
 * Everything happens in one transaction — a partial import is impossible.
 */
export const POST = withAuth(async (req, session) => {
  const input = await parseBody(req, importCommitSchema);
  const batchId = randomUUID();

  const result = await db.transaction(async (tx) => {
    const existingCats = await tx.select().from(categories).where(eq(categories.userId, session.userId));
    const existingPeople = await tx.select().from(people).where(eq(people.userId, session.userId));

    const catByName = new Map(existingCats.map((c) => [c.name.toLowerCase(), c]));
    const personByName = new Map(existingPeople.map((p) => [p.name.toLowerCase(), p]));

    let createdCategories = 0;
    let createdPeople = 0;
    // Rows with no person column are your own spending, same rule as the form.
    const selfId = existingPeople.find((p) => p.isSelf)?.id ?? (await getSelfPersonId(session.userId));

    async function ensureCategory(name: string) {
      const key = name.toLowerCase();
      const hit = catByName.get(key);
      if (hit) return hit;
      if (!input.createMissing) throw new ApiError(422, `Unknown category "${name}"`);
      const [row] = await tx
        .insert(categories)
        .values({
          userId: session.userId,
          name,
          slug: `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`,
          color: pickColor(catByName.size),
          sortOrder: catByName.size,
        })
        .returning();
      catByName.set(key, row);
      createdCategories++;
      return row;
    }

    async function ensurePerson(name: string) {
      const key = name.toLowerCase();
      const hit = personByName.get(key);
      if (hit) return hit;
      if (!input.createMissing) throw new ApiError(422, `Unknown person "${name}"`);
      const [row] = await tx
        .insert(people)
        .values({
          userId: session.userId,
          name,
          relationshipType: 'other',
          color: pickColor(personByName.size),
          sortOrder: personByName.size,
        })
        .returning();
      personByName.set(key, row);
      createdPeople++;
      return row;
    }

    let importedMinor = 0;
    const links: { expenseId: string; personId: string }[] = [];
    const values: (typeof expenses.$inferInsert)[] = [];
    const pendingLinks: { index: number; personId: string }[] = [];

    for (const [i, row] of input.rows.entries()) {
      const cat = await ensureCategory(row.categoryName);
      const minor = toMinor(row.amount);
      importedMinor += minor;
      values.push({
        userId: session.userId,
        amountMinor: minor,
        categoryId: cat.id,
        expenseDate: row.expenseDate,
        note: row.note?.trim() || null,
        source: 'import',
        importBatchId: batchId,
      });
      if (row.personName) {
        const person = await ensurePerson(row.personName);
        pendingLinks.push({ index: i, personId: person.id });
      } else if (selfId) {
        pendingLinks.push({ index: i, personId: selfId });
      }
    }

    // Chunked so a large sheet doesn't exceed the parameter limit.
    const inserted: { id: string }[] = [];
    for (let i = 0; i < values.length; i += 500) {
      const chunk = await tx.insert(expenses).values(values.slice(i, i + 500)).returning({ id: expenses.id });
      inserted.push(...chunk);
    }

    for (const link of pendingLinks) {
      links.push({ expenseId: inserted[link.index].id, personId: link.personId });
    }
    for (let i = 0; i < links.length; i += 500) {
      await tx.insert(expensePeople).values(links.slice(i, i + 500).map((l) => ({ ...l, shareAmountMinor: null })));
    }

    return {
      batchId,
      importedCount: inserted.length,
      importedTotal: importedMinor / 100,
      createdCategories,
      createdPeople,
      linkedPeople: links.length,
    };
  });

  return ok(result, 201);
});
