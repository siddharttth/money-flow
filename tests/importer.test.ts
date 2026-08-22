import { describe, it, expect } from 'vitest';
import {
  buildPreview,
  inferMapping,
  parseAmount,
  parseSheetDate,
  reconstructRow,
} from '@/lib/importer';

describe('parseSheetDate', () => {
  it('reads the sheet formats', () => {
    expect(parseSheetDate('2-Aug-26')).toBe('2026-08-02');
    expect(parseSheetDate('23 Aug 2026')).toBe('2026-08-23');
    expect(parseSheetDate('2026-08-02')).toBe('2026-08-02');
    expect(parseSheetDate('02/08/2026')).toBe('2026-08-02'); // day-first
  });

  it('uses the fallback year when the sheet omits it', () => {
    expect(parseSheetDate('2-Aug', 2026)).toBe('2026-08-02');
    expect(parseSheetDate('2-Aug')).toBeNull();
  });

  it('rejects impossible dates', () => {
    expect(parseSheetDate('31-Feb-26')).toBeNull();
    expect(parseSheetDate('gibberish')).toBeNull();
  });
});

describe('parseAmount', () => {
  it('strips currency formatting', () => {
    expect(parseAmount('₹1,234.50')).toBe(1234.5);
    expect(parseAmount('484')).toBe(484);
    expect(parseAmount('')).toBe(0);
    expect(parseAmount('-')).toBe(0);
  });
});

describe('inferMapping', () => {
  it('separates people columns from category columns', () => {
    const mapping = inferMapping(['DATE', 'OUTSIDE FOOD', 'SANKALP', 'TOTAL']);
    expect(mapping.find((m) => m.header === 'DATE')?.role).toBe('date');
    expect(mapping.find((m) => m.header === 'OUTSIDE FOOD')?.role).toBe('category');
    expect(mapping.find((m) => m.header === 'SANKALP')?.role).toBe('person');
    expect(mapping.find((m) => m.header === 'TOTAL')?.role).toBe('ignore');
  });

  it('maps sheet headers to clean display names', () => {
    const mapping = inferMapping(['FRUITS/VEGIES', 'CIGGS/ALC']);
    expect(mapping[0].target).toBe('Fruits / Veggies');
    expect(mapping[1].target).toBe('Ciggs / Alc');
  });

  it('treats the user\'s own people as person columns', () => {
    const mapping = inferMapping(['DATE', 'RAHUL'], ['Rahul']);
    expect(mapping.find((m) => m.header === 'RAHUL')?.role).toBe('person');
  });
});

describe('reconstructRow — the no-double-counting rule', () => {
  it('pairs an equal category and person amount into ONE transaction', () => {
    const { rows } = reconstructRow(
      [{ name: 'Outside Food', amount: 484 }],
      [{ name: 'Sankalp', amount: 484 }],
      '2026-08-02',
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ amount: 484, categoryName: 'Outside Food', personName: 'Sankalp' });
    // The critical assertion: 484 + 484 must never become 968.
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(484);
  });

  it('pairs one person amount covering several categories', () => {
    const { rows } = reconstructRow(
      [
        { name: 'Outside Food', amount: 300 },
        { name: 'Transport', amount: 200 },
      ],
      [{ name: 'Sankalp', amount: 500 }],
      '2026-08-02',
    );

    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.personName === 'Sankalp')).toBe(true);
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(500);
  });

  it('leaves unmatched categories without a person', () => {
    const { rows } = reconstructRow([{ name: 'Shopping', amount: 1200 }], [], '2026-08-02');
    expect(rows).toEqual([
      expect.objectContaining({ amount: 1200, categoryName: 'Shopping', personName: null, matchKind: 'category-only' }),
    ]);
  });

  it('files an unmatched person amount under the fallback category', () => {
    const { rows, warnings } = reconstructRow([], [{ name: 'Mummy', amount: 1620 }], '2026-08-22', 'Misc');
    expect(rows).toEqual([
      expect.objectContaining({ amount: 1620, categoryName: 'Misc', personName: 'Mummy', matchKind: 'person-only' }),
    ]);
    expect(warnings).toHaveLength(1);
  });

  it('handles a mixed row without inventing or losing money', () => {
    const { rows } = reconstructRow(
      [
        { name: 'Outside Food', amount: 800 },
        { name: 'Shopping', amount: 500 },
        { name: 'Transport', amount: 50 },
      ],
      [
        { name: 'Sankalp', amount: 800 },
        { name: 'Mummy', amount: 1620 },
      ],
      '2026-08-23',
    );

    // 800 (paired) + 500 + 50 (unpaired categories) + 1620 (person-only) = 2970
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(2970);
    expect(rows.find((r) => r.personName === 'Sankalp')).toMatchObject({ amount: 800, categoryName: 'Outside Food' });
    expect(rows.filter((r) => r.personName === null)).toHaveLength(2);
  });

  it('ignores zero and blank cells', () => {
    const { rows } = reconstructRow(
      [{ name: 'Shopping', amount: 0 }],
      [{ name: 'Aditi', amount: 0 }],
      '2026-08-01',
    );
    expect(rows).toHaveLength(0);
  });
});

describe('buildPreview — a real sheet', () => {
  const HEADERS = 'DATE,BILLS/RECHARGE,CIGGS/ALC,OUTSIDE FOOD,SHOPPING,TRANSPORT,ADITI,MUMMY,SANKALP,TOTAL';

  it('reconstructs the sheet exactly, matching its own TOTAL column', () => {
    const csv = [
      HEADERS,
      '2-Aug-26,,,484,,,,,484,484',
      '3-Aug-26,599,,,,,,,,599',
      '4-Aug-26,,250,,1200,,,,,1450',
      '5-Aug-26,,,,,50,,1620,,1670',
    ].join('\n');

    const records = parseCsv(csv);
    const preview = buildPreview(records, inferMapping(HEADERS.split(',')));

    expect(preview.computedTotal).toBe(4203);
    expect(preview.sheetTotal).toBe(4203);
    // No mismatch warning means nothing was double counted or dropped.
    expect(preview.warnings.filter((w) => w.includes('does not match'))).toHaveLength(0);

    const paired = preview.rows.find((r) => r.personName === 'Sankalp');
    expect(paired).toMatchObject({ amount: 484, categoryName: 'Outside Food' });
  });

  it('flags a mismatch when a person column is mis-mapped as a category', () => {
    const csv = [HEADERS, '2-Aug-26,,,484,,,,,484,484'].join('\n');
    const records = parseCsv(csv);
    const mapping = inferMapping(HEADERS.split(',')).map((m) =>
      m.header === 'SANKALP' ? { ...m, role: 'category' as const, target: 'Sankalp' } : m,
    );

    const preview = buildPreview(records, mapping);

    // 484 counted twice — exactly the failure mode the preview must catch.
    expect(preview.computedTotal).toBe(968);
    expect(preview.warnings.some((w) => w.includes('does not match'))).toBe(true);
  });

  it('skips rows whose date cannot be read', () => {
    const csv = [HEADERS, 'TOTALS,,,999,,,,,,999'].join('\n');
    const preview = buildPreview(parseCsv(csv), inferMapping(HEADERS.split(',')));
    expect(preview.rows).toHaveLength(0);
    expect(preview.skippedRows).toBe(1);
  });
});

/** Minimal header-mode CSV parse, matching what Papa produces. */
function parseCsv(csv: string): Record<string, string>[] {
  const [head, ...lines] = csv.trim().split('\n');
  const headers = head.split(',');
  return lines.map((line) => {
    const cells = line.split(',');
    return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? '']));
  });
}
