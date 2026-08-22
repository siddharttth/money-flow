/**
 * GOOGLE SHEET IMPORTER
 * ---------------------
 * The old sheet stores one row per day, with category columns AND person
 * columns side by side:
 *
 *   DATE      | OUTSIDE FOOD | TRANSPORT | SANKALP | MUMMY | TOTAL
 *   2-Aug-26  |          484 |           |     484 |       |   484
 *
 * That row is ONE ₹484 expense — Outside Food, associated with Sankalp — not
 * ₹968. The importer's whole job is reconstructing that intent without ever
 * double counting. It is pure (no DB, no I/O) so it is fully unit-testable.
 */

export const CATEGORY_ALIASES: Record<string, string> = {
  'BILLS/RECHARGE': 'Bills / Recharge',
  'BILLS / RECHARGE': 'Bills / Recharge',
  BILLS: 'Bills / Recharge',
  RECHARGE: 'Bills / Recharge',
  'CIGGS/ALC': 'Ciggs / Alc',
  'CIGGS / ALC': 'Ciggs / Alc',
  CIGGS: 'Ciggs / Alc',
  'OUTSIDE FOOD': 'Outside Food',
  FOOD: 'Outside Food',
  'FRUITS/VEGIES': 'Fruits / Veggies',
  'FRUITS/VEGGIES': 'Fruits / Veggies',
  'FRUITS / VEGGIES': 'Fruits / Veggies',
  SHOPPING: 'Shopping',
  TRANSPORT: 'Transport',
  MISC: 'Misc',
  RANDOMS: 'Misc',
  INVESTMENT: 'Investment',
};

/** Columns that are people, not categories, in the original sheet. */
export const PERSON_COLUMNS = ['MSSIL', 'ADITI', 'MUMMY', 'AARYA', 'SANKALP'];

/** Columns that carry no expense data. */
export const IGNORED_COLUMNS = ['DATE', 'TOTAL', 'TOTALS', 'SUM', 'NOTES', 'NOTE', 'REMARKS', ''];

export type ColumnRole = 'date' | 'category' | 'person' | 'ignore';

export type ColumnMapping = {
  header: string;
  role: ColumnRole;
  /** Target category or person name once imported. */
  target: string;
};

export type ImportedRow = {
  amount: number;
  categoryName: string;
  expenseDate: string;
  personName: string | null;
  note: string | null;
  /** How this transaction was reconstructed — surfaced in the preview UI. */
  matchKind: 'paired' | 'category-only' | 'person-only';
};

export type ImportPreview = {
  mapping: ColumnMapping[];
  rows: ImportedRow[];
  warnings: string[];
  /** Sum of the reconstructed transactions — must equal sheetTotal. */
  computedTotal: number;
  /** Sum of the sheet's own TOTAL column, when present. */
  sheetTotal: number | null;
  skippedRows: number;
};

const norm = (s: string) => s.trim().toUpperCase().replace(/\s+/g, ' ');

/** Guess whether each CSV column is the date, a category, a person, or noise. */
export function inferMapping(headers: string[], knownPeople: string[] = []): ColumnMapping[] {
  const peopleSet = new Set([...PERSON_COLUMNS, ...knownPeople.map(norm)]);
  return headers.map((header) => {
    const key = norm(header);
    if (key === 'DATE') return { header, role: 'date' as const, target: 'date' };
    if (IGNORED_COLUMNS.includes(key)) return { header, role: 'ignore' as const, target: '' };
    if (peopleSet.has(key)) return { header, role: 'person' as const, target: titleCase(header) };
    return {
      header,
      role: 'category' as const,
      target: CATEGORY_ALIASES[key] ?? titleCase(header),
    };
  });
}

