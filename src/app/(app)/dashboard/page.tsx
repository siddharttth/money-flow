'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { currentMonth, monthLabel, monthRange, todayISO } from '@/lib/dates';
import { formatINR } from '@/lib/money';
import type { Category, CategoryStat, Summary } from '@/lib/types';
import type { Flow } from '@/lib/flow';
import type { InvestmentSummary } from '@/lib/investments';
import type { MonthlyPlan, Sweep } from '@/lib/plan';
import type { Fund } from '@/lib/funds';
import type { Transaction } from '@/lib/transactions';
import {
  Card,
  CardSection,
  CardStrip,
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
import { CategoryBubbles, FlowCurve } from '@/components/graph';
import { TransactionRow } from '@/components/tx-row';
import { useShell } from '@/components/app-shell';
import { NavIcon } from '@/components/icons';
import { CountMoney, useFreshKeys, useGrowClass, usePulseOnChange } from '@/components/motion';
import {
  ActiveGoalCard,
  AllocationBar,
  Badge,
  GoalsStrip,
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
  const funds = useSWR<{ items: Fund[] }>(`/api/funds?month=${month}`);
  const cats = useSWR<{ items: Category[] }>('/api/categories');
  const catStats = useSWR<{ items: CategoryStat[] }>(`/api/analytics/categories?month=${month}`);
  const lifetime = useSWR<{ inHandMinor: number; months: number }>('/api/analytics/lifetime');

  const s = summary.data;
  const f = flow.data;
  const net = peers.data?.netMinor ?? 0;
  const monthName = monthLabel(month).split(' ')[0];

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
  const goalCount = funds.data?.items.length ?? 0;

  /* Motion for what you change, never for the page arriving (motion.tsx). */
  const grow = useGrowClass();
  const monthPulse = usePulseOnChange([t?.inHandMinor, f?.pace.spentMinor, s?.todayMinor]);
  const freshRows = useFreshKeys(
    (recent.data?.items ?? []).map((x) => `${x.kind}-${x.id}`),
    !!recent.data && !recent.isValidating,
  );

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
          <Link
            href="/analytics/month#budgets"
            className="row flex items-center gap-3 px-4 py-2 rounded-full self-start md:self-auto"
            style={{ background: 'var(--surface)' }}
            aria-label={`Budget pace ${budgetPace}% — open Budgets`}
          >
            <span className="micro">Budget pace</span>
            <span className="w-24 h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
              <span
                className={`block h-full rounded-full ${grow}`}
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
          </Link>
        )}
      </div>

      {/* 0 — last month's underspend, before it evaporates. */}
      {plan.data && <SweepCard sweep={plan.data.sweep} funds={plan.data.funds} />}

      {/*
        TWO COLUMNS, FROM xl UP.
        Left is the month — one card, because "how is this month going" is one
        question: what is left, what it has cost, the curve, and the pace tiles
        are chapters of it rather than four answers to four questions. Right is
        what needs doing, what the saving is for, and what just happened. Below
        xl they stack in that order, so the phone reading is the desktop
        reading flattened.
      */}
      {/* The month card is as tall as the column beside it: the curve takes
          whatever height is left, so the card never ends a third of the way
          down with the right-hand column still going. */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)] gap-5">
        <Card className="!p-5 sm:!p-6 glow-card bloom-lg min-w-0 flex flex-col" {...monthPulse}>
          <div className="relative flex flex-col flex-1">
            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-5 md:gap-6">
              {/* The figure you came for. The largest number on the page. */}
              {t?.known ? (
                <div className="min-w-0">
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <span className="icon-tile icon-tile-accent">
                      <NavIcon name="dashboard" size={20} />
                    </span>
                    {t.ratePct != null && t.inHandMinor >= 0 ? (
                      <Badge tone="good">{Math.round(t.ratePct)}% kept</Badge>
                    ) : t.inHandMinor < 0 ? (
                      <Badge tone="up">drawing down</Badge>
                    ) : null}
                  </div>
                  <p className="label mb-1.5">
                    {t.inHandMinor < 0 ? 'Down in' : 'Left in hand ·'} {monthName}
                  </p>
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span
                      className="num text-[2.4rem] sm:text-[2.6rem] font-bold leading-none tracking-tight"
                      style={{ color: t.inHandMinor < 0 ? 'var(--rule-red)' : 'var(--hi)' }}
                    >
                      {t.inHandMinor < 0 && '−'}
                      <CountMoney minor={Math.abs(t.inHandMinor)} />
                    </span>
                    <span className="muted text-[12px]">liquid</span>
                  </div>
                  <p className="muted text-[12.5px] mt-1.5 leading-relaxed">
                    after <span className="num">{formatINR(t.outMinor)}</span> spent
                    {t.investedMinor > 0 && (
                      <>
                        {' '}
                        and <span className="num">{formatINR(t.investedMinor)}</span> invested
                      </>
                    )}
                  </p>
                </div>
              ) : (
                <div>
                  <Skeleton className="h-10 w-10 rounded-xl" />
                  <Skeleton className="h-3 w-28 mt-4" />
                  <Skeleton className="h-9 w-40 mt-3" />
                </div>
              )}

              {/* What it has cost — second in rank, so a step down in size. */}
              <div
                className="min-w-0 pt-4 border-t md:pt-0 md:border-t-0 md:pl-6 md:border-l"
                style={{ borderColor: 'var(--border)' }}
              >
                {/* The whole figure leads to the month it summarises. */}
                <Link href="/analytics/month" className="row block -mx-2 px-2 py-1 -my-1 rounded-lg">
                  <div className="flex items-center justify-between gap-3 mb-1.5">
                    <p className="label mb-0">Spent in {monthName}</p>
                    {f?.pace.deltaPct != null && <Delta pct={f.pace.deltaPct} />}
                  </div>
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <CountMoney
                      minor={f?.pace.spentMinor ?? 0}
                      className="text-[1.6rem] sm:text-[1.75rem] font-semibold leading-none tracking-tight"
                    />
                    <span className="muted text-[12px]">{s?.transactionCount ?? 0} entries</span>
                  </div>
                  {f && (
                    <p className="muted text-[12.5px] mt-1.5 leading-relaxed">
                      projected <span className="num">{formatINR(f.pace.projectedMinor)}</span> at{' '}
                      <span className="num">{formatINR(f.pace.perDayMinor)}</span>/day
                    </p>
                  )}
                </Link>
                {f && (invest.data?.monthMinor ?? 0) > 0 && (
                  <Link
                    href="/goals"
                    className="row flex items-baseline justify-between gap-3 -mx-2 px-2 py-2 mt-2 rounded-lg"
                  >
                    <span className="micro">Invested, separately</span>
                    <span className="flex items-baseline gap-1.5">
                      <CountMoney minor={invest.data!.monthMinor} className="text-[14px] font-semibold" />
                      <span className="micro" style={{ color: 'var(--accent)' }}>
                        →
                      </span>
                    </span>
                  </Link>
                )}
              </div>
            </div>

            {/* Where the month's money went, and the subtraction behind the figure. */}
            {t?.known && plan.data && (
              <div className="mt-5">
                <AllocationBar plan={plan.data} />
                <div className="mt-3.5 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                  <TallyReconciliation plan={plan.data} />
                </div>
              </div>
            )}

            <CardSection className="flex-1 flex flex-col">
              <div className="mb-4">
                <h2 className="text-[15px] font-semibold tracking-tight">Cumulative spend trajectory</h2>
                <p className="muted text-[12px] mt-0.5">This month against the same days of last month</p>
              </div>
              {f && f.cumulative.length >= 2 ? (
                <FlowCurve fill points={f.cumulative} monthDays={f.pace.monthDays} height={230} />
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
            </CardSection>

            {/* The pace tiles, as the card's footer row. Net with people was a
                card of its own as well as a tile here; its detail folds into
                the tile so the figure is on screen once. */}
            <CardStrip pad="lg">
              <StatStrip
                bare
                items={[
                  { label: 'Today', minor: s?.todayMinor ?? 0, href: `/expenses?day=${todayISO()}` },
                  { label: 'This week', minor: s?.weekMinor ?? 0, href: `/expenses?week=${todayISO()}` },
                  {
                    label: 'Typical entry',
                    minor: f?.tickets.medianMinor ?? 0,
                    sub: f ? `${f.tickets.count} this month` : undefined,
                    href: '/analytics/month?tab=sizes',
                  },
                  {
                    label: 'Net with people',
                    minor: Math.abs(net),
                    tone: net === 0 ? undefined : net > 0 ? 'var(--credit)' : 'var(--rule-red)',
                    sub: peers.data
                      ? `${net === 0 ? 'all settled' : net > 0 ? 'owed to you' : 'you owe'} · ${
                          peers.data.balances.length
                        } contacts`
                      : net === 0
                        ? 'all settled'
                        : net > 0
                          ? 'owed to you'
                          : 'you owe',
                    extra:
                      peers.data && (peers.data.owedToMeMinor > 0 || peers.data.owedByMeMinor > 0) ? (
                        <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 mt-1">
                          <span className="text-[11px] whitespace-nowrap">
                            <span className="muted">You are owed </span>
                            <span className="num font-semibold" style={{ color: 'var(--credit)' }}>
                              {formatINR(peers.data.owedToMeMinor)}
                            </span>
                          </span>
                          <Link
                            href="/people"
                            className="micro micro-link shrink-0"
                            style={{ color: 'var(--accent)' }}
                          >
                            Settle →
                          </Link>
                        </div>
                      ) : undefined,
                  },
                ]}
              />
            </CardStrip>
          </div>
        </Card>

        <div className="space-y-5 min-w-0 self-start">
        {/* What the saving is for. One goal gets the card; several get the strip. */}
        {goalCount === 1 ? (
          <ActiveGoalCard fund={funds.data!.items[0]} onAdd={() => openAdd()} editable />
        ) : goalCount > 1 ? (
          <GoalsStrip funds={funds.data!.items} />
        ) : null}

        {/* Spend by category, as proportional area. The donut lives on This
            month, where a precise reading is wanted; here the only question
            is which one is the big one. */}
        {(catStats.data?.items.length ?? 0) > 0 && (
          <div>
            <SectionHead
              label="Spend by category"
              action={
                <Link href="/analytics/month" className="micro micro-link" style={{ color: 'var(--accent)' }}>
                  Break it down
                </Link>
              }
            />
            <Card className="!p-5">
              <CategoryBubbles
                data={catStats.data!.items.map((c) => ({
                  name: c.name,
                  totalMinor: c.totalMinor,
                  color: c.color,
                }))}
                size={230}
              />
              <ul className="grid grid-cols-2 gap-x-4 gap-y-2 mt-4">
                {catStats.data!.items.slice(0, 6).map((c) => (
                  <li key={c.categoryId} className="flex items-baseline justify-between gap-2 min-w-0">
                    <span className="inline-flex items-center gap-1.5 min-w-0">
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: c.color }}
                        aria-hidden
                      />
                      <span className="text-[11.5px] truncate">{c.name}</span>
                      <span className="num text-[11px] muted shrink-0">{Math.round(c.share * 100)}%</span>
                    </span>
                    <span className="num text-[11.5px] font-semibold shrink-0">{formatINR(c.totalMinor)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        )}

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
                  /* A row that was not here a moment ago — one you just
                     added — washes once, so the eye finds it. */
                  <div key={`${t.kind}-${t.id}`} className={freshRows.has(`${t.kind}-${t.id}`) ? 'wash' : undefined}>
                    <TransactionRow tx={t} showDate />
                  </div>
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
            <CountMoney
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
