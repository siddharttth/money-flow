'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { currentMonth, dayLabel, monthLabel } from '@/lib/dates';
import { formatINR } from '@/lib/money';
import type { CategoryStat, Expense, ExpenseList, PersonStat, Summary } from '@/lib/types';
import { Card, EmptyState, ErrorState, ListSkeleton, SectionTitle, Skeleton, StatTile } from '@/components/ui';
import { MonthPicker } from '@/components/month-picker';
import { CategoryDonut, DailyTrend, MonthlyBars, ShareBar } from '@/components/charts';
import { useShell } from '@/components/app-shell';
import { monthRange } from '@/lib/dates';

export default function DashboardPage() {
  const [month, setMonth] = useState(currentMonth());
  const { openAdd } = useShell();
  const { start, end } = monthRange(month);

  const summary = useSWR<Summary>(`/api/analytics/summary?month=${month}`);
  const cats = useSWR<{ items: CategoryStat[]; grandTotalMinor: number }>(`/api/analytics/categories?month=${month}`);
  const ppl = useSWR<{ people: PersonStat[]; unassignedMinor: number; grandTotalMinor: number }>(
    `/api/analytics/people?month=${month}`,
  );
  const daily = useSWR<{ items: { date: string; totalMinor: number }[] }>(`/api/analytics/daily?month=${month}`);
  const trends = useSWR<{ items: { month: string; totalMinor: number }[] }>(`/api/analytics/trends?months=6`);
  const recent = useSWR<ExpenseList>(`/api/expenses?start=${start}&end=${end}&limit=6`);

  const s = summary.data;
  const change = s?.changePct;

  if (summary.error) return <ErrorState message={summary.error.message} onRetry={() => summary.mutate()} />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold">Dashboard</h1>
          {/* The picker beside this already names the month on small screens. */}
          <p className="muted text-sm hidden sm:block">{monthLabel(month)}</p>
        </div>
        <MonthPicker month={month} onChange={setMonth} />
      </div>

      {/* Hero total */}
      <Card className="relative overflow-hidden">
        <p className="label">Total spending</p>
        {s ? (
          <>
            <p className="text-4xl sm:text-5xl font-semibold tabular tracking-tight">{formatINR(s.totalMinor)}</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm muted">
              <span>{s.transactionCount} transactions</span>
              {change != null && (
                <span style={{ color: change > 0 ? 'var(--danger)' : 'var(--success)' }}>
                  {change > 0 ? '▲' : '▼'} {Math.abs(change).toFixed(1)}% vs {monthLabel(s.previousMonth.month)}
                </span>
              )}
            </div>
          </>
        ) : (
          <Skeleton className="h-12 w-52 mt-1" />
        )}
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Today" value={s ? formatINR(s.todayMinor) : '—'} />
        <StatTile label="This week" value={s ? formatINR(s.weekMinor) : '—'} />
        <StatTile label="Daily average" value={s ? formatINR(s.avgDailyMinor) : '—'} sub={s ? `over ${s.activeDays} days` : undefined} />
        <StatTile
          label="Top category"
          value={s?.topCategory ? `${s.topCategory.icon} ${s.topCategory.name}` : '—'}
          sub={s?.topCategory ? formatINR(s.topCategory.totalMinor) : undefined}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card>
          <SectionTitle action={<Link href="/analytics" className="text-sm" style={{ color: 'var(--accent)' }}>All →</Link>}>
            Where it went
          </SectionTitle>
          {cats.isLoading ? (
            <ListSkeleton rows={4} />
          ) : cats.data?.items.length ? (
            <>
              <CategoryDonut data={cats.data.items.map((c) => ({ name: c.name, totalMinor: c.totalMinor, color: c.color }))} />
              <div className="space-y-2.5 mt-4">
                {cats.data.items.slice(0, 6).map((c) => (
                  <Link key={c.categoryId} href={`/analytics?category=${c.categoryId}&month=${month}`} className="block">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex items-center gap-2 min-w-0">
                        <span aria-hidden>{c.icon}</span>
                        <span className="truncate">{c.name}</span>
                      </span>
                      <span className="tabular font-medium shrink-0">{formatINR(c.totalMinor)}</span>
                    </div>
                    <ShareBar share={c.share} color={c.color} />
                  </Link>
                ))}
              </div>
            </>
          ) : (
            <EmptyState
              icon="📊"
              title="No spending yet"
              hint={`Nothing recorded for ${monthLabel(month)}.`}
              action={
                <button className="btn btn-primary" onClick={() => openAdd()}>
                  Add your first expense
                </button>
              }
            />
          )}
        </Card>

        <Card>
          <SectionTitle action={<Link href="/people" className="text-sm" style={{ color: 'var(--accent)' }}>All →</Link>}>
            Who it was with
          </SectionTitle>
          {ppl.isLoading ? (
            <ListSkeleton rows={4} />
          ) : ppl.data?.people.length ? (
            <div className="space-y-1">
              {ppl.data.people.slice(0, 7).map((p) => (
                <Link
                  key={p.personId}
                  href={`/people/${p.personId}?month=${month}`}
                  className="flex items-center gap-3 py-2 rounded-lg"
                >
                  <span
                    className="w-9 h-9 rounded-full flex items-center justify-center text-base shrink-0"
                    style={{ background: `${p.color}22` }}
                    aria-hidden
                  >
                    {p.avatar}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {p.name} {p.isSelf && <span className="muted font-normal text-xs">· you</span>}
                    </p>
                    <p className="muted text-xs">
                      {p.count} {p.count === 1 ? 'transaction' : 'transactions'}
                    </p>
                  </div>
                  <span className="tabular font-medium text-sm">{formatINR(p.totalMinor)}</span>
                </Link>
              ))}
              {ppl.data.unassignedMinor > 0 && (
                <div className="flex items-center gap-3 py-2 border-t mt-1 pt-3" style={{ borderColor: 'var(--border)' }}>
                  <span className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'var(--surface-2)' }}>
                    —
                  </span>
                  <p className="text-sm muted flex-1">Not linked to anyone</p>
                  <span className="tabular text-sm muted">{formatINR(ppl.data.unassignedMinor)}</span>
                </div>
              )}
              {/* The one thing users get wrong about this app, stated plainly. */}
              <p className="muted text-xs pt-3 leading-relaxed">
                These are association totals — the same {formatINR(ppl.data.grandTotalMinor)} of spending viewed by
                person. They aren&apos;t added to the month total.
              </p>
            </div>
          ) : (
            <EmptyState icon="👥" title="Nobody tagged yet" hint="Tag people on an expense to see this breakdown." />
          )}
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card>
          <SectionTitle>Daily spending</SectionTitle>
          {daily.data?.items.length ? (
            <DailyTrend data={daily.data.items} />
          ) : (
            <p className="muted text-sm py-8 text-center">Not enough data for a trend yet.</p>
          )}
        </Card>

        <Card>
          <SectionTitle>Last 6 months</SectionTitle>
          {trends.data?.items.length ? (
            <MonthlyBars data={trends.data.items} activeMonth={month} />
          ) : (
            <p className="muted text-sm py-8 text-center">No history yet.</p>
          )}
        </Card>
      </div>

      <Card>
        <SectionTitle action={<Link href="/expenses" className="text-sm" style={{ color: 'var(--accent)' }}>View all →</Link>}>
          Recent
        </SectionTitle>
        {recent.isLoading ? (
          <ListSkeleton rows={4} />
        ) : recent.data?.items.length ? (
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {recent.data.items.map((e) => (
              <RecentRow key={e.id} expense={e} />
            ))}
          </div>
        ) : (
          <EmptyState icon="🧾" title="No expenses this month" />
        )}
      </Card>
    </div>
  );
}

function RecentRow({ expense: e }: { expense: Expense }) {
  const { openAdd } = useShell();
  return (
    <button onClick={() => openAdd(e)} className="w-full flex items-center gap-3 py-3 text-left">
      <span
        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: `${e.category.color}22` }}
        aria-hidden
      >
        {e.category.icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">
          {e.category.name}
          {e.people.length > 0 && <span className="muted font-normal"> · {e.people.map((p) => p.name).join(', ')}</span>}
        </p>
        <p className="muted text-xs truncate">
          {dayLabel(e.expenseDate)}
          {e.note ? ` · ${e.note}` : ''}
        </p>
      </div>
      <span className="tabular font-medium text-sm shrink-0">{formatINR(e.amountMinor)}</span>
    </button>
  );
}
