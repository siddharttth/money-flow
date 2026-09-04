'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSWRConfig } from 'swr';
import { api } from '@/lib/client';
import { dayLabel, targetLabel, todayISO } from '@/lib/dates';
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

  return (
    <Card className="!p-5 sm:!p-6">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] gap-6 lg:gap-8 items-start">
        <div>
          <p className="label mb-2">
            {plan.shortfall === 'goals' ? 'Goals ask for more' : plan.overspent ? 'Over budget' : 'Safe to spend'}
          </p>
          {plan.shortfall === 'goals' ? (
            /*
             * Not overspending. A month can be ₹4,000 out of ₹50,000 and still
             * come up short because the targets want ₹48,893 of it — and
             * calling that "over budget" directly under a card reading "saved
             * ₹46,000" makes the app argue with itself.
             */
            <>
              <Money
                minor={Math.abs(plan.freeMinor)}
                className="text-[2.4rem] sm:text-5xl font-semibold leading-none tracking-tight"
                style={{ color: 'var(--hi)' }}
              />
              <p className="muted text-[13px] mt-2.5 leading-relaxed">
                more than the month has left, once your goals take their share. Your spending is fine — the targets
                are the stretch.
              </p>
              <p className="muted text-[12px] mt-2.5 leading-relaxed">
                Push a target date out, or put in less this month:{' '}
                <span className="num">{formatINR(plan.freeBeforeGoalsMinor)}</span> is genuinely free before they
                are counted.
              </p>
            </>
          ) : plan.overspent ? (
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
              <PlanLine label="Goals still need" minor={plan.savingsTargetMinor} sign="−" />
            )}
            <div className="pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
              <PlanLine label="Free" minor={plan.freeMinor} strong tone={plan.overspent ? 'bad' : 'good'} />
            </div>
          </dl>


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

/**
 * WHAT THE MONTH CAME TO.
 *
 * Every other card here reports a slice: what you spent, what is safe to
 * spend, how a goal is doing. None of them answered the question people open a
 * money app to ask — *how much did I keep?* — and the figure existed in the
 * plan payload the whole time without ever reaching a screen.
 *
 * The arithmetic is one subtraction and one split, and the bar draws exactly
 * the same three numbers so the picture and the list can never disagree:
 *
 *     came in − spent − invested = what is left
 *
 * The headline used to be `came in − spent`, captioned "Saved". That is the
 * textbook savings rate and it was actively misleading: a month that earned
 * ₹33,133, spent ₹25,366 and invested ₹10,000 announced "SAVED ₹7,767" while
 * the account it describes ended ₹2,233 lighter. Nobody reading that has
 * saved anything they can point at.
 *
 * So the big number is what is actually left after everything left — and the
 * savings rate keeps its place underneath, where it can be qualified rather
 * than mistaken for cash.
 *
 * It runs on money that actually arrived. Safe-to-spend may lean on an
 * estimate to be useful before payday; a figure describing what you have
 * may not.
 */
