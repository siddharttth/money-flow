'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { currentMonth, dayLabel, monthLabel, shiftMonth } from '@/lib/dates';
import { formatINR } from '@/lib/money';
import type { InvestmentSummary } from '@/lib/investments';
import type { Fund } from '@/lib/funds';
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
  StatStrip,
} from '@/components/ui';
import { MonthPicker } from '@/components/month-picker';
import { MonthBars, ShareBar } from '@/components/graph';
import { BreakdownList } from '@/components/breakdown';
import { CategoryIcon } from '@/components/icons';
import { useShell } from '@/components/app-shell';
import { useInspector } from '@/components/inspector';
import { FundCard } from '@/components/plan-cards';

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
  const { openAdd } = useShell();
  const { openCategory } = useInspector();

  const { data, error, mutate } = useSWR<InvestmentSummary>(`/api/analytics/investments?month=${month}`);
  const funds = useSWR<{ items: Fund[] }>(`/api/funds?month=${month}`);

  if (error) return <ErrorState message={error.message} onRetry={() => mutate()} />;

  const monthName = monthLabel(month).split(' ')[0];
  const outgoings = data ? data.monthMinor + data.monthSpendingMinor : 0;
  const investedShare = outgoings > 0 ? (data?.monthMinor ?? 0) / outgoings : 0;
  const deltaPct =
    data && data.previousMonthMinor > 0
      ? ((data.monthMinor - data.previousMonthMinor) / data.previousMonthMinor) * 100
      : null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Investments"
        title={monthLabel(month)}
        actions={<MonthPicker month={month} onChange={setMonth} />}
      />

      <Card className="!p-5 sm:!p-6">
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
                  <p className="label mb-2">{monthName} · where the money went</p>
                  <ShareBar share={investedShare} color="var(--credit)" height={6} />
                  <div className="flex items-baseline justify-between gap-3 mt-2.5">
                    <span className="text-[12px]" style={{ color: 'var(--credit)' }}>
                      <span className="num font-semibold">{Math.round(investedShare * 100)}%</span> invested
                    </span>
                    <span className="muted text-[12px]">
                      <span className="num">{formatINR(data.monthSpendingMinor)}</span> spent
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="min-w-0">
              {data.byMonth.length >= 2 ? (
                <>
                  <p className="label mb-3">Contributions by month</p>
                  <MonthBars data={data.byMonth} activeMonth={month} onPick={setMonth} height={150} />
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
              href={funds.data?.items.length ? '/settings' : '/settings?add=investment'}
              className="micro micro-link"
              style={{ color: 'var(--accent)' }}
            >
              {funds.data?.items.length ? 'Manage' : 'New goal'}
            </Link>
          }
        />
        {funds.data?.items.length ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 items-start">
            {funds.data.items.map((f) => (
              <FundCard key={f.categoryId} fund={f} onAdd={() => openAdd()} />
            ))}
          </div>
        ) : (
          <Card>
            <EmptyState
              title="No goals yet"
              hint="A goal is an investment category with a target on it — a bike, an emergency buffer, a trip. Give one a target and this screen works out the monthly pace you need to land it on time."
              action={
                <Link href="/settings?add=investment" className="btn btn-primary">
                  Set a target
                </Link>
              }
            />
          </Card>
        )}
      </div>

      <StatStrip
        items={[
          { label: 'Lifetime', minor: data?.lifetimeMinor ?? 0 },
          {
            label: 'Monthly average',
            minor: data?.averageMonthMinor ?? 0,
            sub: data ? `over ${data.activeMonths} ${data.activeMonths === 1 ? 'month' : 'months'}` : undefined,
          },
          {
            label: 'Contributions',
            value: String(data?.contributionCount ?? 0),
            sub: data?.firstDate ? `since ${dayLabel(data.firstDate)}` : undefined,
          },
          {
            label: 'Last month',
            minor: data?.previousMonthMinor ?? 0,
            sub: monthLabel(shiftMonth(month, -1)).split(' ')[0],
          },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <div>
          <SectionHead label="Where it is going" />
          <Card>
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

        <div>
          <SectionHead label="Every contribution" />
          <Card className="!p-0 overflow-clip">
            {!data ? (
              <div className="p-4">
                <ListSkeleton rows={5} />
              </div>
            ) : data.recent.length ? (
              <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {data.recent.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 px-3.5 sm:px-4 py-3">
                    <CategoryIcon icon={e.category.icon} color={e.category.color} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-semibold truncate">{e.note || e.category.name}</p>
                      <p className="micro mt-0.5">
                        {dayLabel(e.date)}
                        {e.note ? ` · ${e.category.name}` : ''}
                      </p>
                    </div>
                    <Money minor={e.amountMinor} className="text-[13.5px] font-semibold shrink-0" />
                  </li>
                ))}
              </ul>
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
