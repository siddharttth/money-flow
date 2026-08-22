'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { qs } from '@/lib/client';
import { currentMonth, dayLabel, monthLabel, monthRange } from '@/lib/dates';
import { formatINR } from '@/lib/money';
import type { CategoryStat, Expense, ExpenseList, Person, PersonStat, Summary } from '@/lib/types';
import { Card, EmptyState, ListSkeleton, Modal, SectionTitle, StatTile } from '@/components/ui';
import { MonthPicker } from '@/components/month-picker';
import { CategoryDonut, DailyTrend, MonthlyBars, ShareBar } from '@/components/charts';
import { useShell } from '@/components/app-shell';

export default function AnalyticsPage() {
  return (
    <Suspense fallback={<Card><ListSkeleton rows={6} /></Card>}>
      <AnalyticsInner />
    </Suspense>
  );
}

function AnalyticsInner() {
  const search = useSearchParams();
  const [month, setMonth] = useState(search.get('month') ?? currentMonth());
  const [personIds, setPersonIds] = useState<string[]>([]);
  const [drill, setDrill] = useState<CategoryStat | null>(null);

  const { start, end } = monthRange(month);
  const people = useSWR<{ items: Person[] }>('/api/people');
  const summary = useSWR<Summary>(`/api/analytics/summary?month=${month}`);
  const cats = useSWR<{ items: CategoryStat[]; grandTotalMinor: number; transactionCount: number }>(
    `/api/analytics/categories${qs({ month, personIds })}`,
  );
  const ppl = useSWR<{ people: PersonStat[]; unassignedMinor: number; grandTotalMinor: number }>(
    `/api/analytics/people?month=${month}`,
  );
  const daily = useSWR<{ items: { date: string; totalMinor: number }[] }>(
    `/api/analytics/daily${qs({ month, personIds })}`,
  );
  const trends = useSWR<{ items: { month: string; totalMinor: number }[] }>('/api/analytics/trends?months=12');

  const s = summary.data;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold">Analytics</h1>
          <p className="muted text-sm">{monthLabel(month)}</p>
        </div>
        <MonthPicker month={month} onChange={setMonth} />
      </div>

      {/* Monthly summary — the spreadsheet's month tab, computed. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Total" value={s ? formatINR(s.totalMinor) : '—'} sub={s ? `${s.transactionCount} ${s.transactionCount === 1 ? 'transaction' : 'transactions'}` : undefined} />
        <StatTile label="Daily average" value={s ? formatINR(s.avgDailyMinor) : '—'} />
        <StatTile
          label="Vs last month"
          value={s?.changePct != null ? `${s.changePct > 0 ? '+' : ''}${s.changePct.toFixed(1)}%` : '—'}
          sub={s ? `${monthLabel(s.previousMonth.month)}: ${formatINR(s.previousMonth.totalMinor)}` : undefined}
          tone={s?.changePct != null ? (s.changePct > 0 ? 'up' : 'down') : undefined}
        />
        <StatTile
          label="Biggest day"
          value={s?.topDay ? formatINR(s.topDay.totalMinor) : '—'}
          sub={s?.topDay ? dayLabel(s.topDay.date) : undefined}
        />
      </div>

      <Card>
        <label className="label">Filter by person</label>
        <div className="scroll-x flex gap-2 pb-1">
          <button className="chip" data-selected={personIds.length === 0} onClick={() => setPersonIds([])}>
            Everyone
          </button>
          {people.data?.items.map((p) => (
            <button
              key={p.id}
              className="chip"
              data-selected={personIds.includes(p.id)}
              onClick={() => setPersonIds((x) => (x.includes(p.id) ? x.filter((y) => y !== p.id) : [...x, p.id]))}
            >
              {p.avatar} {p.name}
            </button>
          ))}
          <button
            className="chip"
            data-selected={personIds.includes('none')}
            onClick={() => setPersonIds((x) => (x.includes('none') ? x.filter((y) => y !== 'none') : [...x, 'none']))}
          >
            — Nobody
          </button>
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card>
          <SectionTitle>Category breakdown</SectionTitle>
          {cats.isLoading ? (
            <ListSkeleton rows={5} />
          ) : cats.data?.items.length ? (
            <>
              <CategoryDonut data={cats.data.items.map((c) => ({ name: c.name, totalMinor: c.totalMinor, color: c.color }))} />
              <div className="space-y-3 mt-4">
                {cats.data.items.map((c) => (
                  <button key={c.categoryId} className="block w-full text-left" onClick={() => setDrill(c)}>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex items-center gap-2 min-w-0">
                        <span aria-hidden>{c.icon}</span>
                        <span className="truncate">{c.name}</span>
                        <span className="muted text-xs shrink-0">{(c.share * 100).toFixed(0)}%</span>
                      </span>
                      <span className="tabular font-medium shrink-0">{formatINR(c.totalMinor)}</span>
                    </div>
                    <ShareBar share={c.share} color={c.color} />
                  </button>
                ))}
              </div>
              <div className="flex justify-between mt-4 pt-3 border-t text-sm font-semibold" style={{ borderColor: 'var(--border)' }}>
                <span>Total</span>
                <span className="tabular">{formatINR(cats.data.grandTotalMinor)}</span>
              </div>
              <p className="muted text-xs mt-2">Tap a category to see the transactions behind it.</p>
            </>
          ) : (
            <EmptyState icon="📊" title="No data for this period" />
          )}
        </Card>

        <Card>
          <SectionTitle>Person breakdown</SectionTitle>
          {ppl.isLoading ? (
            <ListSkeleton rows={5} />
          ) : ppl.data?.people.length ? (
            <>
              <div className="space-y-3">
                {ppl.data.people.map((p) => (
                  <div key={p.personId}>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex items-center gap-2 min-w-0">
                        <span aria-hidden>{p.avatar}</span>
                        <span className="truncate">{p.name}</span>
                        <span className="muted text-xs shrink-0">×{p.count}</span>
                      </span>
                      <span className="tabular font-medium shrink-0">{formatINR(p.totalMinor)}</span>
                    </div>
                    <ShareBar
                      share={p.totalMinor / Math.max(1, ...ppl.data!.people.map((x) => x.totalMinor))}
                      color={p.color}
                    />
                  </div>
                ))}
              </div>
              <p className="muted text-xs mt-4 leading-relaxed">
                An association view of the same {formatINR(ppl.data.grandTotalMinor)}. Category and person are two
                independent ways of slicing your spending — never two things to add together.
              </p>
            </>
          ) : (
            <EmptyState icon="👥" title="No people tagged yet" />
          )}
        </Card>
      </div>

      <Card>
        <SectionTitle>Daily spending</SectionTitle>
        {daily.data?.items.length ? <DailyTrend data={daily.data.items} /> : <p className="muted text-sm py-8 text-center">No data.</p>}
      </Card>

      <Card>
        <SectionTitle>12 month trend</SectionTitle>
        {trends.data?.items.length ? (
          <MonthlyBars data={trends.data.items} activeMonth={month} />
        ) : (
          <p className="muted text-sm py-8 text-center">No history yet.</p>
        )}
      </Card>

      <CategoryDrilldown category={drill} start={start} end={end} personIds={personIds} onClose={() => setDrill(null)} />
    </div>
  );
}

function CategoryDrilldown({
  category,
  start,
  end,
  personIds,
  onClose,
}: {
  category: CategoryStat | null;
  start: string;
  end: string;
  personIds: string[];
  onClose: () => void;
}) {
  const { openAdd } = useShell();
  const { data, isLoading } = useSWR<ExpenseList>(
    category ? `/api/expenses${qs({ start, end, categoryIds: [category.categoryId], personIds, limit: 200 })}` : null,
  );

  return (
    <Modal open={!!category} onClose={onClose} title={category ? `${category.icon} ${category.name}` : ''} wide>
      {category && (
        <>
          <div className="mb-4">
            <p className="text-3xl font-semibold tabular">{formatINR(category.totalMinor)}</p>
            <p className="muted text-sm">{category.count} transactions</p>
          </div>
          {isLoading ? (
            <ListSkeleton rows={5} />
          ) : data?.items.length ? (
            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {data.items.map((e: Expense) => (
                <button
                  key={e.id}
                  onClick={() => {
                    onClose();
                    openAdd(e);
                  }}
                  className="w-full flex items-center gap-3 py-2.5 text-left"
                >
                  <span className="muted text-xs w-14 shrink-0 tabular">{dayLabel(e.expenseDate)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate">{e.people.map((p) => p.name).join(', ') || 'No person'}</p>
                    {e.note && <p className="muted text-xs truncate">{e.note}</p>}
                  </div>
                  <span className="tabular font-medium text-sm shrink-0">{formatINR(e.amountMinor)}</span>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState icon="🧾" title="No transactions" />
          )}
        </>
      )}
    </Modal>
  );
}
