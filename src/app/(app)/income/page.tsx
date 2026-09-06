'use client';

import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { currentMonth, dayLabel, monthLabel } from '@/lib/dates';
import { formatINR } from '@/lib/money';
import type { IncomeOverview } from '@/lib/income';
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
import { MonthBars, Sparkline } from '@/components/graph';
import { CategoryIcon } from '@/components/icons';
import { IncomeSourceModal } from '@/components/income-source-modal';
import { useShell } from '@/components/app-shell';
import { useInspector } from '@/components/inspector';

/**
 * Everything about money arriving.
 *
 * This lived inside Settings, which is why it took three attempts to make
 * findable: a configuration screen is where you go once, and income is
 * something you record every month. Given a page, it can answer the questions
 * a settings row never could — what is normal, when does it land, and how much
 * does it move.
 */
export default function IncomePage() {
  const [month, setMonth] = useState(currentMonth());
  const [adding, setAdding] = useState(false);
  const { openAdd, toast } = useShell();
  const { openCategory } = useInspector();
  const { mutate } = useSWRConfig();

  const { data, error } = useSWR<IncomeOverview>(`/api/income?month=${month}`);
  const monthName = monthLabel(month).split(' ')[0];

  if (error) return <ErrorState message={error.message} />;

  const deltaPct =
    data && data.previousMonthMinor > 0
      ? ((data.monthMinor - data.previousMonthMinor) / data.previousMonthMinor) * 100
      : null;

  /* Against the median rather than the last figure — one good month should not
     reset what "normal" means. */
  const vsTypical =
    data && data.typicalMinor > 0 ? Math.round(((data.monthMinor - data.typicalMinor) / data.typicalMinor) * 100) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Income"
        title={monthLabel(month)}
        actions={
          <>
            <MonthPicker month={month} onChange={setMonth} />
            <button className="btn btn-primary max-sm:flex-1" onClick={() => setAdding(true)}>
              + Source
            </button>
          </>
        }
      />

      {!data ? (
        <Card>
          <ListSkeleton rows={6} />
        </Card>
      ) : data.sources.length === 0 ? (
        <Card>
          <EmptyState
            title="Nothing comes in yet"
            hint="Add a source — Salary, Freelance, whatever pays you — then log each payment under it. Without one the app can say what leaves and never what you keep."
            action={
              <button className="btn btn-primary" onClick={() => setAdding(true)}>
                Add an income source
              </button>
            }
          />
        </Card>
      ) : (
        <>
          <Card className="!p-5 sm:!p-6">
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] gap-6 lg:gap-8 items-start">
              <div>
                <HeroFigure
                  label={`Received in ${monthName}`}
                  minor={data.monthMinor}
                  /* Up is good here, as on Investments — hence `invert`. */
                  delta={<Delta pct={deltaPct} invert />}
                  note={
                    vsTypical == null ? (
                      'First month on record.'
                    ) : vsTypical === 0 ? (
                      'Exactly a typical month.'
                    ) : (
                      <>
                        <span className="num">{Math.abs(vsTypical)}%</span> {vsTypical > 0 ? 'above' : 'below'} your
                        typical <span className="num">{formatINR(data.typicalMinor)}</span>
                      </>
                    )
                  }
                />

                {/*
                  WHEN IT LANDS.
                  A monthly average tells a salaried person nothing they did not
                  know and tells a freelancer nothing useful at all. The shape of
                  the month is the part that is actually hard to hold in your head.
                */}
                {data.isCurrentMonth && (
                  <div className="mt-5 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                    <p className="label mb-2.5">When it landed</p>
                    <CalendarStrip month={month} days={data.landedDays} />
                  </div>
                )}
              </div>

              <div className="min-w-0">
                {data.activeMonths >= 2 ? (
                  <>
                    <p className="label mb-3">Month by month</p>
                    <MonthBars data={data.series} activeMonth={month} onPick={setMonth} height={160} />
                  </>
                ) : (
                  <EmptyState
                    title="Not enough history to chart"
                    hint="Two months of income draws the first comparison."
                    action={
                      <button className="btn btn-primary" onClick={() => openAdd()}>
                        Record a payment
                      </button>
                    }
                  />
                )}
              </div>
            </div>
          </Card>

          <StatStrip
            items={[
              { label: 'Typical month', minor: data.typicalMinor, sub: `median of ${data.activeMonths}` },
              { label: 'Best month', minor: data.highMinor, tone: 'var(--credit)' },
              { label: 'Leanest month', minor: data.lowMinor },
              { label: 'Lifetime', minor: data.lifetimeMinor },
            ]}
          />

          {/*
            HOW STEADY IS IT.
            The single most useful sentence this app can say to anyone whose
            income is lumpy, and every input for it already existed.
          */}
          {data.activeMonths >= 3 && data.spreadMinor > 0 && (
            <Insight tone={data.spreadMinor > data.typicalMinor * 0.35 ? 'warn' : 'good'}>
              {data.spreadMinor > data.typicalMinor * 0.35 ? (
                <>
                  Your income swings by <span className="num">{formatINR(data.spreadMinor)}</span> between your best
                  and leanest month. Budget against{' '}
                  <strong className="num">{formatINR(data.typicalMinor)}</strong> — your median — rather than your
                  last figure.
                </>
              ) : (
                <>
                  Steady: <span className="num">{formatINR(data.spreadMinor)}</span> between your best and leanest
                  month. Planning against <span className="num">{formatINR(data.typicalMinor)}</span> is safe.
                </>
              )}
            </Insight>
          )}

          <div>
            <SectionHead label="Where it comes from" />
            <Card className="!p-0 overflow-clip">
              <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {data.sources.map((src) => (
                  <li
                    key={src.categoryId}
                    className="row px-3.5 sm:px-4 py-3.5"
                    onClick={() => openCategory(src.categoryId)}
                  >
                    <div className="flex items-center gap-3">
                      <CategoryIcon icon={src.icon} color={src.color} size={34} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-[13.5px] font-semibold truncate">{src.name}</span>
                          <Money
                            minor={src.monthMinor}
                            className="num text-[13px] font-semibold shrink-0"
                            style={src.monthMinor > 0 ? { color: 'var(--credit)' } : undefined}
                          />
                        </div>
                        <p className="muted text-[11px] mt-0.5">
                          {src.monthMinor > 0
                            ? `received ${src.lastDate ? dayLabel(src.lastDate) : 'this month'}`
                            : src.lastDate
                              ? `last on ${dayLabel(src.lastDate)}`
                              : 'nothing recorded yet'}
                          {src.typicalMinor > 0 && ` · usually ${formatINR(src.typicalMinor)}`}
                        </p>
                      </div>
                      {src.paymentCount >= 2 && (
                        <div className="hidden sm:block w-24 shrink-0">
                          <Sparkline values={src.series.map((s) => s.totalMinor)} tone={src.color} width={96} />
                        </div>
                      )}
                    </div>

                    {/* Only claimed once there is enough evidence for it. */}
                    {src.dayVariance != null && src.typicalDay != null && (
                      <p className="muted text-[11px] mt-2 pl-[2.875rem] leading-relaxed">
                        {src.dayVariance <= 2 ? (
                          <>
                            Lands within {src.dayVariance === 0 ? 'the day' : `${src.dayVariance} days`} of the{' '}
                            <strong>{ordinal(src.typicalDay)}</strong>, going by the last {src.paymentCount}.
                          </>
                        ) : (
                          <>
                            Timing moves — around the {ordinal(src.typicalDay)}, give or take {src.dayVariance} days.
                          </>
                        )}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
            <p className="muted text-[12px] mt-3 leading-relaxed max-w-2xl">
              A payment is logged like anything else — <strong>Add transaction → Income</strong> — so a month that
              pays differently just gets a different figure. This is what feeds <strong>Left in hand</strong> on your
              dashboard.
            </p>
          </div>
        </>
      )}

      <IncomeSourceModal
        open={adding}
        onClose={() => setAdding(false)}
        onDone={async (msg) => {
          await mutate((k) => typeof k === 'string' && k.startsWith('/api/'), undefined, { revalidate: true });
          toast(msg);
          setAdding(false);
        }}
      />
    </div>
  );
}

/** The month as a row of dots, filled on the days money arrived. */
function CalendarStrip({ month, days }: { month: string; days: number[] }) {
  const [y, m] = month.split('-').map(Number);
  const total = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const landed = new Set(days);

  return (
    <div className="flex flex-wrap gap-[3px]">
      {Array.from({ length: total }, (_, i) => i + 1).map((d) => (
        <span
          key={d}
          title={landed.has(d) ? `Income on the ${ordinal(d)}` : undefined}
          className="w-[7px] h-[7px] rounded-full"
          style={{ background: landed.has(d) ? 'var(--credit)' : 'var(--surface-2)' }}
        />
      ))}
    </div>
  );
}

function ordinal(n: number): string {
  const s = n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th';
  return `${n}${s}`;
}
