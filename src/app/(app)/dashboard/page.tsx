'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { currentMonth, dayLabel, monthLabel } from '@/lib/dates';
import { formatINR } from '@/lib/money';
import type { CategoryStat, Expense, ExpenseList, PersonStat, Summary } from '@/lib/types';
import { Card, EmptyState, ErrorState, ListSkeleton, Money, SectionTitle, Skeleton, StatTile } from '@/components/ui';
import { MonthPicker } from '@/components/month-picker';
import { CategoryDonut, DailyTrend, MonthlyBars, ShareBar } from '@/components/charts';
import { useShell } from '@/components/app-shell';
import { monthRange } from '@/lib/dates';
import { CategoryIcon, Icon, PersonMark, resolveIcon } from '@/components/icons';

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
  const peers = useSWR<{ owedToMeMinor: number; owedByMeMinor: number }>('/api/ledger');

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
      {/* The month total carries the brass rule — it is the one number that matters. */}
      <Card className="relative overflow-hidden rule-brass">
        <p className="label">Total spending</p>
        {s ? (
          <>
            <Money minor={s.totalMinor} className="block text-4xl sm:text-5xl font-semibold tracking-tight" />
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
        <StatTile label="Today" minor={s?.todayMinor} value={s ? undefined : '—'} />
        <StatTile label="This week" minor={s?.weekMinor} value={s ? undefined : '—'} />
        <StatTile
          label="Daily average"
          minor={s?.avgDailyMinor}
          value={s ? undefined : '—'}
          sub={s ? `over ${s.activeDays} days` : undefined}
        />
        <StatTile
          label="Top category"
          value={s?.topCategory ? s.topCategory.name : '—'}
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
                        <Icon name={resolveIcon(c.icon)} size={16} />
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
                  <PersonMark name={p.name} color={p.color} size={36} />
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

      {/* Lending sits beside spending but is never added to it. */}
      {peers.data && (peers.data.owedToMeMinor > 0 || peers.data.owedByMeMinor > 0) && (
        <Link href="/peers" className="block">
          <Card className={peers.data.owedByMeMinor > peers.data.owedToMeMinor ? 'rule-red' : 'rule-credit'}>
            <SectionTitle action={<span className="text-sm" style={{ color: 'var(--accent)' }}>Peers →</span>}>
              Lent &amp; borrowed
            </SectionTitle>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="label mb-1">They owe me</p>
                <Money minor={peers.data.owedToMeMinor} className="text-xl font-semibold" style={{ color: 'var(--credit)' }} />
              </div>
              <div>
                <p className="label mb-1">I owe</p>
                <Money minor={peers.data.owedByMeMinor} className="text-xl font-semibold" style={{ color: 'var(--rule-red)' }} />
              </div>
            </div>
            <p className="muted text-xs mt-3">Tracked separately — not part of the {monthLabel(month)} total above.</p>
          </Card>
        </Link>
      )}

      <div className="grid lg:grid-cols-2 gap-5">
        <Card>
          <SectionTitle>Daily spending</SectionTitle>
          {(daily.data?.items.length ?? 0) >= 2 ? (
            <DailyTrend data={daily.data!.items} />
          ) : (
            <EmptyState icon="📈" title="Not enough data yet" hint="Two days of spending draws the first trend." />
          )}
        </Card>

        <Card>
          <SectionTitle>Last 6 months</SectionTitle>
          {(trends.data?.items.length ?? 0) >= 2 ? (
            <MonthlyBars data={trends.data!.items} activeMonth={month} />
          ) : (
            <EmptyState
              icon="📅"
              title="Not enough history yet"
              hint="A trend needs at least two months. Come back next month and this fills in."
            />
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
      <CategoryIcon icon={e.category.icon} color={e.category.color} size={36} />
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
