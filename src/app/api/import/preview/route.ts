import { db } from '@/db';
import { people } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { ApiError, ok, withAuth } from '@/lib/api';
import { buildPreview, inferMapping, type ColumnMapping } from '@/lib/importer';
import Papa from 'papaparse';

/**
 * Parses CSV and returns the reconstructed transactions WITHOUT writing
 * anything. The client shows this for confirmation; commit is a separate call.
 */
export const POST = withAuth(async (req, session) => {
  const body = await req.json().catch(() => null);
  if (!body?.csv || typeof body.csv !== 'string') {
    throw new ApiError(400, 'Send { csv: "<file contents>" }');
  }
  if (body.csv.length > 4_000_000) throw new ApiError(413, 'CSV is too large (4MB max)');

  const parsed = Papa.parse<Record<string, string>>(body.csv.trim(), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  });

  if (!parsed.meta.fields?.length) throw new ApiError(422, 'Could not read a header row from that CSV');

  const known = await db
    .select({ name: people.name })
    .from(people)
    .where(eq(people.userId, session.userId));

  const mapping: ColumnMapping[] =
    Array.isArray(body.mapping) && body.mapping.length
      ? body.mapping
      : inferMapping(parsed.meta.fields, known.map((p) => p.name));

  const preview = buildPreview(parsed.data, mapping, {
    fallbackYear: body.fallbackYear ? Number(body.fallbackYear) : undefined,
    fallbackCategory: body.fallbackCategory || 'Misc',
  });

  if (parsed.errors.length) {
    preview.warnings.push(...parsed.errors.slice(0, 5).map((e) => `CSV parse: ${e.message} (row ${e.row})`));
  }

  return ok(preview);
});
