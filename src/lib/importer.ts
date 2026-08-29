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
  // Real headers from the sheet this app replaced, typos and all.
  MSSIL: 'Misc',
  MISCL: 'Misc',
  TANSPORT: 'Transport',
  TRANPORT: 'Transport',
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

/*
 * Columns that are people, not categories.
 *
 * MSSIL used to be in this list, which was wrong and expensive: in the sheet
 * it sits between TANSPORT and INVESTMENT and it is a misspelling of MISC. As
 * a person column it invented a contact named "Mssil" and filed a month of
 * miscellaneous spending under them.
 */
export const PERSON_COLUMNS = ['ADITI', 'MUMMY', 'MUMMA', 'PAPA', 'AARYA', 'SANKALP'];

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
  /** Which shape the sheet turned out to be. Shown in the preview UI. */
  layout?: SheetLayout;
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

/** Strips everything but letters and digits, for comparing headers loosely. */
const squash = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Levenshtein, capped — used only on short header strings. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length || !b.length) return Math.max(a.length, b.length);
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = row;
  }
  return prev[b.length];
}

/**
 * Matches a sheet header to a category that already exists.
 *
 * Headers in a hand-kept spreadsheet are typed by a person over years:
 * "TANSPORT", "Ciggs/Alc", "outside food". An exact lookup created a brand new
 * category for each variant, quietly splitting a year of history in two. This
 * allows one edit per five characters, which is enough for a typo and a
 * plural but not enough to confuse two real categories.
 */
export function matchCategory(header: string, known: string[]): string | null {
  const key = norm(header);
  if (CATEGORY_ALIASES[key]) return CATEGORY_ALIASES[key];

  const target = squash(header);
  if (!target) return null;

  let best: { name: string; distance: number } | null = null;
  for (const name of known) {
    const candidate = squash(name);
    if (candidate === target) return name;
    const distance = editDistance(target, candidate);
    if (distance <= Math.max(1, Math.floor(candidate.length / 5)) && (!best || distance < best.distance)) {
      best = { name, distance };
    }
  }
  return best?.name ?? null;
}

/**
 * Guess whether each CSV column is the date, a category, a person, or noise.
 *
 * `knownCategories` is what makes this forgiving: with the account's real
 * category names in hand, a misspelled header lands on the existing category
 * instead of creating a near-duplicate.
 */
export function inferMapping(
  headers: string[],
  knownPeople: string[] = [],
  knownCategories: string[] = [],
): ColumnMapping[] {
  const peopleSet = new Set([...PERSON_COLUMNS, ...knownPeople.map(norm)]);
  return headers.map((header) => {
    const key = norm(header);
    if (key === 'DATE') return { header, role: 'date' as const, target: 'date' };
    if (IGNORED_COLUMNS.includes(key)) return { header, role: 'ignore' as const, target: '' };
    if (peopleSet.has(key)) return { header, role: 'person' as const, target: titleCase(header) };
    return {
      header,
      role: 'category' as const,
      target: matchCategory(header, knownCategories) ?? titleCase(header),
    };
  });
}

/* ------------------------------------------------------------------ *
 * Layout detection
 * ------------------------------------------------------------------ */

export type SheetLayout = 'wide' | 'flat';

/**
 * A month grid, or a list of transactions?
 *
 * The app's own export writes both — a tab per month and a flat TRANSACTIONS
 * tab — and a user will paste in whichever one they happened to be looking at.
 * The flat one is recognised by carrying its amount in a single column, which
 * a grid never does.
 */
export function detectLayout(headers: string[]): SheetLayout {
  const keys = headers.map(norm);
  const hasAmount = keys.some((k) => k === 'AMOUNT' || k === 'AMT' || k === 'VALUE');
  const hasCategory = keys.some((k) => k === 'CATEGORY' || k === 'CAT');
  return hasAmount && hasCategory ? 'flat' : 'wide';
}

