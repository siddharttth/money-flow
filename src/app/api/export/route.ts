import { asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { categories } from '@/db/schema';
import { query, withAuth } from '@/lib/api';
import { listExpenses } from '@/lib/expenses';
import { getPeerBalances, listAllLedgerEntries } from '@/lib/ledger';
import { buildWorkbook, type ExportExpense } from '@/lib/sheet-export';
import { buildXlsx } from '@/lib/xlsx';

/**
 * The export is a workbook, not a list.
 *
 * A flat CSV of transactions is what the database holds; a month grid is what
 * the user actually reads. This produces the second, shaped like the sheet this
 * app replaced — a tab per month, plus PEERS for the lending ledger and
 * TRANSACTIONS for the lossless flat list. `?format=csv` still returns just
 * that last one, for anything that wants to pipe it.
 */
export const GET = withAuth(async (req, session) => {
  const q = query(req);
  const start = q.get('start') ?? undefined;
  const end = q.get('end') ?? undefined;

  const all = await fetchAllExpenses(session.userId, start, end);

  if (q.get('format') === 'csv') {
    return csvResponse(all);
  }

  const [catRows, balances, ledger] = await Promise.all([
    db
      .select({ name: categories.name })
      .from(categories)
      .where(eq(categories.userId, session.userId))
      .orderBy(asc(categories.sortOrder), asc(categories.name)),
    getPeerBalances(session.userId),
    listAllLedgerEntries(session.userId),
  ]);

  /*
   * Every category the user has, plus any that only exist on old rows — a
   * disabled or renamed category still has history, and a grid that silently
   * dropped its column would not add up to its own TOTAL.
   */
  const names = [...new Set([...catRows.map((c) => c.name), ...all.map((e) => e.category.name)])];

  const sheets = buildWorkbook(
    all,
    names,
    balances.map((b) => ({
      name: b.name,
      outMinor: b.outMinor,
      inMinor: b.inMinor,
      balanceMinor: b.balanceMinor,
    })),
    ledger,
  );

  const file = buildXlsx(sheets);
  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(new Uint8Array(file), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="money-flow-${stamp}.xlsx"`,
      'Content-Length': String(file.length),
    },
  });
});

/** Pages through everything rather than capping the export at one page. */
async function fetchAllExpenses(userId: string, start?: string, end?: string): Promise<ExportExpense[]> {
  const all: ExportExpense[] = [];
  let offset = 0;

  while (all.length < 50_000) {
    const page = await listExpenses({ userId, start, end, sort: 'date_asc', limit: 200, offset });
    all.push(...page.items);
    if (page.items.length < 200) break;
    offset += page.items.length;
  }

  return all;
}

function csvResponse(all: ExportExpense[]): Response {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [
    ['Date', 'Amount', 'Category', 'People', 'Note'].join(','),
    ...all.map((e) =>
      [
        e.expenseDate,
        e.amount.toFixed(2),
        escape(e.category.name),
        escape(e.people.map((p) => p.name).join(' | ')),
        escape(e.note ?? ''),
      ].join(','),
    ),
  ];

  // Trailing newline so POSIX tools count the last row correctly.
  return new Response(lines.join('\n') + '\n', {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="money-flow-transactions.csv"',
    },
  });
}
