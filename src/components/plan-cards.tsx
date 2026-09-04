'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSWRConfig } from 'swr';
import { api } from '@/lib/client';
import { dayLabel, todayISO } from '@/lib/dates';
import { formatINR } from '@/lib/money';
import type { MonthlyPlan, Sweep } from '@/lib/plan';
import type { Fund } from '@/lib/funds';
import { Card, Money } from './ui';
import { ShareBar } from './graph';
import { CategoryIcon } from './icons';
import { useToast } from './toast';

/* ------------------------------------------------------------------ *
 * Safe to spend
 * ------------------------------------------------------------------ */

/**
 * The one figure that changes what someone does at the counter.
 *
 * Every other number in this app is about the past. "You have spent ₹15,142"
 * is a fact you cannot act on; "₹610 a day" is a decision. The arithmetic is
 * spelled out underneath on purpose — a number nobody can reproduce in their
 * head is a number nobody trusts, and this one has four inputs.
 */
export function SafeToSpend({ plan }: { plan: MonthlyPlan }) {
  if (!plan.hasIncome) {
    return (
      <Card className="!p-5">
        <p className="label mb-2">Safe to spend</p>
        <p className="text-[15px] font-semibold">Tell the app what comes in</p>
        <p className="muted text-[13px] mt-1.5 leading-relaxed max-w-lg">
          It knows what leaves and nothing about what arrives, so it cannot say what is safe to spend, what your
          savings rate is, or how long your money lasts. Add an income source, then log each payment under{' '}
          <strong>Add transaction → Income</strong> — a month that pays differently just gets a different figure.
        </p>
        <Link href="/settings?add=income" className="btn btn-primary mt-4">
          Add an income source
        </Link>
      </Card>
    );
  }

  const { committed } = plan;
  const base = plan.expectedIncomeMinor;
  const spentShare = base > 0 ? plan.spentMinor / base : 0;
  const investedShare = base > 0 ? plan.investedMinor / base : 0;
  const dueShare = base > 0 ? committed.committedDueMinor / base : 0;

  return (
    <Card className="!p-5 sm:!p-6">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] gap-6 lg:gap-8 items-start">
        <div>
          <p className="label mb-2">{plan.overspent ? 'Over budget' : 'Safe to spend'}</p>
          {plan.overspent ? (
            <>
              <Money
                minor={Math.abs(plan.freeMinor)}
                className="text-[2.4rem] sm:text-5xl font-semibold leading-none tracking-tight"
                style={{ color: 'var(--rule-red)' }}
              />
              <p className="muted text-[13px] mt-2.5">
                past what is left for the month, with {plan.daysLeft} {plan.daysLeft === 1 ? 'day' : 'days'} to go
              </p>
            </>
          ) : (
            <>
              <div className="flex items-baseline gap-2">
                <Money
                  minor={plan.perDayMinor}
                  className="text-[2.4rem] sm:text-5xl font-semibold leading-none tracking-tight"
                />
                <span className="muted text-[15px]">a day</span>
              </div>
              <p className="muted text-[13px] mt-2.5">
                <span className="num">{formatINR(plan.freeMinor)}</span> free over{' '}
                <span className="num">{plan.daysLeft}</span> {plan.daysLeft === 1 ? 'day' : 'days'}
              </p>
              {/* Never let an estimate pass for a fact. */}
              {plan.usingEstimate && (
                <p className="text-[12px] mt-2 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  Assuming <span className="num">{formatINR(plan.expectedIncomeMinor)}</span> in, from your last few
                  months. This updates the moment you log the real figure.
                </p>
              )}
            </>
          )}
        </div>

        {/* The working. Four subtractions, in the order they happen. */}
        <div className="min-w-0">
          <p className="label mb-2.5">How it gets there</p>
          <dl className="space-y-2">
            <PlanLine
              label={plan.usingEstimate ? 'Income (expected)' : 'Income'}
              minor={plan.expectedIncomeMinor}
              sign="+"
              strong
            />
            <PlanLine label="Spent so far" minor={plan.spentMinor} sign="−" />
            {plan.investedMinor > 0 && <PlanLine label="Invested" minor={plan.investedMinor} sign="−" />}
            {committed.committedDueMinor > 0 && (
              <PlanLine label="Bills still due" minor={committed.committedDueMinor} sign="−" />
            )}
            {plan.savingsTargetMinor > 0 && (
              <PlanLine label="Funds still need" minor={plan.savingsTargetMinor} sign="−" />
            )}
            <div className="pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
              <PlanLine label="Free" minor={plan.freeMinor} strong tone={plan.overspent ? 'bad' : 'good'} />
            </div>
          </dl>

          <div className="mt-4">
            <div className="flex h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
              <span style={{ width: `${Math.min(100, spentShare * 100)}%`, background: 'var(--brass)' }} />
              <span style={{ width: `${Math.min(100, investedShare * 100)}%`, background: 'var(--credit)' }} />
              <span
                style={{
                  width: `${Math.min(100, dueShare * 100)}%`,
                  background: 'var(--border-strong)',
                }}
              />
            </div>
            <p className="micro mt-2">
              spent · invested · still due, against income
              {plan.savingsRatePct != null && ` — saving ${Math.round(plan.savingsRatePct)}%`}
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}

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
        {sign === '−' ? '−' : ''}
        {formatINR(Math.abs(minor))}
      </dd>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Committed vs discretionary
 * ------------------------------------------------------------------ */

