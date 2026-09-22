'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useSWRConfig } from 'swr';
import { api } from '@/lib/client';
import { targetLabel, todayISO } from '@/lib/dates';
import { formatINR } from '@/lib/money';
import type { MonthlyPlan, Sweep } from '@/lib/plan';
import type { Fund } from '@/lib/funds';
import { Card, Money } from './ui';
import { ShareBar } from './graph';
import { CategoryIcon } from './icons';
import { useToast } from './toast';

function PlanLine({
  label,
  minor,
  sign,
  strong,
  tone,
}: {
  label: string;
  minor: number;
  sign?: '+' | '−';
  strong?: boolean;
  tone?: 'good' | 'bad';
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={`text-[12.5px] ${strong ? 'font-semibold' : ''}`} style={{ color: strong ? 'var(--text)' : 'var(--text-muted)' }}>
        {label}
      </dt>
      <dd
        className={`num text-[13px] ${strong ? 'font-semibold' : ''}`}
        style={{ color: tone === 'bad' ? 'var(--rule-red)' : tone === 'good' ? 'var(--credit)' : undefined }}
      >
        {/* An explicit sign wins; failing that, a negative total still has to
            show one. A "In hand" row reading ₹2,233 when it means −₹2,233 is
            the same bug this card exists to stop telling. */}
        {sign === '−' || (!sign && minor < 0) ? '−' : ''}
        {formatINR(Math.abs(minor))}
      </dd>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * The underspend sweep
 * ------------------------------------------------------------------ */

/**
 * Last month cost less. Here is the difference, ready to become something.
 *
 * Spending less is invisible — nothing arrives, no total goes up, and by the
 * 5th it is indistinguishable from an ordinary month. One tap turns it into a
 * contribution, which is the difference between a virtue and a bike.
 */
export function SweepCard({ sweep, funds }: { sweep: Sweep; funds: Fund[] }) {
  const { mutate } = useSWRConfig();
  const toast = useToast();
  const open = funds.filter((f) => !f.isComplete);
  const [target, setTarget] = useState(open[0]?.categoryId ?? '');
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(`mf-sweep-${sweep.month}`) === 'done';
    } catch {
      return false;
    }
  });

  if (dismissed || sweep.savedMinor <= 0 || !open.length) return null;

  function close() {
    try {
      localStorage.setItem(`mf-sweep-${sweep.month}`, 'done');
    } catch {
      /* private mode — the card comes back, which is survivable */
    }
    setDismissed(true);
  }

  async function sweepIt() {
    setBusy(true);
    try {
      await api.post('/api/expenses', {
        amount: sweep.savedMinor / 100,
        categoryId: target,
        expenseDate: todayISO(),
        note: `Swept from ${monthName(sweep.month)}`,
        personIds: [],
      });
      await mutate((k) => typeof k === 'string' && k.startsWith('/api/'));
      close();
      toast(`${formatINR(sweep.savedMinor)} moved to your fund`);
    } catch {
      toast('Could not move it', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      className="!p-5"
      style={{ borderColor: 'color-mix(in oklab, var(--credit) 40%, var(--border))' }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="label mb-1.5" style={{ color: 'var(--credit)' }}>
            You underspent
          </p>
          <div className="flex items-baseline gap-2">
            <Money minor={sweep.savedMinor} className="text-3xl font-semibold" style={{ color: 'var(--credit)' }} />
            <span className="muted text-[13px]">less than {monthName(sweep.previousMonth)}</span>
          </div>
          <p className="muted text-[12px] mt-2 leading-relaxed max-w-md">
            It will quietly disappear into next month unless you move it somewhere.
          </p>
        </div>
        <button className="tag shrink-0" onClick={close}>
          Not now
        </button>
      </div>

      {open.length > 1 && (
        <div className="scroll-x flex gap-2 mt-4 -mx-1 px-1 pb-1">
          {open.map((f) => (
            <button
              key={f.categoryId}
              className="chip shrink-0"
              data-selected={target === f.categoryId}
              onClick={() => setTarget(f.categoryId)}
            >
              <CategoryIcon icon={f.icon} color={f.color} size={16} />
              {f.name}
            </button>
          ))}
        </div>
      )}

      <button className="btn btn-primary w-full sm:w-auto mt-4" onClick={sweepIt} disabled={busy || !target}>
        {busy ? 'Moving…' : `Move it to ${open.find((f) => f.categoryId === target)?.name ?? 'a goal'}`}
      </button>
    </Card>
  );
}

function monthName(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: 'long', timeZone: 'UTC' });
}

