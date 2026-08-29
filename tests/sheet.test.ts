import { describe, it, expect } from 'vitest';
import { inflateRawSync } from 'zlib';
import { buildXlsx, columnName, safeSheetName } from '@/lib/xlsx';
import { buildMonthSheet, buildPeersSheet, buildTransactionsSheet, monthTabName } from '@/lib/sheet-export';
import {
  detectLayout,
  matchCategory,
  previewSheet,
  splitPeople,
  PERSON_COLUMNS,
} from '@/lib/importer';

/* ------------------------------------------------------------------ *
 * The workbook writer
 * ------------------------------------------------------------------ */

/** Reads a part back out of the generated zip, so assertions run on the real file. */
function unzip(file: Buffer): Map<string, string> {
  const out = new Map<string, string>();
  let i = 0;
  while (i < file.length - 4) {
    if (file.readUInt32LE(i) !== 0x04034b50) break;
    const compSize = file.readUInt32LE(i + 18);
    const nameLen = file.readUInt16LE(i + 26);
    const extraLen = file.readUInt16LE(i + 28);
    const name = file.subarray(i + 30, i + 30 + nameLen).toString('utf8');
    const start = i + 30 + nameLen + extraLen;
    out.set(name, inflateRawSync(file.subarray(start, start + compSize)).toString('utf8'));
    i = start + compSize;
  }
  return out;
}

describe('xlsx writer', () => {
  it('produces a zip whose parts inflate back to the XML that was written', () => {
    const file = buildXlsx([{ name: 'One', rows: [['Hello', 42]], headerRows: [0] }]);

    expect(file.subarray(0, 2).toString()).toBe('PK');
    const parts = unzip(file);
    expect([...parts.keys()]).toEqual(
      expect.arrayContaining([
        '[Content_Types].xml',
        '_rels/.rels',
        'xl/workbook.xml',
        'xl/_rels/workbook.xml.rels',
        'xl/styles.xml',
        'xl/worksheets/sheet1.xml',
      ]),
    );

    const sheet = parts.get('xl/worksheets/sheet1.xml')!;
    expect(sheet).toContain('<t xml:space="preserve">Hello</t>');
    expect(sheet).toContain('<v>42</v>');
    expect(parts.get('xl/workbook.xml')).toContain('name="One"');
  });

  it('writes one sheet part and one relationship per sheet', () => {
    const parts = unzip(
      buildXlsx([
        { name: 'A', rows: [['x']] },
        { name: 'B', rows: [['y']] },
        { name: 'C', rows: [['z']] },
      ]),
    );
    expect(parts.has('xl/worksheets/sheet3.xml')).toBe(true);
    const rels = parts.get('xl/_rels/workbook.xml.rels')!;
    // Three sheets plus the stylesheet.
    expect(rels.match(/<Relationship /g)).toHaveLength(4);
  });

  it('escapes characters that would otherwise break the XML', () => {
    const parts = unzip(buildXlsx([{ name: 'x', rows: [['Ciggs & <Alc> "q"']] }]));
    const sheet = parts.get('xl/worksheets/sheet1.xml')!;
    expect(sheet).toContain('Ciggs &amp; &lt;Alc&gt; &quot;q&quot;');
  });

  it('skips empty cells rather than writing blanks', () => {
    const parts = unzip(buildXlsx([{ name: 'x', rows: [['a', null, '', 0]] }]));
    const sheet = parts.get('xl/worksheets/sheet1.xml')!;
    expect(sheet).toContain('r="A1"');
    expect(sheet).not.toContain('r="B1"');
    expect(sheet).not.toContain('r="C1"');
    // Zero is a real figure and must survive.
    expect(sheet).toContain('r="D1"');
  });

  it('names columns the way a spreadsheet does', () => {
    expect(columnName(0)).toBe('A');
    expect(columnName(25)).toBe('Z');
    expect(columnName(26)).toBe('AA');
    expect(columnName(27)).toBe('AB');
  });

  it('makes tab names legal', () => {
    expect(safeSheetName('AUG/26')).toBe('AUG-26');
    expect(safeSheetName('x'.repeat(50))).toHaveLength(31);
  });

  it('refuses to write a workbook with no sheets', () => {
    expect(() => buildXlsx([])).toThrow();
  });
});

