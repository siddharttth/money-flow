'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { currentMonth, dayLabel, monthLabel, monthRange } from '@/lib/dates';
import { formatINR } from '@/lib/money';
import type { CategoryStat, PersonStat, Summary } from '@/lib/types';
import type { Flow } from '@/lib/flow';
import type { InvestmentSummary } from '@/lib/investments';
import type { Transaction } from '@/lib/transactions';
import {
  Card,
  Delta,
  EmptyState,
  ErrorState,
  HeroFigure,
  Insight,
  ListSkeleton,
  Money,
  PageHeader,
  SectionHead,
  Segmented,
  Skeleton,
  StatStrip,
} from '@/components/ui';
import { MonthPicker } from '@/components/month-picker';
import { FlowCurve, DayBars, Donut } from '@/components/graph';
import { BreakdownList } from '@/components/breakdown';
import { TransactionRow } from '@/components/tx-row';
import { useShell } from '@/components/app-shell';
import { useInspector } from '@/components/inspector';

/**
 * The dashboard answers four questions, in this order, top to bottom:
 *
 *   1. How much has left this month, and is that a lot?     — hero + curve
 *   2. At what rate, and where does it land?                — the stat strip
 *   3. On what, and with whom?                              — the two dimensions
 *   4. What actually happened?                              — recent activity
 *
 * Anything that needs more than a glance lives on Analytics. The one rule that
 * governs section 3: category totals sum to the month, person totals do not.
 */
