'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { currentMonth, dayLabel, monthLabel, shiftMonth } from '@/lib/dates';
import { formatINR } from '@/lib/money';
import { api } from '@/lib/client';
import type { Expense } from '@/lib/types';
import type { InvestmentSummary } from '@/lib/investments';
import type { Fund } from '@/lib/funds';
import {
  Card,
  CardStrip,
  Delta,
  EmptyState,
  ErrorState,
  HeroFigure,
  Insight,
  ListSkeleton,
  Money,
  PageHeader,
  SectionHead,
  StatStrip,
} from '@/components/ui';
import { MonthPicker } from '@/components/month-picker';
import { MonthBars, ShareBar } from '@/components/graph';
import { BreakdownList } from '@/components/breakdown';
import { CategoryIcon } from '@/components/icons';
import { useShell } from '@/components/app-shell';
import { useInspector } from '@/components/inspector';
import { FundCard, GoalsRollup } from '@/components/plan-cards';
import { Collapse, useGrowClass } from '@/components/motion';

/**
 * Where the money that is not spending goes.
 *
 * Everything on this screen is the same expense rows the rest of the app
 * reads, filtered to categories marked as investments — which is why nothing
 * here needed a new table and why re-marking a category moves its whole
 * history across in one step.
 *
 * It reports contributions, not returns. The app has no price data, and a
 * made-up growth figure is the one number a ledger cannot afford to print.
 */