/**
 * The most clarifying cut in the month, and the one every expense app leaves
 * out: what was already decided, against what was actually chosen.
 */
export function CommittedSplitCard({ plan }: { plan: MonthlyPlan }) {
  const { committed } = plan;
  const total = committed.committedPaidMinor + committed.discretionaryMinor;
  if (total === 0) return null;

  const committedShare = committed.committedPaidMinor / total;

  return (
    <Card>
      <h2 className="text-[15px] font-semibold mb-1">Decided vs chosen</h2>
      <p className="muted text-[12px] mb-4">
        Recurring charges were settled months ago. The rest is this month&rsquo;s actual decisions — and the only part
        worth trying to move.
      </p>

      <div className="flex h-2.5 rounded-full overflow-hidden mb-4" style={{ background: 'var(--surface-2)' }}>
        <span style={{ width: `${committedShare * 100}%`, background: 'var(--border-strong)' }} />
        <span style={{ width: `${(1 - committedShare) * 100}%`, background: 'var(--brass)' }} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="label mb-1.5">Committed</p>
          <Money minor={committed.committedPaidMinor} className="text-xl font-semibold" />
          <p className="muted text-[11px] mt-1">{Math.round(committedShare * 100)}% · already decided</p>
        </div>
        <div>
          <p className="label mb-1.5">Discretionary</p>
          <Money minor={committed.discretionaryMinor} className="text-xl font-semibold" />
          <p className="muted text-[11px] mt-1">{Math.round((1 - committedShare) * 100)}% · your choices</p>
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * Coming up
 * ------------------------------------------------------------------ */

/**
 * Charges the ledger has learned to expect and that have not landed yet.
 *
 * Solves "why am I always short at the end of the month" — because a chunk of
 * it was already spoken for and nothing said so until it went out.
 */
export function ComingUp({ plan }: { plan: MonthlyPlan }) {
  const upcoming = plan.committed.upcoming;
  if (!upcoming.length) return null;

  const today = Number(todayISO().slice(8, 10));

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <h2 className="text-[15px] font-semibold">Still to come</h2>
        <Money minor={plan.committed.committedDueMinor} className="text-[13px] font-semibold" />
      </div>
      <p className="muted text-[12px] mb-4">Recognised from your own history. Nothing here was entered as a bill.</p>

      <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
        {upcoming.map((c) => {
          const overdue = plan.isCurrentMonth && c.typicalDay < today;
          return (
            <li key={`${c.categoryId}-${c.label}`} className="flex items-center gap-3 py-2.5">
              <CategoryIcon icon={c.icon} color={c.color} size={28} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium truncate capitalize">{c.label || c.categoryName}</p>
                <p className="micro mt-0.5" style={overdue ? { color: 'var(--rule-red)' } : undefined}>
                  {overdue ? 'expected by now' : `around the ${ordinal(c.typicalDay)}`}
                </p>
              </div>
              <Money minor={c.typicalMinor} className="text-[13px] font-semibold shrink-0" />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function ordinal(n: number): string {
  const suffix = n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th';
  return `${n}${suffix}`;
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
        {busy ? 'Moving…' : `Move it to ${open.find((f) => f.categoryId === target)?.name ?? 'a fund'}`}
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
            {fund.targetDate && ` · by ${dayLabel(fund.targetDate)}`}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <ShareBar share={fund.progress} color={fund.isComplete ? 'var(--credit)' : fund.color} height={8} />
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

      {onAdd && !fund.isComplete && (
        <button className="btn btn-ghost w-full mt-4" onClick={onAdd}>
          Add to this fund
        </button>
      )}
    </Card>
  );
}
