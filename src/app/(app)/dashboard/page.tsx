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
import { NavIcon } from '@/components/icons';
import {
  AllocationBar,
  Badge,
  GoalsStrip,
  MetricCard,
  SweepCard,
  TallyReconciliation,
} from '@/components/plan-cards';

type PeerSummary = {
  balances: { personId: string; name: string; balanceMinor: number; lastEntryDate: string | null }[];
  owedToMeMinor: number;
  owedByMeMinor: number;
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

  /* How far through the month's total budget the spending is — the one
     number the header pill needs, and already on screen in Budgets. */
  const budgetPace = useMemo(() => {
    const spendById = new Map((catStats.data?.items ?? []).map((c) => [c.categoryId, c.totalMinor]));
    const budgeted = (cats.data?.items ?? []).filter((c) => c.kind === 'expense' && c.monthlyBudgetMinor);
    if (!budgeted.length) return null;
    const limit = budgeted.reduce((sum, c) => sum + (c.monthlyBudgetMinor ?? 0), 0);
    const spent = budgeted.reduce((sum, c) => sum + (spendById.get(c.id) ?? 0), 0);
    return limit > 0 ? Math.round((spent / limit) * 100) : null;
  }, [cats.data, catStats.data]);

  const t = plan.data?.tally;

  if (summary.error) return <ErrorState message={summary.error.message} onRetry={() => summary.mutate()} />;

  return (
    <div className="space-y-6">
      {/*
        The stage header. A live dot and a pace read-out rather than a static
        eyebrow — the point of a daily check-in is that it is about right now.
      */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className="w-2 h-2 rounded-full pulse-dot"
              style={{ background: 'var(--accent)' }}
              aria-hidden
            />
            <span className="micro">Active ledger pulse</span>
          </div>
          <h1 className="text-[28px] font-bold tracking-tight leading-tight">{monthLabel(month)}</h1>
          <p className="muted text-[13px] mt-0.5">
            Day {f?.pace.elapsedDays ?? '—'} of {f?.pace.monthDays ?? '—'} · pace and liquid overview
          </p>
        </div>

        {budgetPace != null && (
          <div
            className="flex items-center gap-3 px-4 py-2 rounded-full self-start md:self-auto"
            style={{ background: 'var(--surface)' }}
          >
            <span className="micro">Budget pace</span>
            <span className="w-24 h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${Math.min(100, budgetPace)}%`,
                  background: budgetPace > 100 ? 'var(--rule-red)' : 'var(--accent)',
                }}
              />
            </span>
            <span
              className="num text-[12px] font-semibold"
              style={{ color: budgetPace > 100 ? 'var(--rule-red)' : 'var(--accent)' }}
            >
              {budgetPace}%
            </span>
          </div>
        )}
      </div>

      {/* 0 — last month's underspend, before it evaporates. */}
      {plan.data && <SweepCard sweep={plan.data.sweep} funds={plan.data.funds} />}

      {/*
        THE THREE FIGURES, ACROSS THE TOP.
        What the month has left, what it has cost, and where you stand with
        other people — the only three questions a daily check-in answers. The
        first carries the ambient bloom because it is the one you came for.
      */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {t?.known ? (
          <MetricCard
            glow
            icon={<NavIcon name="dashboard" size={20} />}
            label={`${t.inHandMinor < 0 ? 'Down in' : 'Left in hand ·'} ${monthName}`}
            badge={
              t.ratePct != null && t.inHandMinor >= 0 ? (
                <Badge tone="good">{Math.round(t.ratePct)}% kept</Badge>
              ) : t.inHandMinor < 0 ? (
                <Badge tone="up">drawing down</Badge>
              ) : undefined
            }
            note={
              <>
                after <span className="num">{formatINR(t.outMinor)}</span> spent
                {t.investedMinor > 0 && (
                  <>
                    {' '}
                    and <span className="num">{formatINR(t.investedMinor)}</span> invested
                  </>
                )}
              </>
            }
            footer={
              plan.data ? (
                <>
                  <AllocationBar plan={plan.data} />
                  <div className="mt-3.5 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                    <TallyReconciliation plan={plan.data} />
                  </div>
                </>
              ) : undefined
            }
          >
            <span
              className="num text-[2.4rem] sm:text-[2.6rem] font-bold leading-none tracking-tight"
              style={{ color: t.inHandMinor < 0 ? 'var(--rule-red)' : 'var(--hi)' }}
            >
              {t.inHandMinor < 0 && '−'}
              {formatINR(Math.abs(t.inHandMinor))}
            </span>
            <span className="muted text-[12px]">liquid</span>
          </MetricCard>
        ) : (
          <Card className="!p-5">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <Skeleton className="h-3 w-28 mt-4" />
            <Skeleton className="h-9 w-40 mt-3" />
          </Card>
        )}

        <MetricCard
          icon={<NavIcon name="ledger" size={20} />}
          label={`Spent in ${monthName}`}
          badge={f?.pace.deltaPct != null ? <Delta pct={f.pace.deltaPct} /> : undefined}
          note={
            f ? (
              <>
                projected <span className="num">{formatINR(f.pace.projectedMinor)}</span> at{' '}
                <span className="num">{formatINR(f.pace.perDayMinor)}</span>/day
              </>
            ) : undefined
          }
          footer={
            f && (invest.data?.monthMinor ?? 0) > 0 ? (
              <Link href="/goals" className="row flex items-baseline justify-between gap-3 -mx-2 px-2 py-2 rounded-lg">
                <span className="micro">Invested, separately</span>
                <span className="flex items-baseline gap-1.5">
                  <Money minor={invest.data!.monthMinor} className="text-[14px] font-semibold" />
                  <span className="micro" style={{ color: 'var(--accent)' }}>
                    →
                  </span>
                </span>
              </Link>
            ) : undefined
          }
        >
          <span className="num text-[2.4rem] sm:text-[2.6rem] font-bold leading-none tracking-tight">
            {formatINR(f?.pace.spentMinor ?? 0)}
          </span>
          <span className="muted text-[12px]">{s?.transactionCount ?? 0} entries</span>
        </MetricCard>

        <MetricCard
          icon={<NavIcon name="people" size={20} />}
          label="Net with people"
          badge={
            peers.data ? (
              <Badge tone="neutral">{peers.data.balances.length} contacts</Badge>
            ) : undefined
          }
          note={net === 0 ? 'Everything is settled.' : net > 0 ? 'owed to you, on balance' : 'you owe, on balance'}
          footer={
            peers.data && (peers.data.owedToMeMinor > 0 || peers.data.owedByMeMinor > 0) ? (
              <div className="flex items-center justify-between gap-3">
                <span className="text-[12px]">
                  <span className="muted">You are owed </span>
                  <span className="num font-semibold" style={{ color: 'var(--credit)' }}>
                    {formatINR(peers.data.owedToMeMinor)}
                  </span>
                </span>
                <Link href="/people" className="micro micro-link" style={{ color: 'var(--accent)' }}>
                  Settle →
                </Link>
              </div>
            ) : undefined
          }
        >
          <span
            className="num text-[2.4rem] sm:text-[2.6rem] font-bold leading-none tracking-tight"
            style={net === 0 ? undefined : { color: net > 0 ? 'var(--credit)' : 'var(--rule-red)' }}
          >
            {formatINR(Math.abs(net))}
          </span>
        </MetricCard>
      </div>

      {/*
        TWO COLUMNS, FROM xl UP.
        Left is the month in motion — the curve, the pace tiles, and the list
        of things that need doing. Right is the standing context: what the
        saving is for, and what just happened. Below xl they stack in that
        same order, so the phone reading is the desktop reading flattened.
      */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)] gap-5 items-start">
        <div className="space-y-5 min-w-0">
        <Card className="!p-5 sm:!p-6">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
            <div>
              <h2 className="text-[17px] font-semibold tracking-tight">Cumulative spend trajectory</h2>
              <p className="muted text-[12.5px] mt-0.5">This month against the same days of last month</p>
            </div>
          </div>
          {f && f.cumulative.length >= 2 ? (
            <FlowCurve points={f.cumulative} monthDays={f.pace.monthDays} height={230} />
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

          {/* What needs doing. Below the figures rather than above them: a
              list of chores between the headline and the month buries the
              thing the page exists to say. */}
        <AttentionList items={attention} month={month} />
        </div>

        <div className="space-y-5 min-w-0">
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
        </div>
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