export default function InvestmentsPage() {
  const [month, setMonth] = useState(currentMonth());
  const [allContributions, setAllContributions] = useState(false);
  const grow = useGrowClass();
  const { openAdd, toast } = useShell();
  const { openCategory } = useInspector();

  const { data, error, mutate } = useSWR<InvestmentSummary>(`/api/analytics/investments?month=${month}`);
  const funds = useSWR<{ items: Fund[] }>(`/api/funds?month=${month}`);

  if (error) return <ErrorState message={error.message} onRetry={() => mutate()} />;

  const monthName = monthLabel(month).split(' ')[0];
  const folds = (data?.recent.length ?? 0) > RECENT + 2;
  /* A contribution recorded wrong is fixed where it is seen: the row opens
     the same edit sheet the ledger uses, with the whole entry loaded. */
  async function editContribution(id: string) {
    try {
      openAdd(await api.get<Expense>(`/api/expenses/${id}`));
    } catch {
      toast('Could not open that entry', 'error');
    }
  }

  const renderContribution = (e: InvestmentSummary['recent'][number]) => (
    <li key={e.id}>
      <button
        type="button"
        className="group row w-full text-left flex items-center gap-3 px-3.5 sm:px-4 py-3"
        onClick={() => editContribution(e.id)}
        aria-label={`Edit ${e.note || e.category.name}, ${formatINR(e.amountMinor)}`}
      >
        <CategoryIcon icon={e.category.icon} color={e.category.color} size={32} />
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold truncate">{e.note || e.category.name}</p>
          <p className="micro mt-0.5">
            {dayLabel(e.date)}
            {e.note ? ` · ${e.category.name}` : ''}
          </p>
        </div>
        <span className="reveal tag shrink-0" aria-hidden>
          Edit
        </span>
        <Money minor={e.amountMinor} className="text-[13.5px] font-semibold shrink-0" />
      </button>
    </li>
  );
  const outgoings = data ? data.monthMinor + data.monthSpendingMinor : 0;
  const investedShare = outgoings > 0 ? (data?.monthMinor ?? 0) / outgoings : 0;
  const deltaPct =
    data && data.previousMonthMinor > 0
      ? ((data.monthMinor - data.previousMonthMinor) / data.previousMonthMinor) * 100
      : null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Goals & investing"
        title={monthLabel(month)}
        actions={<MonthPicker month={month} onChange={setMonth} />}
      />

      {/*
        EVERYTHING TOGETHER, FIRST.
        The old page told you about each goal and each category and never once
        about the whole plan — whether the sum of what you have promised
        yourself is a thing a month can actually carry.
      */}
      <Card className="!p-5 sm:!p-6 glow-card bloom-lg bloom-credit">
        <div className="relative">
        {/* The whole plan as one summary band. It used to be a card of its own
            above this one, in the page's largest type; the figure this card
            is about is what went in this month, so the plan steps down to a
            caption and the hero keeps the one large number. */}
        {funds.data?.items.length ? (
          <div className="mb-5 pb-5 border-b" style={{ borderColor: 'var(--border)' }}>
            <GoalsRollup compact funds={funds.data.items} />
          </div>
        ) : null}

        {data ? (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] gap-6 lg:gap-8 items-start">
            <div>
              <HeroFigure
                label={`Put in during ${monthName}`}
                minor={data.monthMinor}
                /* Up is good here, which is the opposite of every other Delta
                   in the app — hence `invert`. */
                delta={<Delta pct={deltaPct} invert />}
                note={
                  data.lifetimeMinor > 0 ? (
                    <>
                      <span className="num">{formatINR(data.lifetimeMinor)}</span> in total
                      {data.firstDate && ` since ${dayLabel(data.firstDate)}`}
                    </>
                  ) : (
                    'Nothing contributed yet.'
                  )
                }
              />

              {outgoings > 0 && (
                <div className="mt-5 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                  <p className="label mb-2.5">{monthName} · where the money went</p>
                  {/* Both halves named. "26% invested" alone leaves the reader
                      to work out what the other 74% was. */}
                  <div className="flex items-baseline justify-between gap-3 mb-2 text-[12px]">
                    <span style={{ color: 'var(--credit)' }}>
                      <span className="num font-semibold">{Math.round(investedShare * 100)}%</span> invested (
                      <span className="num">{formatINR(data.monthMinor)}</span>)
                    </span>
                    <span className="muted">
                      <span className="num font-semibold">{Math.round((1 - investedShare) * 100)}%</span> spent (
                      <span className="num">{formatINR(data.monthSpendingMinor)}</span>)
                    </span>
                  </div>
                  <div className="flex h-1.5 rounded-full overflow-hidden gap-0.5" style={{ background: 'var(--surface-2)' }}>
                    <span className={grow} style={{ width: `${investedShare * 100}%`, background: 'var(--credit)' }} />
                    <span className={grow} style={{ width: `${(1 - investedShare) * 100}%`, background: 'var(--text-muted)' }} />
                  </div>
                  <div className="flex items-baseline justify-between gap-3 mt-2">
                    <span className="micro">Inflow allocation</span>
                    <span className="micro">Month to date</span>
                  </div>
                </div>
              )}
            </div>

            <div className="min-w-0">
              {data.byMonth.length >= 2 ? (
                <>
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div>
                      <h3 className="text-[15px] font-semibold">Contributions by month</h3>
                      <p className="muted text-[12px] mt-0.5">How fast capital is going in</p>
                    </div>
                    <span className="badge badge-good">Monthly run</span>
                  </div>
                  <MonthBars
                    detailed
                    data={data.byMonth}
                    activeMonth={month}
                    onPick={setMonth}
                    height={160}
                    averageLabel={`Avg ${formatINR(data.averageMonthMinor)}`}
                  />
                  {data.previousMonthMinor > 0 && (
                    /* Stacked on a phone: side by side, both captions wrapped
                       to two lines each. */
                    <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 sm:gap-3 mt-4">
                      <span
                        className="text-[12px]"
                        style={{
                          color:
                            data.monthMinor >= data.previousMonthMinor ? 'var(--credit)' : 'var(--text-muted)',
                        }}
                      >
                        {data.monthMinor >= data.previousMonthMinor ? '↗' : '↘'}{' '}
                        {Math.abs(
                          Math.round(
                            ((data.monthMinor - data.previousMonthMinor) / data.previousMonthMinor) * 100,
                          ),
                        )}
                        % {data.monthMinor >= data.previousMonthMinor ? 'acceleration' : 'slowdown'} vs last month
                      </span>
                      <span className="micro">
                        Average {formatINR(data.averageMonthMinor)}/mo
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <EmptyState
                  title="Not enough history to chart"
                  hint="Two months of contributions draws the first comparison."
                  action={
                    <button className="btn btn-primary" onClick={() => openAdd()}>
                      Record a contribution
                    </button>
                  }
                />
              )}
            </div>
          </div>
        ) : (
          <ListSkeleton rows={5} />
        )}

        {/* The four running tallies behind the figure, as the card's footer. */}
        <CardStrip pad="lg">
              <StatStrip
                bare
                items={[
                  {
                    label: 'Lifetime capital',
                    minor: data?.lifetimeMinor ?? 0,
                    sub: 'total deposits',
                    meter: 1,
                    meterTone: 'var(--accent)',
                  },
                  {
                    label: 'Monthly average',
                    minor: data?.averageMonthMinor ?? 0,
                    sub: data ? `over ${data.activeMonths} active ${data.activeMonths === 1 ? 'month' : 'months'}` : undefined,
                    meter:
                      data && data.lifetimeMinor > 0 ? data.averageMonthMinor / data.lifetimeMinor : undefined,
                    meterTone: 'var(--credit)',
                  },
                  {
                    label: 'Contributions',
                    value: `${data?.contributionCount ?? 0} deposits`,
                    sub: data?.firstDate ? `since ${dayLabel(data.firstDate)}` : undefined,
                    meter: data && data.contributionCount > 0 ? Math.min(1, data.contributionCount / 12) : undefined,
                  },
                  {
                    label: 'Last month',
                    minor: data?.previousMonthMinor ?? 0,
                    sub: `closed in ${monthLabel(shiftMonth(month, -1))}`,
                    meter:
                      data && data.monthMinor > 0 && data.previousMonthMinor > 0
                        ? Math.min(1, data.previousMonthMinor / Math.max(data.monthMinor, data.previousMonthMinor))
                        : undefined,
                    meterTone: 'var(--text-muted)',
                    /* The month it describes, one tap away. */
                    onClick: () => setMonth(shiftMonth(month, -1)),
                  },
                ]}
              />
        </CardStrip>
        </div>
      </Card>

      {/*
        Funds first. An investment category with a target is a goal, and a goal
        with a date on it is the only thing on this screen that can be off
        track — which makes it the thing worth seeing before any total.
      */}
      <div>
        <SectionHead
          label="Goals"
          action={
            <Link
              href={funds.data?.items.length ? '/settings' : '/settings?add=goal'}
              className="micro micro-link"
              style={{ color: 'var(--accent)' }}
            >
              {funds.data?.items.length ? 'Manage' : 'New goal'}
            </Link>
          }
        />
        {funds.data?.items.length ? (
          /*
            Laid out by how many there are. A fixed two-up grid left one goal
            with half a row of nothing beside it, and a third goal alone on
            its row. One goal takes the row (and turns itself into two
            columns); a multiple of three goes three-up where there is room;
            an odd one out spans the row rather than sitting beside a hole.
          */
          <div className={`grid grid-cols-1 gap-5 ${goalCols(funds.data.items.length)}`}>
            {funds.data.items.map((f, i) => (
              <div key={f.categoryId} className={`grid ${goalSpan(i, funds.data!.items.length)}`}>
                <FundCard fund={f} onAdd={() => openAdd()} month={month} settled={!funds.isValidating} />
              </div>
            ))}
          </div>
        ) : (
          <Card>
            <EmptyState
              title="No goals yet"
              hint="A goal is an investment category with a target on it — a bike, an emergency buffer, a trip. Give one a target and this screen works out the monthly pace you need to land it on time."
              action={
                <Link href="/settings?add=goal" className="btn btn-primary">
                  Set a target
                </Link>
              }
            />
          </Card>
        )}
      </div>


      {/* Two cards the same height, each section heading above its own. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="flex flex-col">
          <SectionHead label="Where it is going" />
          <Card className="flex-1">
            {!data ? (
              <ListSkeleton rows={4} />
            ) : data.byCategory.length ? (
              <>
                <BreakdownList
                  items={data.byCategory.map((c) => ({
                    id: c.categoryId,
                    name: c.name,
                    color: c.color,
                    icon: c.icon,
                    totalMinor: c.totalMinor,
                    count: c.count,
                  }))}
                  onPick={openCategory}
                />
                <p className="muted text-[12px] mt-4 leading-relaxed">
                  Lifetime totals per investment category. A category becomes one of these by being marked{' '}
                  <strong>Investment</strong> in Settings — nothing else changes, and its whole history moves with it.
                </p>
              </>
            ) : funds.data?.items.length ? (
              /* A goal already exists — telling this person to go and create an
                 investment category is telling them to do what they just did.
                 What is actually missing is a contribution. */
              <EmptyState
                title="Nothing contributed yet"
                hint="Put something into a goal and this is where the running totals appear, one line per category."
                action={
                  <button className="btn btn-ghost" onClick={() => openAdd()}>
                    Record a contribution
                  </button>
                }
              />
            ) : (
              <EmptyState
                title="No investment categories yet"
                hint="Mark a category as an Investment in Settings and anything filed under it lands here instead of in your spending."
                action={
                  <Link href="/settings" className="btn btn-ghost">
                    Open Settings
                  </Link>
                }
              />
            )}
          </Card>
        </div>

        <div className="flex flex-col">
          <SectionHead label="Every contribution" />
          <Card className="!p-0 overflow-clip flex-1">
            {!data ? (
              <div className="p-4">
                <ListSkeleton rows={5} />
              </div>
            ) : data.recent.length ? (
              <>
                {/* The latest few, the rest a tap away and sliding open. The
                    list is fifty deep and grows with every deposit; beside a
                    two-line breakdown it was a column of empty page. */}
                <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
                  {(folds ? data.recent.slice(0, RECENT) : data.recent).map(renderContribution)}
                </ul>
                {folds && (
                  <Collapse open={allContributions}>
                    <ul className="divide-y border-t" style={{ borderColor: 'var(--border)' }}>
                      {data.recent.slice(RECENT).map(renderContribution)}
                    </ul>
                  </Collapse>
                )}
                {folds && (
                  <button
                    type="button"
                    className="row w-full text-left px-3.5 sm:px-4 py-3 border-t micro"
                    style={{ borderColor: 'var(--border)', color: 'var(--accent)' }}
                    aria-expanded={allContributions}
                    onClick={() => setAllContributions((v) => !v)}
                  >
                    {allContributions ? 'Show fewer' : `Show ${data.recent.length - RECENT} more`}
                  </button>
                )}
              </>
            ) : (
              <EmptyState
                title="Nothing recorded"
                hint="Add a transaction under an investment category and it appears here."
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

      {data && data.lifetimeMinor > 0 && (
        <Insight>
          None of this counts as spending anywhere in the app. Money into an investment left your current account but
          not your net worth — the same reason a loan is kept separate. This screen reports what you put in, not what
          it is worth today.
        </Insight>
      )}
    </div>
  );
}

/**
 * How many contributions show before "Show more". The list only folds when
 * that hides at least three — a button to reveal one row is a row with extra
 * steps.
 */
const RECENT = 6;

function goalCols(n: number): string {
  if (n <= 1) return '';
  return n % 3 === 0 ? 'sm:grid-cols-2 xl:grid-cols-3' : 'sm:grid-cols-2';
}

/** The odd card out spans the row — only at the widths where it would be odd. */
function goalSpan(i: number, n: number): string {
  if (n <= 1 || i !== n - 1 || n % 2 === 0) return '';
  return n % 3 === 0 ? 'sm:col-span-2 xl:col-span-1' : 'sm:col-span-2';
}
