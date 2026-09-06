import type { MonthlyPlan } from './plan';
import type { Fund } from './funds';
import type { Flow } from './flow';
import type { IncomeOverview } from './income';
import { todayISO } from './dates';

/**
 * WHAT NEEDS YOU
 * --------------
 * The app knew all of this and never said any of it. Every rule below reads
 * figures that were already being computed and shown somewhere passive — a
 * goal's pace on a screen you open monthly, a budget bar three taps into
 * Settings, an income source that has not been paid.
 *
 * That is the difference between an app you read and an app that tells you.
 *
 * Two rules govern what may go in here:
 *
 *   1. **It must be actionable.** "You spent a lot on Tuesday" is an
 *      observation and belongs in Signals. "Transport passes its budget on the
 *      24th at this rate" is something you can do something about.
 *   2. **It must be true, not probable.** Nothing here may fire off a guess.
 *      Every rule below has a threshold, and where the evidence is thin the
 *      rule stays silent rather than hedging in the copy.
 */

export type AttentionTone = 'urgent' | 'warn' | 'good';

export type AttentionItem = {
  /** Stable across renders so a dismissal can be remembered. */
  id: string;
  tone: AttentionTone;
  title: string;
  detail: string;
  action?: { label: string; href: string };
  /** Higher sorts first. */
  weight: number;
};

export type AttentionInput = {
  plan: MonthlyPlan | undefined;
  flow: Flow | undefined;
  funds: Fund[];
  income: IncomeOverview | undefined;
  budgets: { categoryId: string; name: string; spentMinor: number; budgetMinor: number }[];
  peers: { personId: string; name: string; balanceMinor: number; sinceDate: string | null }[];
};

/** Days a debt may sit before it is worth mentioning. */
const STALE_DEBT_DAYS = 30;
/** How far ahead of last month before pace is worth mentioning. */
const HOT_PACE_PCT = 40;

export function getAttention(input: AttentionInput): AttentionItem[] {
  const { plan, flow, funds, income, budgets, peers } = input;
  const items: AttentionItem[] = [];
  const today = todayISO();
  const dayOfMonth = Number(today.slice(8, 10));

  /* ---- Pay that has not arrived, when it usually would have ---- */
  if (income && income.isCurrentMonth) {
    for (const src of income.sources) {
      if (src.monthMinor > 0 || src.typicalDay == null || src.dayVariance == null) continue;
      // Only once the usual window has genuinely passed.
      if (dayOfMonth <= src.typicalDay + src.dayVariance + 1) continue;
      items.push({
        id: `income:${src.categoryId}`,
        tone: 'urgent',
        title: `${src.name} not logged yet`,
        detail: `It usually lands around the ${ordinal(src.typicalDay)}. Nothing recorded this month.`,
        action: { label: 'Log income', href: '/income' },
        weight: 100,
      });
    }
  }

  /* ---- A goal that has fallen behind by more than a month's contribution ---- */
  for (const f of funds) {
    if (f.isComplete || !f.paceConfident) continue;
    const behind = -(f.paceDeltaMinor ?? 0);
    if (behind <= 0 || !f.requiredPerMonthMinor || behind < f.requiredPerMonthMinor) continue;
    items.push({
      id: `goal:${f.categoryId}`,
      tone: 'warn',
      title: `${f.name} is behind`,
      detail: `${money(behind)} short of the line. ${money(f.requiredPerMonthMinor)} a month gets it back on track.`,
      action: { label: 'Add to goal', href: '/goals' },
      weight: 80,
    });
  }

  /* ---- Budgets: broken, then about to break ---- */
  for (const b of budgets) {
    if (b.budgetMinor <= 0) continue;
    if (b.spentMinor > b.budgetMinor) {
      items.push({
        id: `budget-over:${b.categoryId}`,
        tone: 'urgent',
        title: `${b.name} is over budget`,
        detail: `${money(b.spentMinor - b.budgetMinor)} past its ${money(b.budgetMinor)} limit.`,
        action: { label: 'See the month', href: '/analytics/month' },
        weight: 90,
      });
      continue;
    }
    /*
     * On track to break it. Only in a live month, only past the first few days
     * — a rate computed from two days will predict anything.
     */
    if (!plan?.isCurrentMonth || dayOfMonth < 5) continue;
    const daysInMonth = plan.daysInMonth;
    const projected = Math.round((b.spentMinor / dayOfMonth) * daysInMonth);
    if (projected <= b.budgetMinor) continue;
    const crossesOn = Math.ceil((b.budgetMinor / b.spentMinor) * dayOfMonth);
    if (crossesOn > daysInMonth) continue;
    items.push({
      id: `budget-pace:${b.categoryId}`,
      tone: 'warn',
      title: `${b.name} will pass its budget`,
      detail: `Around the ${ordinal(crossesOn)}, at this rate. ${money(b.spentMinor)} of ${money(b.budgetMinor)} so far.`,
      action: { label: 'See the month', href: '/analytics/month' },
      weight: 60,
    });
  }

  /* ---- A debt nobody is chasing ---- */
  for (const p of peers) {
    if (p.balanceMinor <= 0 || !p.sinceDate) continue;
    const days = daysSince(p.sinceDate, today);
    if (days < STALE_DEBT_DAYS) continue;
    items.push({
      id: `debt:${p.personId}`,
      tone: 'warn',
      title: `${p.name} has owed you ${days} days`,
      detail: `${money(p.balanceMinor)} outstanding since ${p.sinceDate}.`,
      action: { label: 'Settle up', href: `/people?settle=${p.personId}` },
      weight: 50,
    });
  }

  /* ---- Running hot against the same point last month ---- */
  if (flow?.isCurrentMonth && flow.pace.deltaPct != null && flow.pace.deltaPct >= HOT_PACE_PCT) {
    items.push({
      id: 'pace:hot',
      tone: 'warn',
      title: 'Spending ahead of last month',
      detail: `${money(flow.pace.spentMinor - flow.pace.prevSameDayMinor)} more than by this day last month.`,
      action: { label: 'See where', href: '/analytics/month' },
      weight: 40,
    });
  }

  /* ---- The month is going well, and nobody ever says so ---- */
  if (
    !items.length &&
    plan?.isCurrentMonth &&
    plan.tally.known &&
    plan.tally.inHandMinor > 0 &&
    dayOfMonth >= 10
  ) {
    items.push({
      id: 'all-good',
      tone: 'good',
      title: 'On track',
      detail: `${money(plan.tally.inHandMinor)} left in hand with ${plan.daysLeft} days to go.`,
      weight: 0,
    });
  }

  return items.sort((a, b) => b.weight - a.weight);
}

function money(minor: number): string {
  return `₹${Math.round(Math.abs(minor) / 100).toLocaleString('en-IN')}`;
}

function daysSince(from: string, to: string): number {
  return Math.max(0, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000));
}

function ordinal(n: number): string {
  const s = n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th';
  return `${n}${s}`;
}
