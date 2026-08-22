import { query, withAuth } from '@/lib/api';
import { listExpenses } from '@/lib/expenses';

/** CSV export — one row per real transaction, people joined into one column. */
export const GET = withAuth(async (req, session) => {
  const q = query(req);
  const { items } = await listExpenses({
    userId: session.userId,
    start: q.get('start') ?? undefined,
    end: q.get('end') ?? undefined,
    sort: 'date_asc',
    limit: 200,
    offset: 0,
  });

  // Page through everything rather than capping the export at one page.
  const all = [...items];
  let offset = items.length;
  while (all.length < 20000) {
    const next = await listExpenses({
      userId: session.userId,
      start: q.get('start') ?? undefined,
      end: q.get('end') ?? undefined,
      sort: 'date_asc',
      limit: 200,
      offset,
    });
    if (!next.items.length) break;
    all.push(...next.items);
    offset += next.items.length;
    if (next.items.length < 200) break;
  }

  const header = ['Date', 'Amount', 'Category', 'People', 'Note'];
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [
    header.join(','),
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
      'Content-Disposition': `attachment; filename="money-flow-export.csv"`,
    },
  });
});
