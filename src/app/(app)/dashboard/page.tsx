'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { currentMonth, monthLabel, monthRange } from '@/lib/dates';
import { formatINR } from '@/lib/money';
import type { Category, CategoryStat, Summary } from '@/lib/types';
import type { Flow } from '@/lib/flow';
import type { InvestmentSummary } from '@/lib/investments';
import type { MonthlyPlan, Sweep } from '@/lib/plan';
import type { IncomeOverview } from '@/lib/income';
import type { Fund } from '@/lib/funds';
import type { Transaction } from '@/lib/transactions';
import { getAttention } from '@/lib/attention';
import {
  Card,
  Delta,
  EmptyState,
  ErrorState,
  HeroFigure,
  ListSkeleton,
  Money,
  PageHeader,
  SectionHead,
  Skeleton,
  StatStrip,
} from '@/components/ui';
import { FlowCurve } from '@/components/graph';
import { TransactionRow } from '@/components/tx-row';
import { useShell } from '@/components/app-shell';
import { AttentionList } from '@/components/attention';
import { GoalsStrip, MonthTally, SweepCard } from '@/components/plan-cards';

type PeerSummary = {
  balances: { personId: string; name: string; balanceMinor: number; lastEntryDate: string | null }[];
  netMinor: number;
};

/**
 * HOME — one question: is this month going well, and is there anything I
 * should do about it?
 *
 * It used to be nine blocks, three of which were Analytics at a lower density
 * — the same hero, curve, delta, stat strip, donut and person split. A daily
 * check-in that needs scrolling has failed at being a check-in, so the
 * duplicated analysis moved to the pages that exist to hold it and five blocks
 * remain:
 *
 *   1. what the month has left       4. what the saving is for
 *   2. what needs you                5. what just happened
 *   3. the month at a glance
 *
 * And there is no month picker. Home is *now*. Browsing months belongs on
 * /analytics/month — which is also what makes "Today" and "This week" safe to
 * print, since they can no longer appear under a heading from August.
 */