export default function DashboardPage() {
  const [month, setMonth] = useState(currentMonth());
  const [dim, setDim] = useState<'category' | 'person'>('category');
  const { openAdd } = useShell();
  const { openPerson, openCategory } = useInspector();
  const { start, end } = monthRange(month);

  const summary = useSWR<Summary>(`/api/analytics/summary?month=${month}`);
  const flow = useSWR<Flow>(`/api/analytics/flow?month=${month}`);
  const cats = useSWR<{ items: CategoryStat[]; grandTotalMinor: number }>(`/api/analytics/categories?month=${month}`);
  const ppl = useSWR<{ people: PersonStat[]; grandTotalMinor: number; unassignedMinor: number }>(
    `/api/analytics/people?month=${month}`,
  );
  const peers = useSWR<{ owedToMeMinor: number; owedByMeMinor: number; netMinor: number }>('/api/ledger');
  const daily = useSWR<{ items: { date: string; totalMinor: number }[] }>(`/api/analytics/daily?month=${month}`);
  const recent = useSWR<{ items: Transaction[] }>(`/api/transactions?start=${start}&end=${end}&limit=6`);
  const invest = useSWR<InvestmentSummary>(`/api/analytics/investments?month=${month}`);

  const s = summary.data;
  const f = flow.data;
  const net = peers.data?.netMinor ?? 0;

  if (summary.error) return <ErrorState message={summary.error.message} onRetry={() => summary.mutate()} />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Dashboard"
        title={monthLabel(month)}
        actions={<MonthPicker month={month} onChange={setMonth} />}
      />

      {/* 1 — the month, and whether it is running hot. */}
      <Card className="!p-5 sm:!p-6">
        <div className="grid lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] gap-6 lg:gap-8 items-start">
          <div>
            {f ? (
              <HeroFigure
                label={`Spent in ${monthLabel(month).split(' ')[0]}`}
                minor={f.pace.spentMinor}
                delta={<Delta pct={f.pace.deltaPct} />}
                note={
                  f.pace.deltaPct == null ? (
                    `${s?.transactionCount ?? 0} transactions over ${f.cadence.spendDays} days`
                  ) : (
                    <>
                      against{' '}
                      <span className="num">{formatINR(f.pace.prevSameDayMinor)}</span>{' '}
                      {f.isCurrentMonth ? 'by this day last month' : 'the month before'}
                    </>
                  )
                }
              />
            ) : (
              <div className="space-y-3">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-11 w-44" />
                <Skeleton className="h-3 w-40" />
              </div>
            )}

            {f && f.isCurrentMonth && (
              <div className="mt-5 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="label mb-0">Projected month end</span>
                  <Money minor={f.pace.projectedMinor} className="text-base font-semibold" />
                </div>
                <p className="muted text-[12px] mt-1.5">
                  at <span className="num">{formatINR(f.pace.perDayMinor)}</span> a day, day {f.pace.elapsedDays} of{' '}
                  {f.pace.monthDays}
                </p>
              </div>
            )}

            {/* Investing is not spending, so it is not in the figure above —
                which makes saying where it went the more important, not less. */}
            {(invest.data?.monthMinor ?? 0) > 0 && (
              <Link
                href="/investments"
                className="row mt-4 -mx-2 px-2 py-2 rounded-lg flex items-baseline justify-between gap-3"
              >
                <span className="label mb-0">Invested, separately</span>
                <span className="flex items-baseline gap-1.5">
                  <Money minor={invest.data!.monthMinor} className="text-base font-semibold" />
                  <span className="micro" style={{ color: 'var(--accent)' }}>
                    →
                  </span>
                </span>
              </Link>
            )}
          </div>

          <div className="min-w-0">
            {f && f.cumulative.length >= 2 ? (
              <FlowCurve points={f.cumulative} monthDays={f.pace.monthDays} height={190} />
            ) : (
              <EmptyState
                title="Not enough to draw yet"
                hint="Two days of spending gives the curve something to say."
                action={
                  <button className="btn btn-primary" onClick={() => openAdd()}>
                    Add a transaction
                  </button>
                }
              />
            )}
          </div>
        </div>
      </Card>

      {/* 2 — pace, at a glance. */}
      <StatStrip
        items={[
          { label: 'Today', minor: s?.todayMinor ?? 0 },
          { label: 'This week', minor: s?.weekMinor ?? 0 },
          {
            label: 'Daily pace',
            minor: f?.pace.perDayMinor ?? 0,
            sub: f ? `over ${f.pace.elapsedDays} days` : undefined,
          },
          {
            label: 'Net with people',
            minor: Math.abs(net),
            tone: net === 0 ? undefined : net > 0 ? 'var(--credit)' : 'var(--rule-red)',
            sub: net === 0 ? 'all settled' : net > 0 ? 'owed to you' : 'you owe',
          },
        ]}
      />

      {/*
        3 — the two dimensions of the same money.

        Skeletons key off `!data`, not `isLoading`. With SWR's keepPreviousData
        the previous month's figures stay on screen while the next month
        loads, but `isLoading` still reports true for the new key — so these
        lists blanked to skeletons and back on every month step while the
        headline figure above them held steady.
      */}
      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] gap-5 items-start">
        <Card>
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="text-[15px] font-semibold">
              {dim === 'category' ? 'Where it went' : 'Who it was with'}
            </h2>
            <Segmented
              value={dim}
              onChange={setDim}
              options={[
                { value: 'category', label: 'Category' },
                { value: 'person', label: 'Person' },
              ]}
            />
          </div>

          {dim === 'category' ? (
            !cats.data ? (
              <ListSkeleton rows={5} />
            ) : cats.data?.items.length ? (
              <div className="grid sm:grid-cols-[auto_minmax(0,1fr)] gap-5 items-center">
                <Donut
                  data={cats.data.items.map((c) => ({ name: c.name, totalMinor: c.totalMinor, color: c.color }))}
                  size={150}
                  centreLabel={monthLabel(month).split(' ')[0]}
                />
                <BreakdownList
                  items={cats.data.items.slice(0, 6).map((c) => ({
                    id: c.categoryId,
                    name: c.name,
                    color: c.color,
                    icon: c.icon,
                    totalMinor: c.totalMinor,
                    share: c.share,
                  }))}
                  onPick={openCategory}
                />
              </div>
            ) : (
              <EmptyState
                title="Nothing logged yet"
                hint={`No spending recorded for ${monthLabel(month)}.`}
                action={
                  <button className="btn btn-primary" onClick={() => openAdd()}>
                    Add your first transaction
                  </button>
                }
              />
            )
          ) : !ppl.data ? (
            <ListSkeleton rows={5} />
          ) : ppl.data?.people.length ? (
            <>
              <BreakdownList
                items={ppl.data.people.slice(0, 8).map((p) => ({
                  id: p.personId,
                  name: p.name,
                  color: p.color,
                  totalMinor: p.totalMinor,
                  count: p.count,
                }))}
                onPick={openPerson}
              />
              <p className="muted text-[12px] mt-4 leading-relaxed">
                Each person's share of the same{' '}
                <span className="num">{formatINR(ppl.data.grandTotalMinor)}</span>. A transaction tagged with three
                people is split three ways, so these add up to the month rather than multiplying it.
              </p>
            </>
          ) : (
            <EmptyState title="Nobody tagged yet" hint="Tag a person on a transaction and they show up here." />
          )}
        </Card>

        {/* Signals — the derived facts worth knowing without opening Analytics. */}
        <Card>
          <SectionHead
            label="Signals"
            action={
              <Link href="/analytics" className="micro" style={{ color: 'var(--accent)' }}>
                More
              </Link>
            }
          />
          {f ? (
            <div className="space-y-3.5">
              {f.cadence.busiest && (
                <Insight>
                  Heaviest day was <strong className="text-[var(--text)]">{dayLabel(f.cadence.busiest.date)}</strong> at{' '}
                  <span className="num">{formatINR(f.cadence.busiest.totalMinor)}</span>.
                </Insight>
              )}
              {f.tickets.largest && (
                <Insight>
                  Biggest single entry: <span className="num">{formatINR(f.tickets.largest.amountMinor)}</span> on{' '}
                  {f.tickets.largest.categoryName.toLowerCase()}
                  {f.pace.spentMinor > 0 &&
                    ` — ${Math.round((f.tickets.largest.amountMinor / f.pace.spentMinor) * 100)}% of the month`}
                  .
                </Insight>
              )}
              {f.tickets.smallCount >= 3 && (
                <Insight tone="warn">
                  <span className="num">{f.tickets.smallCount}</span> entries under{' '}
                  <span className="num">{formatINR(f.tickets.smallThresholdMinor)}</span> came to{' '}
                  <span className="num">{formatINR(f.tickets.smallTotalMinor)}</span>.
                </Insight>
              )}
              {f.cadence.longestQuietRun >= 2 && (
                <Insight tone="good">
                  <span className="num">{f.cadence.quietDays}</span> days with no spending at all, the longest run{' '}
                  <span className="num">{f.cadence.longestQuietRun}</span> days.
                </Insight>
              )}
              {f.ledger.entryCount > 0 && (
                <Insight>
                  Outside spending, <span className="num">{formatINR(f.ledger.lentMinor)}</span> went out on loan and{' '}
                  <span className="num">{formatINR(f.ledger.borrowedMinor)}</span> came back in.
                </Insight>
              )}
              {!f.cadence.busiest && <p className="muted text-[13px]">Nothing to read from an empty month.</p>}
            </div>
          ) : (
            <ListSkeleton rows={4} />
          )}

          {daily.data && daily.data.items.length > 0 && f && (
            <div className="mt-5 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
              <p className="label mb-2.5">Every day this month</p>
              <DayBars data={daily.data.items} monthDays={f.pace.monthDays} height={72} />
            </div>
          )}
        </Card>
      </div>

      {/* 4 — what actually happened. */}
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
          {!recent.data ? (
            <div className="p-4">
              <ListSkeleton rows={5} />
            </div>
          ) : recent.data?.items.length ? (
            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {recent.data.items.map((t) => (
                <TransactionRow key={`${t.kind}-${t.id}`} tx={t} showDate />
              ))}
            </div>
          ) : (
            <EmptyState
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