/** People are stored joined; accept the separators a human might type. */
export function splitPeople(raw: string): string[] {
  return raw
    .split(/[|,;&]|\band\b/i)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * A flat list — one transaction per row, exactly what the app exports.
 * Nothing needs reconstructing here, so notes and multi-person tags survive a
 * round trip through a spreadsheet untouched.
 */
export function buildFlatPreview(
  records: Record<string, string>[],
  opts: { fallbackYear?: number; knownCategories?: string[] } = {},
): ImportPreview {
  const headers = Object.keys(records[0] ?? {});
  const find = (...names: string[]) => headers.find((h) => names.includes(norm(h)));

  const dateCol = find('DATE');
  const amountCol = find('AMOUNT', 'AMT', 'VALUE');
  const catCol = find('CATEGORY', 'CAT');
  const peopleCol = find('PEOPLE', 'PERSON', 'WHO', 'WITH');
  const noteCol = find('NOTE', 'NOTES', 'DESCRIPTION', 'REMARKS', 'DETAILS');

  // The mapping is only shown, not used, in flat mode — every row names its
  // own category — so each entry says what the column was read as.
  const mapping: ColumnMapping[] = headers.map((header) => {
    if (header === dateCol) return { header, role: 'date' as const, target: 'date' };
    if (header === catCol) return { header, role: 'category' as const, target: 'category per row' };
    if (header === peopleCol) return { header, role: 'person' as const, target: 'people per row' };
    if (header === amountCol) return { header, role: 'ignore' as const, target: 'amount' };
    if (header === noteCol) return { header, role: 'ignore' as const, target: 'note' };
    return { header, role: 'ignore' as const, target: '' };
  });

  const rows: ImportedRow[] = [];
  const warnings: string[] = [];
  let skippedRows = 0;

  if (!dateCol || !amountCol || !catCol) {
    warnings.push('A flat sheet needs Date, Amount and Category columns.');
    return { mapping, rows, warnings, computedTotal: 0, sheetTotal: null, skippedRows: records.length };
  }

  for (const record of records) {
    const date = parseSheetDate(record[dateCol] ?? '', opts.fallbackYear);
    const amount = parseAmount(record[amountCol] ?? '');
    if (!date || amount <= 0) {
      if (Object.values(record).some((v) => String(v ?? '').trim())) skippedRows++;
      continue;
    }

    const rawCategory = (record[catCol] ?? '').trim();
    const categoryName =
      matchCategory(rawCategory, opts.knownCategories ?? []) ?? titleCase(rawCategory || 'Misc');
    const people = peopleCol ? splitPeople(record[peopleCol] ?? '') : [];
    const note = noteCol ? (record[noteCol] ?? '').trim() || null : null;

    // One row per person keeps the shape the wide importer produces; the
    // writer collapses them back onto a single expense.
    if (people.length <= 1) {
      rows.push({
        amount,
        categoryName,
        expenseDate: date,
        personName: people[0] ?? null,
        note,
        matchKind: people.length ? 'paired' : 'category-only',
      });
    } else {
      rows.push({
        amount,
        categoryName,
        expenseDate: date,
        personName: people.join(' | '),
        note,
        matchKind: 'paired',
      });
    }
  }

  const computedTotal = round2(rows.reduce((sum, r) => sum + r.amount, 0));
  return { mapping, rows, warnings, computedTotal, sheetTotal: computedTotal, skippedRows };
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

/**
 * The one entry point: work out what shape the sheet is, then read it that way.
 *
 * A wide month grid has to be reconstructed — several columns on one row are
 * several transactions, and a person column tags an amount rather than adding
 * to it. A flat list needs none of that. Guessing wrong is expensive in both
 * directions, so the decision is made once, here, and reported back.
 */
export function previewSheet(
  records: Record<string, string>[],
  headers: string[],
  opts: {
    mapping?: ColumnMapping[];
    fallbackYear?: number;
    fallbackCategory?: string;
    knownPeople?: string[];
    knownCategories?: string[];
  } = {},
): ImportPreview {
  const layout = detectLayout(headers);

  if (layout === 'flat') {
    return {
      ...buildFlatPreview(records, {
        fallbackYear: opts.fallbackYear,
        knownCategories: opts.knownCategories,
      }),
      layout,
    };
  }

  const mapping =
    opts.mapping?.length ?? 0
      ? opts.mapping!
      : inferMapping(headers, opts.knownPeople ?? [], opts.knownCategories ?? []);

  return {
    ...buildPreview(records, mapping, {
      fallbackYear: opts.fallbackYear,
      fallbackCategory: opts.fallbackCategory,
    }),
    layout,
  };
}