export function MonthTally({ plan, monthName }: { plan: MonthlyPlan; monthName: string }) {
  const t = plan.tally;
  if (!t.known) return null;

  const short = plan.isCurrentMonth;
  /** Spending alone outran the money coming in. */
  const overspent = t.savedMinor < 0;
  /** Spending did not, but spending plus investing did — the balance fell. */
  const dipped = t.inHandMinor < 0;
  /** The headline: what the month actually left behind, in cash. */
  const net = t.inHandMinor;
  const down = net < 0;

  /*
   * The bar is scaled to whichever is larger: what came in, or what went out.
   *
   * Scaling to income alone was wrong the moment a month invested more than it
   * produced — the segments summed past 100%, flex silently squashed them to
   * fit, and the picture quietly rescaled itself into a lie. Against the larger
   * of the two, a month that spent everything fills the bar exactly, and a
   * month that dipped into savings runs past the income mark drawn below.
   */
  const outTotal = t.outMinor + t.investedMinor;
  const scale = Math.max(t.inMinor, outTotal, 1);
  const pct = (v: number) => Math.max(0, Math.min(100, (v / scale) * 100));
  const spentPct = pct(t.outMinor);
  const investedPct = pct(t.investedMinor);
  const inHandPct = Math.max(0, 100 - spentPct - investedPct);
  /** Where the money coming in ran out, when the month went past it. */
  const incomeMarkPct = dipped ? pct(t.inMinor) : null;

  return (
    <Card className="!p-5 sm:!p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="label mb-0">
          {down ? 'Down in' : 'Left in hand ·'} {monthName}
          {short && ' so far'}
        </p>
        <p className="muted text-[12px]">
          <span className="num">{formatINR(t.inMinor)}</span> came in
        </p>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mt-2">
        <span
          className="text-[2.4rem] sm:text-5xl font-semibold leading-none tracking-tight num"
          style={down ? { color: 'var(--rule-red)' } : undefined}
        >
          {down && '−'}
          {formatINR(Math.abs(net))}
        </span>
        <span className="muted text-[13px]">
          after <span className="num">{formatINR(t.outMinor)}</span> spent
          {t.investedMinor > 0 && (
            <>
              {' '}
              and <span className="num">{formatINR(t.investedMinor)}</span> invested
            </>
          )}
        </span>
      </div>

      {/*
        One bar, three segments, in the order the money leaves.

        The colours are picked to survive both themes: --brass and --hi are the
        same gold once the lights go out, so brass/credit/hi drew as gold,
        green, gold with two identical legend dots. Neutral for money that is
        gone, green for money moved on purpose, gold for money still sitting
        there — all three stay distinct in Paper and Ink alike.
      */}
      <div className="mt-5">
        <div className="relative">
          <div className="flex h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
            <span style={{ width: `${spentPct}%`, background: 'var(--text-muted)' }} />
            <span style={{ width: `${investedPct}%`, background: 'var(--credit)' }} />
            <span style={{ width: `${inHandPct}%`, background: 'var(--hi)' }} />
          </div>

          {/* Where the money coming in ran out. Everything to its right was
              paid for out of what was already in the account. */}
          {incomeMarkPct != null && (
            <span
              aria-hidden
              className="absolute top-[-4px] bottom-[-4px] w-[2px] -translate-x-px rounded-full"
              style={{ left: `${incomeMarkPct}%`, background: 'var(--rule-red)' }}
            />
          )}
        </div>

        {incomeMarkPct != null && (
          <p className="micro mt-2" style={{ color: 'var(--rule-red)' }}>
            past this line, the month drew on what you already had
          </p>
        )}

        <dl
          className={`grid grid-cols-1 gap-x-6 gap-y-2 mt-4 ${
            t.investedMinor > 0 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
          }`}
        >
          <TallyLeg color="var(--text-muted)" label="Spent" minor={t.outMinor} />
          {/* The bar has no green segment when nothing was invested, so the
              legend should not carry a ₹0 entry explaining it. */}
          {t.investedMinor > 0 && (
            <TallyLeg color="var(--credit)" label="Invested" minor={t.investedMinor} />
          )}
          {/* Goes negative and shows it. Printing this as a cheerful gold
              "₹4,233" was the card's worst possible reading of its own
              arithmetic. */}
          <TallyLeg
            color={down ? 'var(--rule-red)' : 'var(--hi)'}
            label={down ? 'Taken from savings' : 'Left in hand'}
            minor={net}
            signed
            tone={down ? 'var(--rule-red)' : undefined}
          />
        </dl>
      </div>

      {/*
        The savings rate, kept but demoted.

        `income − spending` is the textbook figure and it is worth knowing, but
        as a 48px headline captioned "Saved" it told someone whose balance had
        just fallen that they had put ₹7,767 away. Down here it can be given
        the one qualifier that makes it true.
      */}
      <p className="muted text-[12px] mt-4 leading-relaxed">
        {t.investedMinor > 0 ? (
          <>
            Income less spending is <span className="num">{formatINR(t.savedMinor)}</span>
            {t.ratePct != null && !overspent && (
              <>
                {' '}
                — {article(Math.round(t.ratePct))} {Math.round(t.ratePct)}% savings rate
              </>
            )}
            , but{' '}
            <span className="num">{formatINR(t.investedMinor)}</span> of it went into investments
            {dipped ? (
              <>
                {' '}
                — <span className="num">{formatINR(Math.abs(net))}</span> more than the month produced, so the
                difference came out of money you already had.
              </>
            ) : (
              <>
                , which you still have — just not in cash.
              </>
            )}
          </>
        ) : overspent ? (
          <>
            <span className="num">{formatINR(Math.abs(t.savedMinor))}</span> more went out than came in.
          </>
        ) : (
          <>
            That is {article(Math.round(t.ratePct ?? 0))} {Math.round(t.ratePct ?? 0)}% savings rate — the
            share of what came in that is still sitting there.
          </>
        )}
      </p>

    </Card>
  );
}

/**
 * "a" or "an" for a percentage read aloud. Eighty, eleven and eighteen all
 * start with a vowel sound; every other leading digit does not.
 */
function article(n: number): string {
  const lead = String(Math.abs(n));
  return lead.startsWith('8') || lead === '11' || lead === '18' ? 'an' : 'a';
}

function TallyLeg({
  color,
  label,
  minor,
  tone,
  signed = false,
}: {
  color: string;
  label: string;
  minor: number;
  tone?: string;
  /** Print a minus for a negative figure instead of quietly taking its size. */
  signed?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between sm:justify-start sm:flex-col gap-x-3 sm:gap-y-1">
      <dt className="micro inline-flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} aria-hidden />
        {label}
      </dt>
      <dd className="num text-[15px] font-semibold" style={tone ? { color: tone } : undefined}>
        {signed && minor < 0 && '−'}
        {formatINR(Math.abs(minor))}
      </dd>
    </div>
  );
}

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

  const avg = withIncome.reduce((s, r) => s + (r.ratePct ?? 0), 0) / withIncome.length;

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