/* ------------------------------------------------------------------ *
 * The month grid
 * ------------------------------------------------------------------ */

const exp = (date: string, amount: number, category: string, people: string[] = [], note: string | null = null) => ({
  expenseDate: date,
  amount,
  category: { name: category },
  people: people.map((name) => ({ name })),
  note,
});

describe('month grid', () => {
  const categories = ['Bills / Recharge', 'Ciggs / Alc', 'Outside Food', 'Misc'];

  it('names the tab the way the original sheet did', () => {
    expect(monthTabName('2026-08')).toBe('AUG-26');
    expect(monthTabName('2026-01')).toBe('JAN-26');
  });

  it('gives every day of the month a row, spending or not', () => {
    const sheet = buildMonthSheet('2026-08', categories, [exp('2026-08-03', 112, 'Ciggs / Alc')]);
    // header + 31 days + TOTAL
    expect(sheet.rows).toHaveLength(33);
    expect(sheet.rows[0]).toEqual(['DATE', ...categories, 'TOTAL']);
    expect(sheet.rows[1][0]).toBe('1-Aug-2026');
    expect(sheet.rows[31][0]).toBe('31-Aug-2026');
  });

  it('places an amount under its own category and day', () => {
    const sheet = buildMonthSheet('2026-08', categories, [exp('2026-08-03', 112, 'Ciggs / Alc')]);
    const row = sheet.rows[3]; // 3 Aug
    expect(row[0]).toBe('3-Aug-2026');
    expect(row[1]).toBeNull(); // Bills
    expect(row[2]).toBe(112); // Ciggs
    expect(row.at(-1)).toBe(112); // TOTAL
  });

  it('adds several entries in one category on one day into a single cell', () => {
    const sheet = buildMonthSheet('2026-08', categories, [
      exp('2026-08-24', 55, 'Ciggs / Alc'),
      exp('2026-08-24', 15, 'Ciggs / Alc'),
      exp('2026-08-24', 26, 'Ciggs / Alc'),
    ]);
    expect(sheet.rows[24][2]).toBe(96);
    expect(sheet.rows[24].at(-1)).toBe(96);
  });

  it('totals every column and the month, and they agree', () => {
    const sheet = buildMonthSheet('2026-08', categories, [
      exp('2026-08-01', 312, 'Ciggs / Alc'),
      exp('2026-08-02', 484, 'Outside Food'),
      exp('2026-08-12', 589, 'Bills / Recharge'),
      exp('2026-08-21', 6010, 'Misc'),
    ]);
    const total = sheet.rows.at(-1)!;
    expect(total[0]).toBe('TOTAL');
    expect(total[1]).toBe(589);
    expect(total[2]).toBe(312);
    expect(total[3]).toBe(484);
    expect(total[4]).toBe(6010);
    expect(total.at(-1)).toBe(7395);

    // Column totals must add up to the grand total.
    const columnSum = total.slice(1, -1).reduce<number>((s, v) => s + ((v as number) ?? 0), 0);
    expect(columnSum).toBe(total.at(-1));
  });

  it('ignores expenses from other months', () => {
    const sheet = buildMonthSheet('2026-08', categories, [
      exp('2026-07-31', 999, 'Misc'),
      exp('2026-09-01', 999, 'Misc'),
      exp('2026-08-15', 10, 'Misc'),
    ]);
    expect(sheet.rows.at(-1)!.at(-1)).toBe(10);
  });

  it('keeps a column for a category with no spending, so tabs stay comparable', () => {
    const sheet = buildMonthSheet('2026-08', categories, [exp('2026-08-01', 10, 'Misc')]);
    expect(sheet.rows[0]).toHaveLength(categories.length + 2);
    expect(sheet.rows.at(-1)![1]).toBeNull();
  });

  it('handles a 30-day month and a leap February', () => {
    expect(buildMonthSheet('2026-09', categories, []).rows).toHaveLength(32);
    expect(buildMonthSheet('2024-02', categories, []).rows).toHaveLength(31);
  });
});