/* ------------------------------------------------------------------ *
 * A fund
 * ------------------------------------------------------------------ */

/**
 * Progress is a status; pace is feedback. A bar at 44% lets someone feel fine
 * about a goal they will miss by a year, so the pace line is not optional
 * decoration — it is the point of the card.
 */
export function FundCard({ fund, onAdd }: { fund: Fund; onAdd?: () => void }) {
  const ahead = (fund.paceDeltaMinor ?? 0) >= 0;

  return (
    <Card>
      <div className="flex items-start gap-3">
        <CategoryIcon icon={fund.icon} color={fund.color} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-[15px] font-semibold truncate">{fund.name}</h3>
            {fund.isComplete && (
              <span className="micro px-1.5 py-0.5 rounded" style={{ background: 'var(--credit-soft)', color: 'var(--credit)' }}>
                done
              </span>
            )}
          </div>
          <p className="muted text-[12px] mt-0.5">
            <span className="num">{formatINR(fund.savedMinor)}</span> of{' '}
            <span className="num">{formatINR(fund.targetMinor)}</span>
            {fund.targetDate && ` · by ${targetLabel(fund.targetDate)}`}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <ShareBar share={fund.progress} color={fund.isComplete ? 'var(--credit)' : fund.color} height={8} spring />
        <div className="flex items-baseline justify-between gap-3 mt-2">
          <span className="num text-[12px] font-semibold">{Math.round(fund.progress * 100)}%</span>
          {!fund.isComplete && (
            <span className="num text-[12px] muted">{formatINR(fund.remainingMinor)} to go</span>
          )}
        </div>
      </div>

      {!fund.isComplete && (
        <div className="grid grid-cols-2 gap-4 mt-5 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <div>
            <p className="label mb-1">Needs a month</p>
            <Money minor={fund.requiredPerMonthMinor ?? 0} className="text-[15px] font-semibold" />
            {fund.monthsLeft != null && (
              <p className="muted text-[11px] mt-0.5">
                {fund.monthsLeft} {fund.monthsLeft === 1 ? 'month' : 'months'} left
              </p>
            )}
          </div>
          <div>
            <p className="label mb-1">Pace</p>
            {fund.paceDeltaMinor == null ? (
              <p className="text-[15px] font-semibold muted">No date set</p>
            ) : !fund.paceConfident ? (
              /* One deposit last week is not a pace. Saying so is better than
                 a confident "₹6,857 ahead of plan" built out of nothing. */
              <>
                <p className="text-[15px] font-semibold muted">Just started</p>
                <p className="muted text-[11px] mt-0.5">pace after a few weeks</p>
              </>
            ) : (
              <>
                <p
                  className="num text-[15px] font-semibold"
                  style={{ color: ahead ? 'var(--credit)' : 'var(--rule-red)' }}
                >
                  {ahead ? '+' : '−'}
                  {formatINR(Math.abs(fund.paceDeltaMinor))}
                </p>
                <p className="muted text-[11px] mt-0.5">{ahead ? 'ahead of plan' : 'behind plan'}</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Computed since this feature shipped and never once rendered. It is
          the honest counterweight to the plan: what the plan asks for, and
          where the money is actually heading. */}
      {fund.projectedDate && !fund.isComplete && (
        <p className="muted text-[12px] mt-3.5 leading-relaxed">
          At the rate so far you get there around <strong>{targetLabel(fund.projectedDate)}</strong>
          {fund.targetDate && (
            <>
              {' '}
              — {fund.projectedDate <= fund.targetDate ? 'ahead of' : 'later than'} the {targetLabel(fund.targetDate)}{' '}
              target.
            </>
          )}
        </p>
      )}

      {onAdd && !fund.isComplete && (
        <button className="btn btn-ghost w-full mt-4" onClick={onAdd}>
          Add to this goal
        </button>
      )}
    </Card>
  );
}


/* ------------------------------------------------------------------ *
 * The tally
 * ------------------------------------------------------------------ */


/* ------------------------------------------------------------------ *
 * Goals, where you will actually see them
 * ------------------------------------------------------------------ */

/**
 * Goals were real, computed correctly, and parked at the bottom of a screen
 * nobody opens daily — which made them indistinguishable from broken. A goal
 * you cannot see is not a goal; it is a row in a table.
 *
 * This is the compact form: one line per fund on the screen you actually open,
 * carrying the two things that change behaviour — how far along, and what it
 * needs each month — with the full card a tap away.
 */
export function GoalsStrip({ funds }: { funds: Fund[] }) {
  const open = funds.filter((f) => !f.isComplete);
  const done = funds.filter((f) => f.isComplete);
  if (!funds.length) return null;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-2.5">
        <span className="label mb-0">Goals</span>
        <Link href="/investments" className="micro micro-link" style={{ color: 'var(--accent)' }}>
          All goals
        </Link>
      </div>

      <Card className="!p-0 overflow-clip">
        <ul>
          {[...open, ...done].slice(0, 4).map((f, i) => (
            <li key={f.categoryId} style={i > 0 ? { borderTop: '1px solid var(--border)' } : undefined}>
              <Link href="/investments" className="row block px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <CategoryIcon icon={f.icon} color={f.color} size={30} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[13.5px] font-semibold truncate">{f.name}</span>
                      <span className="num text-[12px] shrink-0">
                        {formatINR(f.savedMinor)}
                        <span className="muted"> / {formatINR(f.targetMinor)}</span>
                      </span>
                    </div>

                    <div className="mt-2">
                      <ShareBar
                        share={f.progress}
                        color={f.isComplete ? 'var(--credit)' : f.color}
                        height={5}
                        spring
                      />
                    </div>

                    <div className="flex items-baseline justify-between gap-3 mt-1.5">
                      <span className="num text-[11px] muted">{Math.round(f.progress * 100)}%</span>
                      <span className="text-[11px] muted">
                        {f.isComplete ? (
                          <span style={{ color: 'var(--credit)' }}>done</span>
                        ) : f.requiredPerMonthMinor ? (
                          <>
                            <span className="num">{formatINR(f.requiredPerMonthMinor)}</span> a month
                          </>
                        ) : (
                          <>
                            <span className="num">{formatINR(f.remainingMinor)}</span> to go
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Saving, over time
 * ------------------------------------------------------------------ */

export type SavedMonthRow = {
  month: string;
  inMinor: number;
  outMinor: number;
  investedMinor: number;
  savedMinor: number;
  ratePct: number | null;
};

/**
 * One month's savings rate is the easiest number in personal finance to
 * explain away — a wedding, a flight, a bad week. Six in a column is not, and
 * the shape of the column is the actual feedback: whether the habit is
 * forming or the good month was the exception.
 *
 * Months where nothing came in are drawn as gaps rather than dropped, because
 * a missing month is information and silently skipping it would flatter the
 * average sitting underneath.
 */
export function SavingsHistory({ rows }: { rows: SavedMonthRow[] }) {
  const withIncome = rows.filter((r) => r.ratePct != null);
  if (withIncome.length === 0) return null;

  /*
   * POOLED, NOT AVERAGED.
   *
   * This was the unweighted mean of the monthly rates, so a ₹5,000 month at
   * 90% counted exactly as much as a ₹50,000 month at 20% — and the footer
   * then reported 55% for someone who had actually kept 26% of their money.
   * The rate of the sums, never the mean of the rates.
   */
  const pooledIn = withIncome.reduce((s, r) => s + r.inMinor, 0);
  const pooledSaved = withIncome.reduce((s, r) => s + r.savedMinor, 0);
  const avg = pooledIn > 0 ? (pooledSaved / pooledIn) * 100 : 0;

  return (
    <Card>
      <h3 className="text-[15px] font-semibold mb-1">What you keep</h3>
      <p className="muted text-[12px] mb-4">
        Of everything that came in each month, the share that did not go back out.
      </p>

      <ul className="space-y-3">
        {rows.map((r) => {
          const negative = r.savedMinor < 0;
          return (
            <li key={r.month}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="micro">{monthName(r.month)}</span>
                <span className="flex items-baseline gap-2.5 min-w-0">
                  {r.ratePct != null && (
                    <span
                      className="num text-[12px] font-semibold"
                      style={{ color: negative ? 'var(--rule-red)' : 'var(--credit)' }}
                    >
                      {negative ? '−' : ''}
                      {Math.abs(Math.round(r.ratePct))}%
                    </span>
                  )}
                  <span className="num text-[12px] muted">
                    {negative && '−'}
                    {formatINR(Math.abs(r.savedMinor))}
                  </span>
                </span>
              </div>
              <div className="mt-1.5">
                {r.ratePct == null ? (
                  /* No income logged. An empty track says "no record" where a
                     0% bar would have said "you kept nothing". */
                  <div
                    className="h-1.5 rounded-full"
                    style={{ background: 'var(--surface-2)' }}
                    title="Nothing logged as income this month"
                  />
                ) : (
                  <ShareBar
                    share={Math.max(0, Math.min(1, r.ratePct / 100))}
                    color={negative ? 'var(--rule-red)' : 'var(--credit)'}
                    height={6}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <p className="muted text-[12px] mt-4 pt-3.5 border-t leading-relaxed" style={{ borderColor: 'var(--border)' }}>
        Averaging <strong className="num">{Math.round(avg)}%</strong> kept across{' '}
        {withIncome.length === 1 ? 'the one month' : `${withIncome.length} months`} with income logged.
      </p>
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * Lifetime
 * ------------------------------------------------------------------ */

export type LifetimeTallyRow = {
  known: boolean;
  inMinor: number;
  outMinor: number;
  investedMinor: number;
  inHandMinor: number;
  months: number;
  firstMonth: string | null;
};

/**
 * The running total the months are instalments of.
 *
 * A month is a unit of accounting, not a unit of life, and the monthly card
 * cannot help resetting on the 1st. August being down ₹2,233 reads very
 * differently next to eleven months that were not — so this adds them all up
 * and, unlike everything else on the dashboard, does not move when you change
 * the month.
 */
export function LifetimeInHand({ data }: { data: LifetimeTallyRow }) {
  /*
   * With nothing coming in there is no figure to give, and this is the only
   * card on the dashboard that is always present — so it carries the prompt
   * that used to live on safe-to-spend. Returning null here would leave a
   * fresh account with no route to setting income up at all.
   */
  if (!data.known) {
    return (
      <Card className="!p-5">
        <p className="label mb-2">Lifetime in hand</p>
        <p className="text-[15px] font-semibold">Tell the app what comes in</p>
        <p className="muted text-[13px] mt-1.5 leading-relaxed max-w-lg">
          It knows what leaves and nothing about what arrives, so it cannot say what you have kept. Add an income
          source, then log each payment under <strong>Add transaction → Income</strong> — a month that pays
          differently just gets a different figure.
        </p>
        <Link href="/settings?add=income" className="btn btn-primary mt-4">
          Add an income source
        </Link>
      </Card>
    );
  }

  const down = data.inHandMinor < 0;

  return (
    <Card className="!p-5 sm:!p-6">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] gap-5 lg:gap-8 items-start">
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <p className="label mb-0">Lifetime in hand</p>
            {/* The one figure here that is not about the month on screen. */}
            <span className="micro">all time</span>
          </div>

          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mt-2">
            <span
              className="text-[2.4rem] sm:text-5xl font-semibold leading-none tracking-tight num"
              style={down ? { color: 'var(--rule-red)' } : undefined}
            >
              {down && '−'}
              {formatINR(Math.abs(data.inHandMinor))}
            </span>
          </div>

          <p className="muted text-[13px] mt-2.5 leading-relaxed">
            {down ? 'drawn down' : 'kept'} across {data.months} {data.months === 1 ? 'month' : 'months'}
            {data.firstMonth && <>, since {monthName(data.firstMonth)}</>}
          </p>
        </div>

        {/* The same subtraction as the monthly card, over every month there is. */}
        <div className="min-w-0">
          <dl className="space-y-2">
            <PlanLine label="Everything that came in" minor={data.inMinor} sign="+" strong />
            <PlanLine label="Everything spent" minor={data.outMinor} sign="−" />
            {data.investedMinor > 0 && <PlanLine label="Everything invested" minor={data.investedMinor} sign="−" />}
            <div className="pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
              <PlanLine label="In hand" minor={data.inHandMinor} strong tone={down ? 'bad' : 'good'} />
            </div>
          </dl>

          {data.investedMinor > 0 && (
            <p className="muted text-[12px] mt-3.5 leading-relaxed">
              Investments are subtracted because this is cash, not net worth —{' '}
              <span className="num">{formatINR(data.investedMinor)}</span> of it is still yours, just not
              spendable.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * Every goal, together
 * ------------------------------------------------------------------ */

/**
 * The number the goals page never had.
 *
 * Individually each goal looks reasonable. Added up they can ask for more per
 * month than anyone earns, and nothing said so — you had to sum the cards in
 * your head. This is also the honest home for the "goals ask for more than the
 * month has left" message, which used to interrupt the dashboard.
 */
export function GoalsRollup({ funds }: { funds: Fund[] }) {
  const open = funds.filter((f) => !f.isComplete);
  const done = funds.filter((f) => f.isComplete);
  if (!funds.length) return null;

  const targetMinor = open.reduce((s, f) => s + f.targetMinor, 0);
  const savedMinor = open.reduce((s, f) => s + f.savedMinor, 0);
  const perMonthMinor = open.reduce((s, f) => s + (f.requiredPerMonthMinor ?? 0), 0);
  const behind = open.filter((f) => f.paceConfident && (f.paceDeltaMinor ?? 0) < 0).length;

  return (
    <Card className="!p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="label mb-0">All goals together</p>
        {done.length > 0 && (
          <span className="micro" style={{ color: 'var(--credit)' }}>
            {done.length} finished
          </span>
        )}
      </div>

      <p className="text-[15px] mt-2.5 leading-relaxed">
        <strong className="num">{formatINR(savedMinor)}</strong> saved of{' '}
        <span className="num">{formatINR(targetMinor)}</span> across {open.length}{' '}
        {open.length === 1 ? 'goal' : 'goals'}
        {perMonthMinor > 0 && (
          <>
            {' '}
            — <strong className="num">{formatINR(perMonthMinor)}</strong> a month to land them all on time
          </>
        )}
        .
      </p>

      <div className="mt-3.5">
        <ShareBar share={targetMinor > 0 ? savedMinor / targetMinor : 0} color="var(--credit)" height={6} />
      </div>

      {behind > 0 && (
        <p className="text-[12px] mt-3 leading-relaxed" style={{ color: 'var(--rule-red)' }}>
          {behind} {behind === 1 ? 'goal is' : 'goals are'} behind pace. Pushing a target date out is a decision;
          missing it quietly is not.
        </p>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * The three-up metric row
 * ------------------------------------------------------------------ */

/**
 * A metric card in the Obsidian idiom: icon tile top-left, delta badge
 * top-right, label, figure, then a supporting line — and optionally a
 * stacked allocation bar underneath.
 *
 * The shape repeats across the top of Dashboard, Ledger and Goals, so it is
 * one component rather than three near-identical blocks of markup.
 */
export function MetricCard({
  icon,
  label,
  children,
  badge,
  note,
  glow = false,
  tone,
  footer,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
  badge?: ReactNode;
  note?: ReactNode;
  /** The ambient lime bloom. One card per screen earns it. */
  glow?: boolean;
  tone?: string;
  footer?: ReactNode;
}) {
  return (
    <Card className={`!p-5 flex flex-col justify-between ${glow ? 'glow-card' : ''}`}>
      <div className="relative">
        <div className="flex items-start justify-between gap-3 mb-4">
          <span className={`icon-tile ${glow ? 'icon-tile-accent' : ''}`}>{icon}</span>
          {badge}
        </div>
        <p className="label mb-1.5">{label}</p>
        <div className="flex items-baseline gap-2 flex-wrap" style={tone ? { color: tone } : undefined}>
          {children}
        </div>
        {note && <p className="muted text-[12.5px] mt-1.5 leading-relaxed">{note}</p>}
      </div>
      {footer && <div className="relative mt-5">{footer}</div>}
    </Card>
  );
}

/** The delta pill that sits opposite a metric card's icon tile. */
export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'up' | 'down' | 'good' | 'neutral';
  children: ReactNode;
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

/**
 * The month's allocation as one bar plus a legend — the footer of the hero
 * metric card. Same three quantities as MonthTally's bar, at a smaller size,
 * and scaled the same way so the two can never disagree.
 */
export function AllocationBar({ plan }: { plan: MonthlyPlan }) {
  const t = plan.tally;
  const outTotal = t.outMinor + t.investedMinor;
  const scale = Math.max(t.inMinor, outTotal, 1);
  const pct = (v: number) => Math.max(0, Math.min(100, (v / scale) * 100));
  const spent = pct(t.outMinor);
  const invested = pct(t.investedMinor);
  const free = Math.max(0, 100 - spent - invested);
  const dipped = t.inHandMinor < 0;

  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="micro">Spend allocation</span>
        <span className="text-[11px] font-semibold">
          <span className="num">{formatINR(t.inMinor)}</span> <span className="muted">in</span>
        </span>
      </div>

      <div className="relative">
        <div className="flex h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
          <span style={{ width: `${spent}%`, background: 'var(--text-muted)' }} />
          <span style={{ width: `${invested}%`, background: 'var(--credit)' }} />
          <span style={{ width: `${free}%`, background: 'var(--accent)' }} />
        </div>

        {/* Where the money coming in ran out. Everything right of it was paid
            for out of what was already in the account — the bar is the only
            thing that can say so, and without the mark it cannot. */}
        {dipped && (
          <span
            aria-hidden
            className="absolute top-[-4px] bottom-[-4px] w-[2px] -translate-x-px rounded-full"
            style={{ left: `${pct(t.inMinor)}%`, background: 'var(--rule-red)' }}
          />
        )}
      </div>

      {dipped && (
        <p className="micro mt-2" style={{ color: 'var(--rule-red)' }}>
          past this line, the month drew on what you already had
        </p>
      )}

      {/* Percentages AND amounts. A legend reading "Spent 74%" of an unstated
          base is half a fact. */}
      <div className="flex items-center justify-between gap-2 mt-2.5 text-[11px]">
        <Leg color="var(--text-muted)" label="Spent" pct={spent} minor={t.outMinor} />
        {t.investedMinor > 0 && (
          <Leg color="var(--credit)" label="Invested" pct={invested} minor={t.investedMinor} />
        )}
        <Leg
          color={dipped ? 'var(--rule-red)' : 'var(--accent)'}
          label={dipped ? 'From savings' : 'Free'}
          pct={free}
          minor={t.inHandMinor}
          signed
        />
      </div>
    </>
  );
}

function Leg({
  color,
  label,
  pct,
  minor,
  signed = false,
}: {
  color: string;
  label: string;
  pct: number;
  minor: number;
  signed?: boolean;
}) {
  return (
    <span className="inline-flex flex-col gap-0.5 min-w-0">
      <span className="inline-flex items-center gap-1.5 muted">
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} aria-hidden />
        {label} {Math.round(pct)}%
      </span>
      <span className="num font-semibold pl-3" style={{ color }}>
        {signed && minor < 0 && '−'}
        {formatINR(Math.abs(minor))}
      </span>
    </span>
  );
}

/**
 * The textbook savings rate, reconciled against the cash figure above it.
 *
 * `income − spending` is a legitimate number and a misleading headline, which
 * is why it lives down here qualified rather than up there alone. The redesign
 * dropped it along with the card it used to sit in; without it the hero says
 * "−₹4,912" and never explains that the month did in fact save ₹10,088 before
 * ₹15,000 went into investments.
 */
/**
 * "a" or "an" for a percentage read aloud. Eighty, eleven and eighteen all
 * start with a vowel sound; every other leading digit does not.
 */
function article(n: number): string {
  const lead = String(Math.abs(n));
  return lead.startsWith('8') || lead === '11' || lead === '18' ? 'an' : 'a';
}

export function TallyReconciliation({ plan }: { plan: MonthlyPlan }) {
  const t = plan.tally;
  if (!t.known) return null;
  const overspent = t.savedMinor < 0;
  const dipped = t.inHandMinor < 0;

  return (
    <p className="muted text-[12px] leading-relaxed">
      {t.investedMinor > 0 ? (
        <>
          Income less spending is <span className="num">{formatINR(t.savedMinor)}</span>
          {t.ratePct != null && !overspent && <> — a {Math.round(t.ratePct)}% savings rate</>}, but{' '}
          <span className="num">{formatINR(t.investedMinor)}</span> of it went into investments
          {dipped ? (
            <>
              {' '}
              — <span className="num">{formatINR(Math.abs(t.inHandMinor))}</span> more than the month produced, so the
              difference came out of money you already had.
            </>
          ) : (
            <>, which you still have — just not in cash.</>
          )}
        </>
      ) : overspent ? (
        <>
          <span className="num">{formatINR(Math.abs(t.savedMinor))}</span> more went out than came in.
        </>
      ) : (
        <>
          That is {article(Math.round(t.ratePct ?? 0))} {Math.round(t.ratePct ?? 0)}% savings rate — the share of what
          came in that is still sitting there.
        </>
      )}
    </p>
  );
}
