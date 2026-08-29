'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { qs } from '@/lib/client';
import { currentMonth, dayLabel, monthLabel, monthRange } from '@/lib/dates';
import { formatINR } from '@/lib/money';
import type { CategoryStat, Expense, ExpenseList, Person, PersonStat, Summary } from '@/lib/types';
import type { Flow } from '@/lib/flow';
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
import { DayBars, DeltaBar, Donut, FlowCurve, MonthBars, ShareBar, WeekdayBars } from '@/components/graph';
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
  const trends = useSWR<{ items: { month: string; totalMinor: number }[] }>('/api/analytics/trends?months=12');

  const s = summary.data;
  const f = flow.data;
  const filtered = personIds.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Analytics"
        title={monthLabel(month)}
        actions={<MonthPicker month={month} onChange={setMonth} />}
      />

      {/* ---------- The month, and its pace ---------- */}
      <Card className="!p-5 sm:!p-6">
        <div className="grid lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] gap-6 lg:gap-8 items-start">
          <div>
            {f ? (
              <>
                <HeroFigure
                  label="Total spent"
                  minor={f.pace.spentMinor}
                  delta={<Delta pct={f.pace.deltaPct} />}
                  note={
                    <>
                      <span className="num">{f.tickets.count}</span> transactions ·{' '}
                      <span className="num">{formatINR(f.pace.perDayMinor)}</span> a day
                    </>
                  }
                />
                <dl className="mt-5 pt-4 border-t space-y-2.5" style={{ borderColor: 'var(--border)' }}>
                  <Row
                    label={f.isCurrentMonth ? 'Last month by today' : 'The month before'}
                    value={formatINR(f.pace.prevSameDayMinor)}
                  />
                  {f.isCurrentMonth && (
                    <Row label="Projected month end" value={formatINR(f.pace.projectedMinor)} strong />
                  )}
                  <Row label="First half" value={formatINR(f.halves.firstMinor)} />
                  <Row label="Second half" value={formatINR(f.halves.secondMinor)} />
                </dl>
              </>
            ) : (
              <ListSkeleton rows={4} />
            )}
          </div>

          <div className="min-w-0">
            {f && f.cumulative.length >= 2 ? (
              <>
                <FlowCurve points={f.cumulative} monthDays={f.pace.monthDays} height={210} />
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
        items={[
          { label: 'Daily average', minor: f?.pace.perDayMinor ?? 0 },
          {
            label: 'Vs last month',
            value: s?.changePct != null ? `${s.changePct > 0 ? '+' : ''}${s.changePct.toFixed(1)}%` : '—',
            sub: s ? `${monthLabel(s.previousMonth.month).split(' ')[0]}: ${formatINR(s.previousMonth.totalMinor)}` : undefined,
            tone: s?.changePct == null ? undefined : s.changePct > 0 ? 'var(--rule-red)' : 'var(--credit)',
          },
          {
            label: 'Biggest day',
            minor: f?.cadence.busiest?.totalMinor ?? 0,
            sub: f?.cadence.busiest ? dayLabel(f.cadence.busiest.date) : undefined,
          },
          {
            label: 'Typical entry',
            minor: f?.tickets.medianMinor ?? 0,
            sub: f ? `average ${formatINR(f.tickets.averageMinor)}` : undefined,
          },
        ]}
      />

      {/* ---------- Rhythm ---------- */}
      <div>
        <SectionHead label="Rhythm" />
        <div className="grid lg:grid-cols-2 gap-5 items-start">
          <Card>
            <h3 className="text-[15px] font-semibold mb-1">What a weekday costs</h3>
            <p className="muted text-[12px] mb-4">Average across the days of that name that saw any spending.</p>
            {f && f.weekday.some((w) => w.avgMinor > 0) ? (
              <>
                <WeekdayBars data={f.weekday} />
                <PeakWeekday flow={f} />
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

        <div className="grid lg:grid-cols-2 gap-5 items-start">
          <Card>
            {!cats.data ? (
              <ListSkeleton rows={5} />
            ) : cats.data?.items.length ? (
              <>
                <div className="grid sm:grid-cols-[auto_minmax(0,1fr)] gap-5 items-center">
                  <Donut
                    data={cats.data.items.map((c) => ({ name: c.name, totalMinor: c.totalMinor, color: c.color }))}
                    size={148}
                    centreLabel={filtered ? 'Filtered' : 'Month'}
                  />
                  <BreakdownList
                    items={cats.data.items.map((c) => ({
                      id: c.categoryId,
                      name: c.name,
                      color: c.color,
                      icon: c.icon,
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

          {/* ---------- Momentum ---------- */}
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
        </div>
      </div>

      {/* ---------- Ticket sizes ---------- */}
      {f && f.tickets.count > 0 && (
        <div>
          <SectionHead label="How the money leaves" />
          <div className="grid lg:grid-cols-2 gap-5 items-start">
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
                An association view of the same{' '}
                <span className="num">{formatINR(ppl.data.grandTotalMinor)}</span>. Category and person are two
                independent ways of slicing one month — never two things to add together.
              </p>
            </>
          ) : (
            <EmptyState title="No people tagged yet" />
          )}
        </Card>
      </div>

      {/* ---------- Money that is not spending ---------- */}
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

      {/* ---------- The long view ---------- */}
      <div>
        <SectionHead label="The long view" />
        <Card>
          {(trends.data?.items.length ?? 0) >= 2 ? (
            <>
              <MonthBars data={trends.data!.items} activeMonth={month} onPick={setMonth} height={150} />
              <p className="muted text-[12px] mt-4">Tap a bar to open that month.</p>
            </>
          ) : (
            <EmptyState title="Not enough history yet" hint="A trend needs at least two months." />
          )}
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

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
        {label}
      </dt>
      <dd className={`num text-[13px] ${strong ? 'font-semibold' : ''}`}>{value}</dd>
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

/** The one sentence the weekday chart is actually for. */
function PeakWeekday({ flow }: { flow: Flow }) {
  const active = flow.weekday.filter((w) => w.avgMinor > 0);
  if (active.length < 2) return null;
  const peak = active.reduce((a, b) => (b.avgMinor > a.avgMinor ? b : a));
  const rest = active.filter((w) => w.label !== peak.label);
  const restAvg = Math.round(rest.reduce((s, w) => s + w.avgMinor, 0) / rest.length);
  if (restAvg <= 0) return null;

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