describe('peers tab', () => {
  it('states who owes whom, and lists the entries behind it', () => {
    const sheet = buildPeersSheet(
      [{ name: 'Sankalp', outMinor: 300_000, inMinor: 100_000, balanceMinor: 200_000 }],
      [
        {
          entryDate: '2026-07-12',
          direction: 'out',
          amount: 3000,
          note: 'Trip advance',
          person: { name: 'Sankalp' },
        },
      ],
    );
    expect(sheet.rows[1]).toEqual(['Sankalp', 3000, 1000, 2000, 'Sankalp owes me']);
    expect(sheet.rows.some((r) => r[2] === 'I lent')).toBe(true);
  });
});

describe('transactions tab', () => {
  it('keeps notes and every tagged person, so the export can be read back', () => {
    const sheet = buildTransactionsSheet([exp('2026-08-16', 950, 'Outside Food', ['Me', 'Sankalp'], 'Dinner')]);
    expect(sheet.rows[1]).toEqual(['2026-08-16', 950, 'Outside Food', 'Me | Sankalp', 'Dinner']);
  });
});

/* ------------------------------------------------------------------ *
 * The importer
 * ------------------------------------------------------------------ */

const KNOWN = [
  'Bills / Recharge',
  'Ciggs / Alc',
  'Outside Food',
  'Fruits / Veggies',
  'Shopping',
  'Transport',
  'Misc',
  'Investment',
];

describe('header matching', () => {
  it('reads the real sheet headers, typos included', () => {
    expect(matchCategory('TANSPORT', KNOWN)).toBe('Transport');
    expect(matchCategory('MSSIL', KNOWN)).toBe('Misc');
    expect(matchCategory('FRUITS/VEGIES', KNOWN)).toBe('Fruits / Veggies');
    expect(matchCategory('CIGGS/ALC', KNOWN)).toBe('Ciggs / Alc');
    expect(matchCategory('BILLS/RECHARGE', KNOWN)).toBe('Bills / Recharge');
    expect(matchCategory('outside food', KNOWN)).toBe('Outside Food');
  });

  it('does not force an unrelated header onto an existing category', () => {
    expect(matchCategory('Rent', KNOWN)).toBeNull();
    expect(matchCategory('Healthcare', KNOWN)).toBeNull();
  });

  it('no longer treats MSSIL as a person', () => {
    expect(PERSON_COLUMNS).not.toContain('MSSIL');
  });
});

describe('layout detection', () => {
  it('recognises the app’s own flat export', () => {
    expect(detectLayout(['Date', 'Amount', 'Category', 'People', 'Note'])).toBe('flat');
  });

  it('recognises a month grid', () => {
    expect(detectLayout(['DATE', 'BILLS/RECHARGE', 'CIGGS/ALC', 'TOTAL'])).toBe('wide');
  });
});

describe('splitting people', () => {
  it('accepts the separators a person might type', () => {
    expect(splitPeople('Me | Sankalp')).toEqual(['Me', 'Sankalp']);
    expect(splitPeople('Me, Sankalp')).toEqual(['Me', 'Sankalp']);
    expect(splitPeople('Me & Sankalp')).toEqual(['Me', 'Sankalp']);
    expect(splitPeople('')).toEqual([]);
  });
});

