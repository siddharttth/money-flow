'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { currentMonth, dayLabel, monthLabel, monthRange, todayISO, daysBetween } from '@/lib/dates';
import { formatINR } from '@/lib/money';
import type { CategoryStat, PersonStat, Summary } from '@/lib/types';
import type { Transaction } from '@/lib/transactions';
import { Card, EmptyState, ErrorState, ListSkeleton, Money, SectionHead, Skeleton } from '@/components/ui';
import { MonthPicker } from '@/components/month-picker';
import { CategoryDonut, DailyTrend } from '@/components/charts';
import { useShell } from '@/components/app-shell';
import { useInspector } from '@/components/inspector';
import { CategoryIcon, PersonMark } from '@/components/icons';

export default function DashboardPage() {
  const [month, setMonth] = useState(currentMonth());
  const [view, setView] = useState<'trend' | 'categories'>('trend');
  const { openAdd } = useShell();
  const { openPerson, openCategory } = useInspector();
  const { start, end } = monthRange(month);

  const summary = useSWR<Summary>(`/api/analytics/summary?month=${month}`);
  const cats = useSWR<{ items: CategoryStat[]; grandTotalMinor: number }>(`/api/analytics/categories?month=${month}`);
  const ppl = useSWR<{ people: PersonStat[]; grandTotalMinor: number }>(`/api/analytics/people?month=${month}`);
  const daily = useSWR<{ items: { date: string; totalMinor: number }[] }>(`/api/analytics/daily?month=${month}`);
  const peers = useSWR<{ owedToMeMinor: number; owedByMeMinor: number; netMinor: number }>('/api/ledger');
  const recent = useSWR<{ items: Transaction[] }>(`/api/transactions?start=${start}&end=${end}&limit=8`);

  const s = summary.data;
  const today = todayISO();
  const isCurrent = month === today.slice(0, 7);
  const daysElapsed = isCurrent ? daysBetween(start, today) : daysBetween(start, end);
  const daysInMonth = daysBetween(start, end);
  // Straight-line burn rate — the simplest projection that is honest.
  const projected = s && daysElapsed ? Math.round((s.totalMinor / daysElapsed) * daysInMonth) : 0;
  const net = peers.data?.netMinor ?? 0;

  if (summary.error) return <ErrorState message={summary.error.message} onRetry={() => summary.mutate()} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold">Dashboard</h1>
          <p className="muted text-sm hidden sm:block">{monthLabel(month)}</p>
        </div>
        <MonthPicker month={month} onChange={setMonth} />
      </div>

      {/* Four figures that answer: how much, how fast, who, and where it lands. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="!p-4">
          <p className="micro mb-1.5">Spent this month</p>
          {s ? (
            <>
              <Money minor={s.totalMinor} className="block text-2xl font-semibold" />
              <p className="text-xs mt-1.5" style={{ color: (s.changePct ?? 0) > 0 ? 'var(--rule-red)' : 'var(--credit)' }}>
                {s.changePct != null
                  ? `${s.changePct > 0 ? '↑' : '↓'} ${Math.abs(s.changePct).toFixed(1)}% vs ${monthLabel(s.previousMonth.month).split(' ')[0]}`
                  : `${s.transactionCount} transactions`}
              </p>
            </>
          ) : (
            <Skeleton className="h-8 w-24" />
          )}
        </Card>

        <Card className="!p-4">
          <p className="micro mb-1.5">Daily pace</p>
          {s ? (
            <>
              <Money minor={s.avgDailyMinor} className="block text-2xl font-semibold" />
              <p className="muted text-xs mt-1.5">avg over {daysElapsed} days</p>
            </>
          ) : (
            <Skeleton className="h-8 w-24" />
          )}
        </Card>

        <Link href="/people" className="block">
          <Card className="!p-4 h-full transition-colors" style={{ transitionDuration: '150ms' }}>
            <p className="micro mb-1.5">Net peer balance</p>
            {peers.data ? (
              <>
                <Money
                  minor={Math.abs(net)}
                  className="block text-2xl font-semibold"
                  style={{ color: net === 0 ? 'var(--text)' : net > 0 ? 'var(--credit)' : 'var(--rule-red)' }}
                />
                <p className="muted text-xs mt-1.5">
                  {net === 0
                    ? 'all settled'
                    : `${formatINR(peers.data.owedToMeMinor)} lent · ${formatINR(peers.data.owedByMeMinor)} borrowed`}
                </p>
              </>
            ) : (
              <Skeleton className="h-8 w-24" />
            )}
          </Card>
        </Link>

        <Card className="!p-4">
          <p className="micro mb-1.5">Projected month end</p>
          {s ? (
            <>
              <Money minor={projected} className="block text-2xl font-semibold" />
              <p className="muted text-xs mt-1.5">
                {isCurrent ? `at the current burn rate` : `actual for ${monthLabel(month).split(' ')[0]}`}
              </p>
            </>
          ) : (
            <Skeleton className="h-8 w-24" />
          )}
        </Card>
      </div>

      {/* 60/40: the chart carries the month, the rails carry the shortcuts. */}
      <div className="grid lg:grid-cols-5 gap-5 items-start">
        <Card className="lg:col-span-3">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="text-base font-semibold">Spending trajectory</h2>
            <div className="flex gap-1 p-1 rounded-full" style={{ background: 'var(--surface-2)' }}>
              {(['trend', 'categories'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className="px-3 py-1 rounded-full text-xs font-semibold capitalize transition-colors"
                  style={{
                    transitionDuration: '150ms',
                    background: view === v ? 'var(--surface)' : 'transparent',
                    color: view === v ? 'var(--text)' : 'var(--text-muted)',
                  }}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {view === 'trend' ? (
            (daily.data?.items.length ?? 0) >= 2 ? (
              <DailyTrend data={daily.data!.items} height={330} />
            ) : (
              <EmptyState icon="📈" title="Not enough data yet" hint="Two days of spending draws the first trend." />
            )
          ) : cats.data?.items.length ? (
            <>
              <CategoryDonut
                data={cats.data.items.map((c) => ({ name: c.name, totalMinor: c.totalMinor, color: c.color }))}
                height={200}
              />
              <div className="space-y-1 mt-4">
                {cats.data.items.slice(0, 5).map((c) => (
                  <button
                    key={c.categoryId}
                    onClick={() => openCategory(c.categoryId)}
                    className="row w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left"
                  >
                    <CategoryIcon icon={c.icon} color={c.color} size={28} />
                    <span className="text-sm flex-1 truncate">{c.name}</span>
                    <span className="micro">{(c.share * 100).toFixed(0)}%</span>
                    <Money minor={c.totalMinor} className="text-sm font-semibold w-20 text-right" />
                  </button>
                ))}
              </div>
            </>
          ) : (
            <EmptyState
              icon="📊"
              title="Nothing logged yet"
              hint={`No spending recorded for ${monthLabel(month)}.`}
              action={
                <button className="btn btn-primary" onClick={() => openAdd()}>
                  Add your first transaction
                </button>
              }
            />
          )}
        </Card>

        <div className="lg:col-span-2 space-y-5">
          <Card>
            <SectionHead label="Top categories" action={<Link href="/analytics" className="micro" style={{ color: 'var(--accent)' }}>All</Link>} />
            {cats.isLoading ? (
              <ListSkeleton rows={4} />
            ) : cats.data?.items.length ? (
              <div className="space-y-0.5">
                {cats.data.items.slice(0, 4).map((c) => (
                  <button
                    key={c.categoryId}
                    onClick={() => openCategory(c.categoryId)}
                    className="row w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left"
                  >
                    <CategoryIcon icon={c.icon} color={c.color} size={26} />
                    <span className="text-sm flex-1 truncate">{c.name}</span>
                    <Money minor={c.totalMinor} className="text-sm font-semibold" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="muted text-sm py-2">No categories used yet.</p>
            )}
          </Card>

          <Card>
            <SectionHead label="Top people" action={<Link href="/people" className="micro" style={{ color: 'var(--accent)' }}>All</Link>} />
            {ppl.isLoading ? (
              <ListSkeleton rows={4} />
            ) : ppl.data?.people.length ? (
              <div className="space-y-0.5">
                {ppl.data.people.slice(0, 4).map((p) => (
                  <button
                    key={p.personId}
                    onClick={() => openPerson(p.personId)}
                    className="row w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left"
                  >
                    <PersonMark name={p.name} color={p.color} size={26} />
                    <span className="text-sm flex-1 truncate">{p.name}</span>
                    <Money minor={p.totalMinor} className="text-sm font-semibold" />
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState icon="👥" title="Nobody tagged yet" hint="Tag a person on a transaction." />
            )}
          </Card>
        </div>
      </div>

      <div>
        <SectionHead
          label="Recent activity"
          action={
            <Link href="/expenses" className="micro" style={{ color: 'var(--accent)' }}>
              View all
            </Link>
          }
        />
        <Card className="!p-0 overflow-hidden">
          {recent.isLoading ? (
            <div className="p-4">
              <ListSkeleton rows={5} />
            </div>
          ) : recent.data?.items.length ? (
            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {recent.data.items.map((t) => (
                <ActivityRow key={`${t.kind}-${t.id}`} tx={t} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon="🧾"
              title="No activity this month"
              hint="Log a transaction and it appears here instantly."
              action={
                <button className="btn btn-primary" onClick={() => openAdd()}>
                  Add transaction
                </button>
              }
            />
          )}
        </Card>
      </div>
    </div>
  );
}

function ActivityRow({ tx }: { tx: Transaction }) {
  const { openPerson, openCategory } = useInspector();
  const isLedger = tx.kind !== 'expense';

  return (
    <div className="row flex items-center gap-3 px-4 py-3">
      {tx.category ? (
        <CategoryIcon icon={tx.category.icon} color={tx.category.color} size={34} />
      ) : (
        <span
          className="w-[34px] h-[34px] rounded-lg flex items-center justify-center text-sm font-bold shrink-0"
          style={{
            background: tx.kind === 'borrowed' ? 'var(--credit-soft)' : 'var(--rule-red-soft)',
            color: tx.kind === 'borrowed' ? 'var(--credit)' : 'var(--rule-red)',
          }}
        >
          {tx.kind === 'borrowed' ? '↓' : '↑'}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">
          {tx.note || tx.category?.name || (tx.kind === 'lent' ? 'Money given' : 'Money received')}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className="muted text-xs">{dayLabel(tx.date)}</span>
          {tx.category && (
            <button className="tag" onClick={() => openCategory(tx.category!.id)}>
              {tx.category.name}
            </button>
          )}
          {tx.people.map((p) => (
            <button key={p.id} className="tag" onClick={() => openPerson(p.id)}>
              <PersonMark name={p.name} color={p.color} size={14} />
              {p.name}
            </button>
          ))}
          {isLedger && <span className="micro">{tx.kind}</span>}
        </div>
      </div>

      <Money minor={tx.amountMinor} className="text-sm font-semibold shrink-0" />
    </div>
  );
}
