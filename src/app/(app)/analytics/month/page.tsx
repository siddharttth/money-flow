'use client';

import { Suspense, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { qs } from '@/lib/client';
import { currentMonth, dayLabel, monthLabel, monthRange, todayISO } from '@/lib/dates';
import { formatINR } from '@/lib/money';
import type { Category, CategoryStat, Expense, ExpenseList, Person, PersonStat, Summary } from '@/lib/types';
import type { Flow } from '@/lib/flow';
import type { InvestmentSummary } from '@/lib/investments';
import {
  Card,
  Delta,
  EmptyState,
  HeroFigure,
  Insight,
  ListSkeleton,
  Modal,
  Money,
  PageHeader,
  SectionHead,
  StatStrip,
} from '@/components/ui';
import { MonthPicker } from '@/components/month-picker';
import { InsightsTabs } from '@/components/insights-tabs';
import { DayBars, DeltaBar, Donut, FlowCurve, SegmentLegend, ShareBar, WeekdayBars } from '@/components/graph';
import { BreakdownList } from '@/components/breakdown';
import { useShell } from '@/components/app-shell';
import { useInspector } from '@/components/inspector';
import { CategoryIcon } from '@/components/icons';

export default function AnalyticsPage() {
  return (
    <Suspense
      fallback={
        <Card>
          <ListSkeleton rows={6} />
        </Card>
      }
    >
      <AnalyticsInner />
    </Suspense>
  );
}

/**
 * Everything the month can be asked, in the order the questions occur:
 * how much and how fast, when, on what, with whom, and how that compares to
 * the months behind it. Every figure here is derived from the same expense
 * rows — nothing is stored, and the person dimension is kept out of the flow
 * arithmetic so it can never inflate a total.
 */
function AnalyticsInner() {
  const search = useSearchParams();
  const [month, setMonth] = useState(search.get('month') ?? currentMonth());
  const [personIds, setPersonIds] = useState<string[]>([]);
  const [drill, setDrill] = useState<CategoryStat | null>(null);
  const { openPerson, openCategory } = useInspector();

  const { start, end } = monthRange(month);
  const people = useSWR<{ items: Person[] }>('/api/people');
  const summary = useSWR<Summary>(`/api/analytics/summary?month=${month}`);
  const flow = useSWR<Flow>(`/api/analytics/flow?month=${month}`);
  const cats = useSWR<{ items: CategoryStat[]; grandTotalMinor: number }>(
    `/api/analytics/categories${qs({ month, personIds })}`,
  );
  const ppl = useSWR<{ people: PersonStat[]; unassignedMinor: number; grandTotalMinor: number }>(
    `/api/analytics/people?month=${month}`,
  );
  const daily = useSWR<{ items: { date: string; totalMinor: number }[] }>(
    `/api/analytics/daily${qs({ month, personIds })}`,
  );
  const invest = useSWR<InvestmentSummary>(`/api/analytics/investments?month=${month}`);

  const s = summary.data;
  const f = flow.data;
  const filtered = personIds.length > 0;

  return (
    <div className="space-y-6">
      <div className="lg:hidden">
        <InsightsTabs />
      </div>

      <PageHeader
        eyebrow="This month"
        title={monthLabel(month)}
        actions={<MonthPicker month={month} onChange={setMonth} />}
      />

      {/* ---------- The month, and its pace ---------- */}
      <Card className="!p-5 sm:!p-6">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] gap-6 lg:gap-8 items-start">
          <div>
            {f ? (
              <>
                {/* Icon tile and a two-line label, as the reference heads its
                    hero — "Total spent" alone does not say which direction the
                    money went. */}
                <div className="flex items-start justify-between gap-3 mb-4">
                  <span className="flex items-center gap-2.5">
                    {/* Flat, not lit. The reference spends its glow on the
                        goal ring and the primary pill — a label tile is
                        furniture, and lighting it competes with the figure. */}
                    <span className="icon-tile" style={{ color: 'var(--accent)' }}>
                      <span className="text-[17px] font-bold">₹</span>
                    </span>
                    <span className="min-w-0">
                      <span className="micro block whitespace-nowrap">Net outflow</span>
                      <span className="text-[14px] font-semibold whitespace-nowrap">Total spent</span>
                    </span>
                  </span>
                  <Delta pct={f.pace.deltaPct} suffix="vs last month" />
                </div>

                <p className="flex items-baseline gap-2">
                  <span className="num text-[2.4rem] sm:text-[2.7rem] font-bold leading-none tracking-tight">
                    {formatINR(f.pace.spentMinor)}
                  </span>
                  <span className="micro">INR</span>
                </p>

                <p className="muted text-[12.5px] mt-2.5 flex items-center gap-1.5">
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: 'var(--accent)' }}
                    aria-hidden
                  />
                  <span className="num">{f.tickets.count}</span> transactions recorded ·{' '}
                  <span className="num">{formatINR(f.pace.perDayMinor)}</span> a day
                </p>
                {/*
                  Four figures in wells, each with the one line that makes it
                  mean something. A bare dl of four amounts made the reader
                  work out for themselves whether ₹20,764 was good news.
                */}
                <div className="grid grid-cols-2 gap-3 mt-5 rounded-xl p-3" style={{ background: 'var(--surface-2)' }}>
                  <SubStat
                    label={f.isCurrentMonth ? 'Last month by today' : 'The month before'}
                    value={formatINR(f.pace.prevSameDayMinor)}
                    note={
                      f.pace.deltaPct == null
                        ? 'nothing to compare'
                        : `${f.pace.spentMinor >= f.pace.prevSameDayMinor ? '+' : '−'}${formatINR(
                            Math.abs(f.pace.spentMinor - f.pace.prevSameDayMinor),
                          )} ${f.pace.spentMinor >= f.pace.prevSameDayMinor ? 'faster' : 'slower'} pace`
                    }
                    tone={
                      f.pace.deltaPct == null
                        ? undefined
                        : f.pace.spentMinor >= f.pace.prevSameDayMinor
                          ? 'var(--rule-red)'
                          : 'var(--credit)'
                    }
                  />
                  {f.isCurrentMonth && (
                    <SubStat
                      label="Projected month end"
                      value={formatINR(f.pace.projectedMinor)}
                      note={
                        f.pace.projectedMinor > f.pace.prevFullMinor && f.pace.prevFullMinor > 0
                          ? 'above last month'
                          : 'at the current rate'
                      }
                      tone={
                        f.pace.projectedMinor > f.pace.prevFullMinor && f.pace.prevFullMinor > 0
                          ? 'var(--rule-red)'
                          : undefined
                      }
                    />
                  )}
                  <SubStat
                    label={`First half (1–${Math.ceil(f.pace.monthDays / 2)})`}
                    value={formatINR(f.halves.firstMinor)}
                    note={
                      f.pace.spentMinor > 0
                        ? `${Math.round((f.halves.firstMinor / f.pace.spentMinor) * 100)}% of total spend`
                        : undefined
                    }
                  />
                  <SubStat
                    label={`Second half (${Math.ceil(f.pace.monthDays / 2) + 1}–${f.pace.monthDays})`}
                    value={formatINR(f.halves.secondMinor)}
                    note={
                      f.halves.secondMinor === 0 && f.isCurrentMonth
                        ? 'not reached yet'
                        : f.halves.secondMinor < f.halves.firstMinor
                          ? 'pace slowed down'
                          : 'pace picked up'
                    }
                    tone={
                      f.halves.secondMinor === 0 && f.isCurrentMonth
                        ? undefined
                        : f.halves.secondMinor < f.halves.firstMinor
                          ? 'var(--credit)'
                          : 'var(--rule-red)'
                    }
                  />
                </div>
              </>
            ) : (
              <ListSkeleton rows={4} />
            )}
          </div>

          <div className="min-w-0">
            {f && f.cumulative.length >= 2 ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                  <div>
                    <span className="flex items-center gap-2">
                      <h3 className="text-[15px] font-semibold">Flow curve</h3>
                      <span className="badge badge-neutral">Cumulative</span>
                    </span>
                    <p className="muted text-[12px] mt-0.5">
                      This month&rsquo;s trajectory against the last
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-[11px]">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-4 h-[3px] rounded" style={{ background: 'var(--accent)' }} />
                      {monthLabel(month).split(' ')[0]}{' '}
                      <span className="num muted">
                        ({formatINR(f.pace.spentMinor, { compact: true })})
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 muted">
                      <span
                        className="w-4 h-[3px] rounded"
                        style={{
                          background:
                            'repeating-linear-gradient(90deg, var(--text-muted) 0 3px, transparent 3px 6px)',
                        }}
                      />
                      Last{' '}
                      <span className="num">({formatINR(f.pace.prevFullMinor, { compact: true })})</span>
                    </span>
                  </div>
                </div>
                <FlowCurve dated points={f.cumulative} monthDays={f.pace.monthDays} height={210} />
                <p className="muted text-[12px] mt-3 leading-relaxed">
                  Solid is this month, dashed is last month at the same point. Where the solid line pulls above the
                  dashed one is where the extra money went.
                </p>
              </>
            ) : (
              <EmptyState title="Not enough data yet" hint="Two days of spending draws the first curve." />
            )}
          </div>
        </div>
      </Card>

      {/* ---------- Headline figures ---------- */}
      <StatStrip
        split
        items={[
          {
            label: 'Daily average',
            minor: f?.pace.perDayMinor ?? 0,
            sub: f ? `calculated over ${f.pace.elapsedDays} active days` : undefined,
            icon: <StatMark>≡</StatMark>,
          },
          {
            label: 'Vs last month',
            value: s?.changePct != null ? `${s.changePct > 0 ? '+' : ''}${s.changePct.toFixed(1)}%` : '—',
            sub: s ? `${monthLabel(s.previousMonth.month).split(' ')[0]}: ${formatINR(s.previousMonth.totalMinor)}` : undefined,
            tone: s?.changePct == null ? undefined : s.changePct > 0 ? 'var(--rule-red)' : 'var(--credit)',
            icon: <StatMark>↗</StatMark>,
          },
          {
            label: 'Biggest day',
            minor: f?.cadence.busiest?.totalMinor ?? 0,
            sub: f?.cadence.busiest ? dayLabel(f.cadence.busiest.date) : undefined,
            meter:
              f && f.pace.spentMinor > 0 && f.cadence.busiest
                ? f.cadence.busiest.totalMinor / f.pace.spentMinor
                : undefined,
            meterTone: 'var(--hi)',
            icon: <StatMark>◎</StatMark>,
          },
          {
            label: 'Typical entry',
            minor: f?.tickets.medianMinor ?? 0,
            sub: f ? `median of ${f.tickets.count} · mean ${formatINR(f.tickets.averageMinor)}` : undefined,
            icon: <StatMark>◨</StatMark>,
          },
        ]}
      />

      {/*
        ---------- Budgets ----------
        Moved here from Settings. Setting a limit is configuration; watching a
        bar fill against it is the most actionable thing a month has to say,
        and it was three taps deep on a screen nobody opens except to change
        something.
      */}
      <BudgetSection month={month} />

      {/* ---------- Rhythm ---------- */}
      <div>
        <SectionHead label="Rhythm" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          <Card>
            <h3 className="text-[15px] font-semibold mb-1">What a weekday costs</h3>
            {/* The denominator is every Thursday that has happened, not the
                Thursdays you spent on — see the note in flow.ts. The caption
                described the old, wrong one. */}
            <p className="muted text-[12px] mb-4">
              Total on each weekday, divided by how many of them have happened this month.
            </p>
            {f && f.weekday.some((w) => w.avgMinor > 0) ? (
              <>
                <PeakWeekday flow={f} lead />
                <WeekdayBars data={f.weekday} />
              </>
            ) : (
              <EmptyState title="No spending to place yet" />
            )}
          </Card>

          <Card>
            <h3 className="text-[15px] font-semibold mb-1">Day by day</h3>
            <p className="muted text-[12px] mb-4">
              Each bar is one calendar day; the gold one is the heaviest.
            </p>
            {f && daily.data?.items.length ? (
              <>
                <DayBars data={daily.data.items} monthDays={f.pace.monthDays} height={104} />
                <div className="grid grid-cols-3 gap-3 mt-5 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                  <Mini label="Days spent" value={String(f.cadence.spendDays)} />
                  <Mini label="Quiet days" value={String(f.cadence.quietDays)} />
                  <Mini label="Longest quiet run" value={`${f.cadence.longestQuietRun}d`} />
                </div>
              </>
            ) : (
              <EmptyState title="Nothing logged this month" />
            )}
          </Card>
        </div>
      </div>

      {/* ---------- Where it went ---------- */}
      <div>
        <SectionHead
          label="Where it went"
          action={
            filtered ? (
              <button className="tag" onClick={() => setPersonIds([])}>
                Clear person filter ×
              </button>
            ) : undefined
          }
        />

        {/* The person filter reshapes the category view — the one place where
            crossing the two dimensions is a question worth asking. */}
        <div className="scroll-x flex gap-2 pb-2 mb-3 -mx-1 px-1">
          <button className="chip shrink-0" data-selected={!filtered} onClick={() => setPersonIds([])}>
            Everyone
          </button>
          {people.data?.items.map((p) => (
            <button
              key={p.id}
              className="chip shrink-0"
              data-selected={personIds.includes(p.id)}
              onClick={() => setPersonIds((x) => (x.includes(p.id) ? x.filter((y) => y !== p.id) : [...x, p.id]))}
            >
              {p.name}
            </button>
          ))}
          <button
            className="chip shrink-0"
            data-selected={personIds.includes('none')}
            onClick={() =>
              setPersonIds((x) => (x.includes('none') ? x.filter((y) => y !== 'none') : [...x, 'none']))
            }
          >
            Nobody tagged
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          <Card>
            {!cats.data ? (
              <ListSkeleton rows={5} />
            ) : cats.data?.items.length ? (
              <>
                <div className="flex items-start justify-between gap-3 mb-5">
                  <div>
                    <h3 className="text-[15px] font-semibold">Where it went</h3>
                    <p className="muted text-[12px] mt-0.5">Category distribution breakdown</p>
                  </div>
                  <span className="micro shrink-0">
                    Top {Math.min(5, cats.data.items.length)} segments
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-5 sm:gap-7">
                  <Donut
                    ranked
                    data={cats.data.items.slice(0, 6).map((c) => ({
                      name: c.name,
                      totalMinor: c.totalMinor,
                      color: c.color,
                    }))}
                    size={160}
                    centreLabel={filtered ? 'Filtered' : '100%'}
                  />
                  <SegmentLegend
                    items={cats.data.items.slice(0, 5).map((c) => ({
                      id: c.categoryId,
                      name: c.name,
                      totalMinor: c.totalMinor,
                      share: c.share,
                    }))}
                    onPick={(id) => setDrill(cats.data!.items.find((c) => c.categoryId === id) ?? null)}
                  />
                </div>

                {f && !filtered && (
                  <div className="mt-5 pt-4 border-t space-y-3" style={{ borderColor: 'var(--border)' }}>
                    <Insight tone={f.concentration.top3Share > 0.8 ? 'warn' : undefined}>
                      Three categories carry{' '}
                      <span className="num">{Math.round(f.concentration.top3Share * 100)}%</span> of the month, spread
                      across <span className="num">{f.concentration.activeCategories}</span> in use.
                    </Insight>
                    <p className="muted text-[12px]">Tap a category to see the transactions behind it.</p>
                  </div>
                )}
              </>
            ) : (
              <EmptyState title="No data for this period" />
            )}
          </Card>

          {/*
            ---------- Momentum ----------
            Hidden in a first month. With nothing to compare against, every
            category is "NEW" and the card is a list of the same word seven
            times pretending to be an insight.
          */}
          {f && f.momentum.some((m) => !m.isNew) && (
          <Card>
            <h3 className="text-[15px] font-semibold mb-1">Heating up, cooling down</h3>
            <p className="muted text-[12px] mb-4">
              This month against the average of the three before it. Right of the line is more than usual.
            </p>
            {f?.momentum.length ? (
              <ul className="space-y-3">
                {f.momentum.slice(0, 7).map((m) => {
                  const max = Math.max(...f.momentum.map((x) => Math.abs(x.deltaMinor)), 1);
                  return (
                    <li key={m.categoryId}>
                      <button
                        className="w-full text-left group"
                        onClick={() => openCategory(m.categoryId)}
                      >
                        <div className="flex items-center gap-2.5">
                          <CategoryIcon icon={m.icon} color={m.color} size={22} />
                          <span className="text-[13px] font-medium truncate flex-1">{m.name}</span>
                          {m.isNew ? (
                            <span className="micro" style={{ color: 'var(--hi)' }}>
                              new
                            </span>
                          ) : (
                            <Delta pct={m.deltaPct} />
                          )}
                          <span
                            className="num text-[12px] font-semibold w-20 text-right"
                            style={{ color: m.deltaMinor > 0 ? 'var(--rule-red)' : 'var(--credit)' }}
                          >
                            {m.deltaMinor > 0 ? '+' : '−'}
                            {formatINR(Math.abs(m.deltaMinor))}
                          </span>
                        </div>
                        <div className="mt-1.5">
                          <DeltaBar value={m.deltaMinor} max={max} />
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState title="Nothing to compare yet" hint="Momentum needs a month or two of history." />
            )}
          </Card>
          )}
        </div>
      </div>

      {/* ---------- Ticket sizes ---------- */}
      {f && f.tickets.count > 0 && (
        <div>
          <SectionHead label="How the money leaves" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
            <Card>
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <p className="label mb-1.5">Typical entry</p>
                  <Money minor={f.tickets.medianMinor} className="text-2xl font-semibold" />
                  <p className="muted text-[11px] mt-1">the middle of {f.tickets.count} entries</p>
                </div>
                <div>
                  <p className="label mb-1.5">Largest single</p>
                  <Money minor={f.tickets.largest?.amountMinor ?? 0} className="text-2xl font-semibold" />
                  {f.tickets.largest && (
                    <p className="muted text-[11px] mt-1 truncate">
                      {f.tickets.largest.categoryName} · {dayLabel(f.tickets.largest.date)}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-5 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-baseline justify-between gap-3 mb-2">
                  <span className="label mb-0">
                    Under {formatINR(f.tickets.smallThresholdMinor)}
                  </span>
                  <span className="num text-[13px] font-semibold">
                    {formatINR(f.tickets.smallTotalMinor)}
                  </span>
                </div>
                <ShareBar
                  share={f.pace.spentMinor > 0 ? f.tickets.smallTotalMinor / f.pace.spentMinor : 0}
                  color="var(--hi)"
                  height={6}
                />
                <p className="muted text-[12px] mt-2.5 leading-relaxed">
                  <span className="num">{f.tickets.smallCount}</span> of{' '}
                  <span className="num">{f.tickets.count}</span> entries, and{' '}
                  <span className="num">
                    {f.pace.spentMinor > 0
                      ? Math.round((f.tickets.smallTotalMinor / f.pace.spentMinor) * 100)
                      : 0}
                    %
                  </span>{' '}
                  of the money.
                </p>
              </div>
            </Card>

            <Card>
              <h3 className="text-[15px] font-semibold mb-1">Things you bought more than once</h3>
              <p className="muted text-[12px] mb-4">Matched on the note, ignoring case.</p>
              {f.repeats.length ? (
                <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
                  {f.repeats.map((r) => (
                    <li key={r.label} className="flex items-baseline justify-between gap-3 py-2.5">
                      <span className="min-w-0">
                        <span className="text-[13px] font-medium capitalize block truncate">{r.label}</span>
                        <span className="micro">
                          {r.categoryName} · ×{r.count}
                        </span>
                      </span>
                      <Money minor={r.totalMinor} className="text-[13px] font-semibold shrink-0" />
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="No repeats this month" hint="Notes that appear twice or more show up here." />
              )}
            </Card>
          </div>
        </div>
      )}

      {/* ---------- Who it was with ---------- */}
      <div>
        <SectionHead label="Who it was with" />
        <Card>
          {!ppl.data ? (
            <ListSkeleton rows={5} />
          ) : ppl.data?.people.length ? (
            <>
              <BreakdownList
                items={ppl.data.people.map((p) => ({
                  id: p.personId,
                  name: p.name,
                  color: p.color,
                  totalMinor: p.totalMinor,
                  count: p.count,
                }))}
                onPick={openPerson}
              />
              {ppl.data.unassignedMinor > 0 && (
                <div
                  className="flex items-baseline justify-between gap-3 mt-3 pt-3 border-t"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <span className="text-[13px] muted">Nobody tagged</span>
                  <Money minor={ppl.data.unassignedMinor} className="text-[13px] font-semibold" />
                </div>
              )}
              <p className="muted text-[12px] mt-4 leading-relaxed">
                Each person's share of the same{' '}
                <span className="num">{formatINR(ppl.data.grandTotalMinor)}</span>. Category and person are two ways
                of slicing one month, and both partition it — a ₹75 dinner with three people puts ₹25 against each.
              </p>
            </>
          ) : (
            <EmptyState title="No people tagged yet" />
          )}
        </Card>
      </div>

      {/* ---------- Money that is not spending ---------- */}
      {(invest.data?.monthMinor ?? 0) > 0 && (
        <div>
          <SectionHead
            label="Investing, separately"
            action={
              <Link href="/investments" className="micro micro-link" style={{ color: 'var(--accent)' }}>
                Open
              </Link>
            }
          />
          <StatStrip
            cols={3}
            items={[
              { label: `Put in during ${monthLabel(month).split(' ')[0]}`, minor: invest.data!.monthMinor, tone: 'var(--credit)' },
              { label: 'Lifetime', minor: invest.data!.lifetimeMinor },
              {
                label: 'Share of outgoings',
                value: `${Math.round(
                  (invest.data!.monthMinor / Math.max(1, invest.data!.monthMinor + invest.data!.monthSpendingMinor)) *
                    100,
                )}%`,
                sub: 'of everything that left',
              },
            ]}
          />
          <p className="muted text-[12px] mt-3 leading-relaxed max-w-2xl">
            Excluded from every figure above. Money into an investment left the current account but not your net
            worth, so counting it as spending would make the pace, the projection and the month-over-month comparison
            all wrong.
          </p>
        </div>
      )}

      {f && f.ledger.entryCount > 0 && (
        <div>
          <SectionHead label="Lending, separately" />
          <StatStrip
            cols={3}
            items={[
              { label: 'Lent out', minor: f.ledger.lentMinor, tone: 'var(--rule-red)' },
              { label: 'Received', minor: f.ledger.borrowedMinor, tone: 'var(--credit)' },
              {
                label: 'Net movement',
                minor: Math.abs(f.ledger.netMinor),
                sub: f.ledger.netMinor >= 0 ? 'out of pocket' : 'into pocket',
              },
            ]}
          />
          <p className="muted text-[12px] mt-3 leading-relaxed max-w-2xl">
            None of this is counted as spending. Money lent is still yours, and money borrowed was never yours — mixing
            either into a month total is how a spreadsheet starts lying.
          </p>
        </div>
      )}

      {/* The long view moved to /analytics/lifetime — twelve months of bars and
          six months of savings rate were never month-scoped, and stranding them
          on a page with a month picker made the picker look broken. */}
      <div>
        <SectionHead label="The longer view" />
        <Card>
          <EmptyState
            title="Trends live on their own page"
            hint="Spending by month, what you keep, category totals and year-on-year — none of it changes with the month picker, so none of it belongs here."
            action={
              <Link href="/analytics/lifetime" className="btn btn-primary">
                Open Lifetime
              </Link>
            }
          />
        </Card>
      </div>

      <CategoryDrilldown
        category={drill}
        start={start}
        end={end}
        personIds={personIds}
        onClose={() => setDrill(null)}
      />
    </div>
  );
}


function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="label mb-1">{label}</p>
      <p className="num text-lg font-semibold">{value}</p>
    </div>
  );
}

/**
 * The one sentence the weekday chart is actually for — and, above the bars,
 * the same fact as a headline so the chart illustrates a claim rather than
 * asking the reader to find one.
 */
function PeakWeekday({ flow, lead = false }: { flow: Flow; lead?: boolean }) {
  const active = flow.weekday.filter((w) => w.avgMinor > 0);
  if (active.length < 2) return null;
  const peak = active.reduce((a, b) => (b.avgMinor > a.avgMinor ? b : a));
  const rest = active.filter((w) => w.label !== peak.label);
  const restAvg = Math.round(rest.reduce((s, w) => s + w.avgMinor, 0) / rest.length);
  if (restAvg <= 0) return null;

  if (lead) {
    return (
      <div
        className="flex items-center justify-between gap-3 rounded-lg px-3.5 py-3 mb-4"
        style={{ background: 'var(--surface-2)' }}
      >
        <span className="min-w-0">
          <span className="text-[13.5px] font-semibold block truncate">{FULL_DAY[peak.label]} peak</span>
          <span className="num text-[12px] muted">{formatINR(peak.avgMinor)} average spend</span>
        </span>
        <span className="text-right shrink-0">
          <span className="micro block">Other days</span>
          <span className="num text-[13px] font-semibold">{formatINR(restAvg)}</span>
        </span>
      </div>
    );
  }

  return (
    <div className="mt-5 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
      <Insight tone={peak.avgMinor > restAvg * 1.5 ? 'warn' : undefined}>
        A {FULL_DAY[peak.label]} costs <span className="num">{formatINR(peak.avgMinor)}</span> on average, against{' '}
        <span className="num">{formatINR(restAvg)}</span> on every other day.
      </Insight>
    </div>
  );
}

const FULL_DAY: Record<string, string> = {
  Sun: 'Sunday',
  Mon: 'Monday',
  Tue: 'Tuesday',
  Wed: 'Wednesday',
  Thu: 'Thursday',
  Fri: 'Friday',
  Sat: 'Saturday',
};

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
    category
      ? `/api/expenses${qs({ start, end, categoryIds: [category.categoryId], personIds, limit: 200 })}`
      : null,
  );

  return (
    <Modal open={!!category} onClose={onClose} title={category ? category.name : ''} wide>
      {category && (
        <>
          <div className="mb-5">
            <Money minor={category.totalMinor} className="text-3xl font-semibold" />
            <p className="muted text-[13px] mt-1">
              {category.count} {category.count === 1 ? 'transaction' : 'transactions'} ·{' '}
              {Math.round(category.share * 100)}% of the month
            </p>
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
                  <span className="num muted text-[11px] w-14 shrink-0">{dayLabel(e.expenseDate)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="text-[13px] block truncate">
                      {e.note || e.people.map((p) => p.name).join(', ') || 'No note'}
                    </span>
                    {e.note && e.people.length > 0 && (
                      <span className="micro">{e.people.map((p) => p.name).join(', ')}</span>
                    )}
                  </span>
                  <Money minor={e.amountMinor} className="text-[13px] font-semibold shrink-0" />
                </button>
              ))}
            </div>
          ) : (
            <EmptyState title="No transactions" />
          )}
        </>
      )}
    </Modal>
  );
}