function titleCase(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .split(/([\s/]+)/)
    .map((part) => (/^[\s/]+$/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join('');
}

/** Accepts '2-Aug-26', '02/08/2026', '2026-08-02', '2 Aug 2026'. */
export function parseSheetDate(raw: string, fallbackYear?: number): string | null {
  const s = raw.trim();
  if (!s) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const months: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  };

  // 2-Aug-26 | 2 Aug 2026 | 02-August-2026
  const named = s.match(/^(\d{1,2})[-\s/]+([A-Za-z]{3,9})[-\s/]+(\d{2,4})$/);
  if (named) {
    const day = Number(named[1]);
    const month = months[named[2].slice(0, 3).toLowerCase()];
    if (!month) return null;
    return iso(expandYear(Number(named[3])), month, day);
  }

  // 2-Aug (no year) — needs the month tab's year
  const noYear = s.match(/^(\d{1,2})[-\s/]+([A-Za-z]{3,9})$/);
  if (noYear && fallbackYear) {
    const month = months[noYear[2].slice(0, 3).toLowerCase()];
    if (!month) return null;
    return iso(fallbackYear, month, Number(noYear[1]));
  }

  // 02/08/2026 — day-first, matching the Indian sheet convention
  const numeric = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (numeric) {
    return iso(expandYear(Number(numeric[3])), Number(numeric[2]), Number(numeric[1]));
  }

  return null;
}

function expandYear(y: number): number {
  return y < 100 ? 2000 + y : y;
}

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d > last) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** '₹1,234.50' | '1234.5' | '' -> number | 0 */
export function parseAmount(raw: string): number {
  if (raw == null) return 0;
  const cleaned = String(raw).replace(/[₹,\s]/g, '').replace(/^-$/, '');
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

type Bucket = { name: string; amount: number };

/**
 * The reconstruction rules, in priority order, for a single sheet row:
 *
 *  1. A person amount that exactly equals a category amount pairs with it.
 *  2. A person amount equal to the sum of 2–3 category amounts pairs with all
 *     of them (one transaction each, all tagged to that person).
 *  3. Leftover category amounts become transactions with no person.
 *  4. Leftover person amounts become transactions under the fallback category.
 *
 * Every rupee in the row is emitted exactly once. Rules 1 and 2 only ever
 * *tag* an existing category amount — they never add to the total.
 */
export function reconstructRow(
  categories: Bucket[],
  persons: Bucket[],
  date: string,
  fallbackCategory = 'Misc',
): { rows: ImportedRow[]; warnings: string[] } {
  const cats = categories.filter((c) => c.amount > 0).map((c) => ({ ...c, used: false }));
  const ppl = persons.filter((p) => p.amount > 0).map((p) => ({ ...p, used: false }));
  const rows: ImportedRow[] = [];
  const warnings: string[] = [];

  // Rule 1 — exact 1:1 pairing.
  for (const person of ppl) {
    const match = cats.find((c) => !c.used && nearlyEqual(c.amount, person.amount));
    if (match) {
      match.used = true;
      person.used = true;
      rows.push({
        amount: match.amount,
        categoryName: match.name,
        expenseDate: date,
        personName: person.name,
        note: null,
        matchKind: 'paired',
      });
    }
  }

  // Rule 2 — one person amount covering a small combination of categories.
  for (const person of ppl) {
    if (person.used) continue;
    const combo = findSubset(cats.filter((c) => !c.used), person.amount);
    if (!combo) continue;
    person.used = true;
    for (const c of combo) {
      c.used = true;
      rows.push({
        amount: c.amount,
        categoryName: c.name,
        expenseDate: date,
        personName: person.name,
        note: null,
        matchKind: 'paired',
      });
    }
  }

  // Rule 3 — categories with nobody attached.
  for (const c of cats) {
    if (c.used) continue;
    rows.push({
      amount: c.amount,
      categoryName: c.name,
      expenseDate: date,
      personName: null,
      note: null,
      matchKind: 'category-only',
    });
  }

  // Rule 4 — a person column with no matching category.
  for (const p of ppl) {
    if (p.used) continue;
    rows.push({
      amount: p.amount,
      categoryName: fallbackCategory,
      expenseDate: date,
      personName: p.name,
      note: null,
      matchKind: 'person-only',
    });
    warnings.push(
      `${date}: ₹${p.amount} under "${p.name}" had no matching category amount — filed under ${fallbackCategory}.`,
    );
  }

  return { rows, warnings };
}

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005;
}

/** Subsets of size 2 and 3 only — keeps this linear enough for a daily row. */
function findSubset<T extends { amount: number }>(items: T[], target: number): T[] | null {
  const n = items.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (nearlyEqual(items[i].amount + items[j].amount, target)) return [items[i], items[j]];
      for (let k = j + 1; k < n; k++) {
        if (nearlyEqual(items[i].amount + items[j].amount + items[k].amount, target)) {
          return [items[i], items[j], items[k]];
        }
      }
    }
  }
  return null;
}

/**
 * Full CSV -> preview. `records` is an array of header->cell maps
 * (what Papa.parse with header:true produces).
 */
export function buildPreview(
  records: Record<string, string>[],
  mapping: ColumnMapping[],
  opts: { fallbackYear?: number; fallbackCategory?: string } = {},
): ImportPreview {
  const dateCol = mapping.find((m) => m.role === 'date');
  const catCols = mapping.filter((m) => m.role === 'category');
  const personCols = mapping.filter((m) => m.role === 'person');
  const rows: ImportedRow[] = [];
  const warnings: string[] = [];
  let sheetTotal = 0;
  let sawTotalColumn = false;
  let skippedRows = 0;

  const totalHeader = Object.keys(records[0] ?? {}).find((h) => norm(h) === 'TOTAL');

  if (!dateCol) {
    warnings.push('No DATE column was identified — map one before importing.');
    return { mapping, rows: [], warnings, computedTotal: 0, sheetTotal: null, skippedRows: records.length };
  }

  for (const record of records) {
    const date = parseSheetDate(record[dateCol.header] ?? '', opts.fallbackYear);
    if (!date) {
      const anyValue = Object.values(record).some((v) => parseAmount(v) > 0);
      if (anyValue) {
        skippedRows++;
        warnings.push(`Skipped a row with amounts but an unreadable date: "${record[dateCol.header] ?? ''}".`);
      }
      continue;
    }

    if (totalHeader) {
      const t = parseAmount(record[totalHeader]);
      if (t > 0) {
        sheetTotal += t;
        sawTotalColumn = true;
      }
    }

    const cats = catCols.map((c) => ({ name: c.target, amount: parseAmount(record[c.header]) }));
    const ppl = personCols.map((p) => ({ name: p.target, amount: parseAmount(record[p.header]) }));

    const result = reconstructRow(cats, ppl, date, opts.fallbackCategory ?? 'Misc');
    rows.push(...result.rows);
    warnings.push(...result.warnings);
  }

  const computedTotal = round2(rows.reduce((sum, r) => sum + r.amount, 0));
  const finalSheetTotal = sawTotalColumn ? round2(sheetTotal) : null;

  if (finalSheetTotal !== null && Math.abs(finalSheetTotal - computedTotal) > 0.5) {
    warnings.push(
      `Reconstructed total (₹${computedTotal}) does not match the sheet's TOTAL column (₹${finalSheetTotal}). ` +
        `Check the column mapping before importing — a person column mapped as a category would inflate this.`,
    );
  }

  return { mapping, rows, warnings, computedTotal, sheetTotal: finalSheetTotal, skippedRows };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