describe('reading back a flat export', () => {
  const rows = [
    { Date: '2026-08-01', Amount: '312.00', Category: 'Ciggs / Alc', People: 'Me', Note: '' },
    { Date: '2026-08-01', Amount: '600.00', Category: 'Shopping', People: 'Mumma', Note: 'slippers' },
    { Date: '2026-08-16', Amount: '950.00', Category: 'Outside Food', People: 'Me | Sankalp', Note: '' },
  ];
  const headers = ['Date', 'Amount', 'Category', 'People', 'Note'];

  it('imports one transaction per row with its note and people intact', () => {
    const preview = previewSheet(rows, headers, { knownCategories: KNOWN });

    expect(preview.layout).toBe('flat');
    expect(preview.rows).toHaveLength(3);
    expect(preview.computedTotal).toBe(1862);
    expect(preview.rows[1]).toMatchObject({
      amount: 600,
      categoryName: 'Shopping',
      personName: 'Mumma',
      note: 'slippers',
      expenseDate: '2026-08-01',
    });
    expect(preview.rows[2].personName).toBe('Me | Sankalp');
  });

  it('does not multiply a transaction tagged with two people', () => {
    const preview = previewSheet(rows, headers, { knownCategories: KNOWN });
    const multi = preview.rows.filter((r) => r.amount === 950);
    expect(multi).toHaveLength(1);
  });

  it('skips a row with no usable amount without dropping the rest', () => {
    const preview = previewSheet(
      [...rows, { Date: '', Amount: '', Category: '', People: '', Note: '' }, { Date: '2026-08-02', Amount: '0', Category: 'Misc', People: '', Note: '' }],
      headers,
      { knownCategories: KNOWN },
    );
    expect(preview.rows).toHaveLength(3);
  });
});

describe('reading the month grid', () => {
  const headers = ['DATE', 'BILLS/RECHARGE', 'CIGGS/ALC', 'OUTSIDE FOOD', 'TANSPORT', 'MSSIL', 'TOTAL'];

  it('turns one day’s row into one transaction per filled column', () => {
    const preview = previewSheet(
      [{ DATE: '1-Aug-2026', 'BILLS/RECHARGE': '', 'CIGGS/ALC': '312', 'OUTSIDE FOOD': '', TANSPORT: '100', MSSIL: '50', TOTAL: '462' }],
      headers,
      { knownCategories: KNOWN },
    );

    expect(preview.layout).toBe('wide');
    expect(preview.rows).toHaveLength(3);
    expect(preview.computedTotal).toBe(462);
    expect(preview.sheetTotal).toBe(462);

    const names = preview.rows.map((r) => r.categoryName).sort();
    // The misspelled headers land on the categories that already exist.
    expect(names).toEqual(['Ciggs / Alc', 'Misc', 'Transport']);
  });

  it('does not invent a person from the MSSIL column', () => {
    const preview = previewSheet([{ DATE: '1-Aug-2026', MSSIL: '50', TOTAL: '50' }], ['DATE', 'MSSIL', 'TOTAL'], {
      knownCategories: KNOWN,
    });
    expect(preview.rows).toHaveLength(1);
    expect(preview.rows[0]).toMatchObject({ categoryName: 'Misc', personName: null });
  });

  it('reconstructs the sheet total exactly across a run of days', () => {
    const days: Record<string, string>[] = [
      { DATE: '1-Aug-2026', 'CIGGS/ALC': '312', TANSPORT: '100', MSSIL: '50', TOTAL: '462' },
      { DATE: '2-Aug-2026', 'CIGGS/ALC': '30', 'OUTSIDE FOOD': '484', MSSIL: '110', TOTAL: '624' },
      { DATE: '12-Aug-2026', 'BILLS/RECHARGE': '589', 'CIGGS/ALC': '39', TOTAL: '628' },
    ];
    const preview = previewSheet(days, headers, { knownCategories: KNOWN });
    expect(preview.computedTotal).toBe(1714);
    expect(preview.sheetTotal).toBe(1714);
    expect(preview.warnings).toEqual([]);
  });

  it('ignores the sheet’s own TOTAL row instead of importing it as a day', () => {
    const preview = previewSheet(
      [
        { DATE: '1-Aug-2026', 'CIGGS/ALC': '312', TOTAL: '312' },
        { DATE: 'TOTAL', 'CIGGS/ALC': '312', TOTAL: '312' },
      ],
      ['DATE', 'CIGGS/ALC', 'TOTAL'],
      { knownCategories: KNOWN },
    );
    expect(preview.rows).toHaveLength(1);
    expect(preview.computedTotal).toBe(312);
  });
});