export default function DashboardPage() {
  const month = currentMonth();
  const { openAdd } = useShell();
  const { start, end } = monthRange(month);

  const summary = useSWR<Summary>(`/api/analytics/summary?month=${month}`);
  const flow = useSWR<Flow>(`/api/analytics/flow?month=${month}`);
  const plan = useSWR<MonthlyPlan & { sweep: Sweep }>(`/api/plan?month=${month}`);
  const peers = useSWR<PeerSummary>('/api/ledger');
  const recent = useSWR<{ items: Transaction[] }>(`/api/transactions?start=${start}&end=${end}&limit=5`);
  const invest = useSWR<InvestmentSummary>(`/api/analytics/investments?month=${month}`);
  const income = useSWR<IncomeOverview>(`/api/income?month=${month}`);
  const funds = useSWR<{ items: Fund[] }>(`/api/funds?month=${month}`);
  const cats = useSWR<{ items: Category[] }>('/api/categories');
  const catStats = useSWR<{ items: CategoryStat[] }>(`/api/analytics/categories?month=${month}`);
  const lifetime = useSWR<{ inHandMinor: number; months: number }>('/api/analytics/lifetime');

  const s = summary.data;
  const f = flow.data;
  const net = peers.data?.netMinor ?? 0;
  const monthName = monthLabel(month).split(' ')[0];

  /*
   * Every rule reads a figure the app was already computing. Nothing here is
   * new data — it is the same numbers, finally addressed to someone.
   */
  const attention = useMemo(() => {
    const spendById = new Map((catStats.data?.items ?? []).map((c) => [c.categoryId, c.totalMinor]));
    return getAttention({
      plan: plan.data,
      flow: f,
      funds: funds.data?.items ?? [],
      income: income.data,
      budgets: (cats.data?.items ?? [])
        .filter((c) => c.kind === 'expense' && c.monthlyBudgetMinor)
        .map((c) => ({
          categoryId: c.id,
          name: c.name,
          spentMinor: spendById.get(c.id) ?? 0,
          budgetMinor: c.monthlyBudgetMinor ?? 0,
        })),
      peers: (peers.data?.balances ?? []).map((b) => ({
        personId: b.personId,
        name: b.name,
        balanceMinor: b.balanceMinor,
        sinceDate: b.lastEntryDate,
      })),
    });
  }, [plan.data, f, funds.data, income.data, cats.data, catStats.data, peers.data]);

  if (summary.error) return <ErrorState message={summary.error.message} onRetry={() => summary.mutate()} />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Dashboard"
        title={monthLabel(month)}
        sub={`Day ${f?.pace.elapsedDays ?? '—'} of ${f?.pace.monthDays ?? '—'}.`}
      />

      {/* 0 — last month's underspend, before it evaporates. */}
      {plan.data && <SweepCard sweep={plan.data.sweep} funds={plan.data.funds} />}

      {/* 1 — the bottom line, and the reason to open the app at all. */}
      {plan.data ? (
        <MonthTally plan={plan.data} monthName={monthName} />
      ) : (
        <Card className="!p-5 sm:!p-6">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-11 w-48 mt-3" />
        </Card>
      )}

      {/* 2 — what needs doing. Usually short, often empty, and empty is a result. */}
      <AttentionList items={attention} month={month} />

      {/* 3 — the month at a glance. Detail lives one tap away. */}
      <Card className="!p-5 sm:!p-6">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] gap-6 lg:gap-8 items-start">
          <div>
            {f ? (
              <HeroFigure
                label={`Spent in ${monthName}`}
                minor={f.pace.spentMinor}
                delta={<Delta pct={f.pace.deltaPct} />}
                note={
                  f.pace.deltaPct == null ? (
                    `${s?.transactionCount ?? 0} transactions over ${f.cadence.spendDays} days`
                  ) : (
                    <>
                      against <span className="num">{formatINR(f.pace.prevSameDayMinor)}</span> by this day last
                      month
                    </>
                  )
                }
              />
            ) : (
              <div className="space-y-3">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-11 w-44" />
              </div>
            )}

            {f && (
              <div className="mt-5 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="label mb-0">Projected month end</span>
                  <Money minor={f.pace.projectedMinor} className="text-base font-semibold" />
                </div>
                <p className="muted text-[12px] mt-1.5">
                  at <span className="num">{formatINR(f.pace.perDayMinor)}</span> a day
                </p>
              </div>
            )}

            {(invest.data?.monthMinor ?? 0) > 0 && (
              <Link
                href="/goals"
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
              <FlowCurve points={f.cumulative} monthDays={f.pace.monthDays} height={180} />
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

      <StatStrip
        items={[
          { label: 'Today', minor: s?.todayMinor ?? 0 },
          { label: 'This week', minor: s?.weekMinor ?? 0 },
          {
            label: 'Typical entry',
            minor: f?.tickets.medianMinor ?? 0,
            sub: f ? `${f.tickets.count} this month` : undefined,
          },
          {
            label: 'Net with people',
            minor: Math.abs(net),
            tone: net === 0 ? undefined : net > 0 ? 'var(--credit)' : 'var(--rule-red)',
            sub: net === 0 ? 'all settled' : net > 0 ? 'owed to you' : 'you owe',
          },
        ]}
      />

      {/* 4 — what the saving is for. */}
      {(funds.data?.items.length ?? 0) > 0 && <GoalsStrip funds={funds.data!.items} />}

      {/* 5 — what just happened. */}
      <div>
        <SectionHead
          label="Recent activity"
          action={
            <Link href="/expenses" className="micro micro-link" style={{ color: 'var(--accent)' }}>
              View all
            </Link>
          }
        />
        <Card className="!p-0 overflow-clip">
          {!recent.data ? (
            <div className="p-4">
              <ListSkeleton rows={4} />
            </div>
          ) : recent.data.items.length ? (
            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {recent.data.items.map((t) => (
                <TransactionRow key={`${t.kind}-${t.id}`} tx={t} showDate />
              ))}
            </div>
          ) : (
            <EmptyState
              title="Nothing this month"
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

      {/* The lifetime figure keeps a one-line presence, and links to its page. */}
      {lifetime.data && lifetime.data.months > 0 && (
        <Link
          href="/analytics/lifetime"
          className="row flex items-baseline justify-between gap-3 px-4 py-3 rounded-xl"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <span className="label mb-0">Kept across {lifetime.data.months} months</span>
          <span className="flex items-baseline gap-1.5">
            <Money
              minor={Math.abs(lifetime.data.inHandMinor)}
              className="text-[15px] font-semibold"
              style={lifetime.data.inHandMinor < 0 ? { color: 'var(--rule-red)' } : undefined}
            />
            <span className="micro" style={{ color: 'var(--accent)' }}>
              →
            </span>
          </span>
        </Link>
      )}
    </div>
  );
}
