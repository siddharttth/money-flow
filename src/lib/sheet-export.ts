import type { CellValue, SheetSpec } from './xlsx';
import { monthRange } from './dates';

/**
 * THE WORKBOOK
 * ------------
 * The export is shaped like the spreadsheet this app replaced, not like the
 * database underneath it: one tab per month, one row per calendar day, one
 * column per category, a TOTAL column down the right and a TOTAL row along the
 * bottom. Every day of the month gets a row whether or not it has spending —
 * an empty row IS information in a ledger, and it keeps row 5 as the 5th.
 *
 * Two more tabs carry what a grid cannot: PEERS for the lending ledger, and
 * TRANSACTIONS for the flat list with notes and people intact. That last one
 * matters — the grid collapses several entries in a day into one figure, so
 * without it an export could not be re-imported without loss.
 *
 * Investment categories sit to the RIGHT of the TOTAL column, under their own
 * INVESTED total. The old sheet folded them into the month total, which is
 * what made every month look worse than it was — a SIP left the account but
 * not your net worth. Both figures are printed; neither is added to the other.
 */

export type ExportExpense = {
  expenseDate: string;
  amount: number;
  category: { name: string; kind?: string };
  people: { name: string }[];
  note: string | null;
};

export type ExportCategory = { name: string; kind: string };

export type ExportLedgerEntry = {
  entryDate: string;
  direction: 'out' | 'in';
  amount: number;
  note: string | null;
  person: { name: string };
};

export type ExportPeerBalance = {
  name: string;
  outMinor: number;
  inMinor: number;
  balanceMinor: number;
};