/**
 * Every budgeted category against its limit, with the pace marker showing
 * where an even burn would put you today.
 *
 * Hidden entirely when nothing has a budget — an empty budgets section on a
 * page this long is just another thing to scroll past.
 */
function BudgetSection({ month }: { month: string }) {
  const { openCategory } = useInspector();
  const cats = useSWR<{ items: Category[] }>('/api/categories');
  const stats = useSWR<{ items: CategoryStat[] }>(`/api/analytics/categories?month=${month}`);

  const statById = new Map((stats.data?.items ?? []).map((c) => [c.categoryId, c]));
  const budgeted = (cats.data?.items ?? [])
    .filter((c) => c.kind === 'expense' && c.monthlyBudgetMinor)
    .map((c) => ({
      id: c.id,
      name: c.name,
      icon: c.icon,
      color: c.color,
      spentMinor: statById.get(c.id)?.totalMinor ?? 0,
      count: statById.get(c.id)?.count ?? 0,
      budgetMinor: c.monthlyBudgetMinor ?? 0,
    }))
    .sort((a, b) => b.spentMinor / b.budgetMinor - a.spentMinor / a.budgetMinor);

  if (!budgeted.length) return null;

  const totalBudget = budgeted.reduce((s, c) => s + c.budgetMinor, 0);
  const totalSpent = budgeted.reduce((s, c) => s + c.spentMinor, 0);
  const over = totalSpent > totalBudget;

  /* Where an even burn would have you today, so a bar can be read as ahead or
     behind rather than merely full. */
  const today = todayISO();
  const isCurrent = month === today.slice(0, 7);
  const { start, end } = monthRange(month);
  const pace = isCurrent
    ? Math.min(1, (Number(today.slice(8, 10)) - Number(start.slice(8, 10)) + 1) / Number(end.slice(8, 10)))
    : 1;

  return (
    <div>
      <SectionHead
        label={
          over ? (
            <span className="inline-flex items-center gap-2">
              Budgets
              <span className="badge badge-up">Over by {formatINR(totalSpent - totalBudget)}</span>
            </span>
          ) : (
            'Budgets'
          )
        }
        action={
          <Link href="/settings" className="micro micro-link" style={{ color: 'var(--accent)' }}>
            Set limits
          </Link>
        }
      />
      <Card className={`glow-card ${over ? 'bloom-danger' : 'bloom-quiet'}`}>
        <div className="relative flex items-baseline justify-between gap-3 mb-2.5">
          <Money minor={totalSpent} className="text-2xl font-semibold" />
          <span className="num text-[13px] muted">of {formatINR(totalBudget)}</span>
        </div>
        <ShareBar
          share={totalBudget > 0 ? totalSpent / totalBudget : 0}
          color={over ? 'var(--rule-red)' : 'var(--brass)'}
          height={6}
        />
        <p className="muted text-[12px] mt-2.5">
          Across {budgeted.length} budgeted {budgeted.length === 1 ? 'category' : 'categories'}
          {over
            ? ` — over by ${formatINR(totalSpent - totalBudget)}`
            : ` — ${formatINR(totalBudget - totalSpent)} left`}
          {totalBudget > 0 && ` · ${Math.round((totalSpent / totalBudget) * 100)}% utilised`}.
        </p>

        <ul className="mt-5 space-y-3">
          {budgeted.map((c) => {
            const share = c.budgetMinor > 0 ? c.spentMinor / c.budgetMinor : 0;
            const isOver = c.spentMinor > c.budgetMinor;
            const aheadOfPace = !isOver && share > pace + 0.05;
            /* Over-budget bars run red, ahead-of-pace amber, safe green — a
               gradient each, so the bar itself carries the verdict before the
               caption does. */
            const from = isOver
              ? 'color-mix(in oklab, var(--rule-red) 45%, var(--surface-2))'
              : aheadOfPace
                ? 'color-mix(in oklab, var(--hi) 45%, var(--surface-2))'
                : 'color-mix(in oklab, var(--credit) 45%, var(--surface-2))';
            const to = isOver ? 'var(--rule-red)' : aheadOfPace ? 'var(--hi)' : 'var(--credit)';

            return (
              <li key={c.id}>
                {/* Each budget is its own card, as the reference draws them —
                    eight rows in one divided list read as a table, and a
                    table is not something you scan for a problem. */}
                <button
                  className="w-full text-left rounded-xl p-3.5 transition-colors"
                  style={{ background: 'var(--surface-2)' }}
                  onClick={() => openCategory(c.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex items-start gap-2.5 min-w-0">
                      <CategoryIcon icon={c.icon} color={c.color} size={30} />
                      <span className="min-w-0">
                        <span className="text-[13.5px] font-semibold block truncate">{c.name}</span>
                        <span className="muted text-[11px] block truncate">
                          {c.count} {c.count === 1 ? 'entry' : 'entries'} this month
                        </span>
                      </span>
                    </span>

                    <span className="text-right shrink-0">
                      <span className="block">
                        <span
                          className="num text-[14px] font-semibold"
                          style={{ color: isOver ? 'var(--rule-red)' : undefined }}
                        >
                          {formatINR(c.spentMinor)}
                        </span>
                        <span className="num text-[12px] muted"> / {formatINR(c.budgetMinor)}</span>
                      </span>
                      <span
                        className="text-[11px]"
                        style={{ color: isOver ? 'var(--rule-red)' : 'var(--credit)' }}
                      >
                        {isOver
                          ? `Over by ${formatINR(c.spentMinor - c.budgetMinor)}`
                          : `${formatINR(c.budgetMinor - c.spentMinor)} left`}
                      </span>
                    </span>
                  </div>

                  <div className="relative mt-3">
                    <div
                      className="h-2 rounded-full overflow-hidden w-full"
                      style={{ background: 'var(--surface-3, var(--bg))' }}
                    >
                      <div
                        className="h-full rounded-full grow"
                        style={{
                          width: `${Math.min(100, Math.max(share * 100, share > 0 ? 2 : 0))}%`,
                          background: `linear-gradient(90deg, ${from}, ${to})`,
                          boxShadow: `0 0 12px -2px color-mix(in oklab, ${to} 55%, transparent)`,
                        }}
                      />
                    </div>
                    {/* Where an even burn would put you today. A bar at 60% on
                        the 10th is a different story from the same bar on the
                        28th, and only the marker tells them apart. */}
                    {isCurrent && (
                      <span
                        aria-hidden
                        className="absolute top-[-2px] bottom-[-2px] w-px"
                        style={{ left: `${pace * 100}%`, background: 'var(--text)', opacity: 0.55 }}
                      />
                    )}
                  </div>

                  <div className="flex items-baseline justify-between gap-3 mt-2">
                    <span className="text-[11px] muted truncate">
                      {isOver
                        ? 'Limit already reached'
                        : aheadOfPace
                          ? 'Ahead of an even burn for this point in the month'
                          : isCurrent
                            ? `${Math.round(pace * 100)}% of the month elapsed`
                            : 'Within the limit'}
                    </span>
                    <span
                      className="num text-[11px] font-semibold shrink-0"
                      style={{ color: isOver ? 'var(--rule-red)' : 'var(--text-muted)' }}
                    >
                      {Math.round(share * 100)}% of planned
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

/** A figure in a well with the one line that makes it mean something. */
function SubStat({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: string;
}) {
  return (
    <div className="min-w-0 px-1">
      {/* Not `micro`: it uppercases and tracks out, which pushed "Projected
          month end" past the column and left "PROJECTED MONT…" on screen. */}
      <p className="text-[12px] leading-snug" style={{ color: 'var(--text-muted)' }}>
        {label}
      </p>
      <p className="num text-[17px] font-semibold mt-1">{value}</p>
      {note && (
        <p className="text-[11px] mt-0.5 leading-snug" style={{ color: tone ?? 'var(--text-muted)' }}>
          {note}
        </p>
      )}
    </div>
  );
}

/** The quiet glyph in a stat card's corner. Structure, not decoration. */
function StatMark({ children }: { children: ReactNode }) {
  return (
    <span
      className="w-7 h-7 rounded-lg flex items-center justify-center text-[13px]"
      style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}
      aria-hidden
    >
      {children}
    </span>
  );
}