const MONTH_TAB = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** '2026-08' -> 'AUG-26', the naming the original sheet used for its tabs. */
export function monthTabName(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTH_TAB[m - 1]}-${String(y).slice(2)}`;
}

/** '2026-08-05' -> '5-Aug-2026', the format the importer already reads back. */
function sheetDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const name = MONTH_TAB[m - 1];
  return `${d}-${name[0]}${name.slice(1).toLowerCase()}-${y}`;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * One month as a day × category grid.
 *
 * `categories` fixes the column order so every month tab has the same columns
 * in the same places, including ones that saw no spending that month — a
 * column that appears and disappears between tabs makes them incomparable.
 */
export function buildMonthSheet(
  month: string,
  categories: ExportCategory[],
  expenses: ExportExpense[],
): SheetSpec {
  const { start, end } = monthRange(month);
  const days = Number(end.slice(8, 10));

  const spendCols = categories.filter((c) => c.kind !== 'investment').map((c) => c.name);
  const investCols = categories.filter((c) => c.kind === 'investment').map((c) => c.name);

  // day -> category -> amount
  const grid = new Map<number, Map<string, number>>();
  for (const e of expenses) {
    if (e.expenseDate < start || e.expenseDate > end) continue;
    const day = Number(e.expenseDate.slice(8, 10));
    const byCat = grid.get(day) ?? new Map<string, number>();
    byCat.set(e.category.name, round2((byCat.get(e.category.name) ?? 0) + e.amount));
    grid.set(day, byCat);
  }

  const header: CellValue[] = ['DATE', ...spendCols, 'TOTAL'];
  if (investCols.length) header.push(...investCols, 'INVESTED');
  const rows: CellValue[][] = [header];

  const spendTotals = new Array(spendCols.length).fill(0);
  const investTotals = new Array(investCols.length).fill(0);
  let grandSpent = 0;
  let grandInvested = 0;

  const fill = (names: string[], totals: number[], byCat: Map<string, number> | undefined) =>
    names.map((name, i) => {
      const amount = byCat?.get(name) ?? 0;
      totals[i] = round2(totals[i] + amount);
      return amount > 0 ? amount : null;
    });

  for (let day = 1; day <= days; day++) {
    const byCat = grid.get(day);
    const spent = fill(spendCols, spendTotals, byCat);
    const dayTotal = round2(spent.reduce<number>((s, v) => s + (v ?? 0), 0));
    grandSpent = round2(grandSpent + dayTotal);

    const row: CellValue[] = [
      sheetDate(`${start.slice(0, 8)}${String(day).padStart(2, '0')}`),
      ...spent,
      dayTotal || null,
    ];

    if (investCols.length) {
      const put = fill(investCols, investTotals, byCat);
      const dayInvested = round2(put.reduce<number>((s, v) => s + (v ?? 0), 0));
      grandInvested = round2(grandInvested + dayInvested);
      row.push(...put, dayInvested || null);
    }

    rows.push(row);
  }

  const totalRow: CellValue[] = ['TOTAL', ...spendTotals.map((t) => t || null), grandSpent || null];
  if (investCols.length) totalRow.push(...investTotals.map((t) => t || null), grandInvested || null);
  rows.push(totalRow);

  return {
    name: monthTabName(month),
    rows,
    headerRows: [0],
    totalRows: [rows.length - 1],
    freezeRow: 1,
    widths: [14, ...header.slice(1).map(() => 15)],
  };
}

/** The lending ledger: balances first, then every entry behind them. */
export function buildPeersSheet(balances: ExportPeerBalance[], entries: ExportLedgerEntry[]): SheetSpec {
  const rows: CellValue[][] = [['PERSON', 'I LENT', 'I BORROWED', 'BALANCE', 'WHO OWES']];

  for (const b of balances) {
    const balance = round2(b.balanceMinor / 100);
    rows.push([
      b.name,
      round2(b.outMinor / 100) || null,
      round2(b.inMinor / 100) || null,
      balance || null,
      balance === 0 ? 'settled' : balance > 0 ? `${b.name} owes me` : `I owe ${b.name}`,
    ]);
  }

  const net = round2(balances.reduce((s, b) => s + b.balanceMinor, 0) / 100);
  rows.push([
    'TOTAL',
    round2(balances.reduce((s, b) => s + b.outMinor, 0) / 100) || null,
    round2(balances.reduce((s, b) => s + b.inMinor, 0) / 100) || null,
    net || null,
    net === 0 ? 'all settled' : net > 0 ? 'owed to me' : 'I owe',
  ]);
  const totalRow = rows.length - 1;

  rows.push([], ['DATE', 'PERSON', 'DIRECTION', 'AMOUNT', 'NOTE']);
  const entriesHeader = rows.length - 1;

  for (const e of entries) {
    rows.push([
      sheetDate(e.entryDate),
      e.person.name,
      e.direction === 'out' ? 'I lent' : 'I borrowed',
      round2(e.amount),
      e.note ?? '',
    ]);
  }

  return {
    name: 'PEERS',
    rows,
    headerRows: [0, entriesHeader],
    totalRows: [totalRow],
    freezeRow: 1,
    widths: [16, 18, 14, 14, 34],
  };
}

/**
 * The flat list. The grid above sums a day's entries into one cell, so this is
 * the only tab that survives a round trip — notes, people and same-day repeats
 * all intact. The importer reads this layout directly.
 */
export function buildTransactionsSheet(expenses: ExportExpense[]): SheetSpec {
  const rows: CellValue[][] = [['Date', 'Amount', 'Category', 'People', 'Note']];
  for (const e of expenses) {
    rows.push([
      e.expenseDate,
      round2(e.amount),
      e.category.name,
      e.people.map((p) => p.name).join(' | '),
      e.note ?? '',
    ]);
  }
  return { name: 'TRANSACTIONS', rows, headerRows: [0], freezeRow: 1, widths: [14, 12, 20, 24, 40] };
}

/** Every month that has at least one expense, oldest first. */
export function monthsPresent(expenses: ExportExpense[]): string[] {
  return [...new Set(expenses.map((e) => e.expenseDate.slice(0, 7)))].sort();
}

export function buildWorkbook(
  expenses: ExportExpense[],
  categories: ExportCategory[],
  balances: ExportPeerBalance[],
  ledger: ExportLedgerEntry[],
): SheetSpec[] {
  const months = monthsPresent(expenses);
  // Newest month first: it is the one being looked at.
  const monthSheets = months
    .slice()
    .reverse()
    .map((m) => buildMonthSheet(m, categories, expenses));

  const sheets = [...monthSheets];
  if (balances.length || ledger.length) sheets.push(buildPeersSheet(balances, ledger));
  sheets.push(buildTransactionsSheet(expenses));
  return sheets;
}
