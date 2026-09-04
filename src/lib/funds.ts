import { and, asc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import { categories, expenses } from '@/db/schema';
import { sumToMinor } from './money';
import { daysApart, monthRange, todayISO } from './dates';

/**
 * FUNDS
 * -----
 * A bike, an emergency buffer, a trip. Money you are deliberately putting
 * somewhere, with a number and usually a date attached.
 *
 * A fund is not a new kind of object: it is an investment category with a
 * target on it. That choice does the heavy lifting — contributions are logged
 * through the ordinary add form, are already excluded from spending, already
 * appear in the export, already survive an import. The two extra columns turn
 * a running total into progress and, more usefully, into a required pace.
 *
 * PACE IS THE POINT. "44% of the way there" is a status; "₹5,250 a month, and
 * you are three weeks ahead" is feedback you can act on. A progress bar with
 * no pace lets someone feel fine about a goal they will miss by a year.
 *
 * What this does not model is withdrawals. It reports what you have put in,
 * the same way the investments screen does — see the note there.
 */

export type Fund = {
  categoryId: string;
  name: string;
  icon: string;
  color: string;
  targetMinor: number;
  targetDate: string | null;

  savedMinor: number;
  remainingMinor: number;
  /** 0–1, capped at 1 so an overshoot does not draw a bar off the end. */
  progress: number;
  isComplete: boolean;

  thisMonthMinor: number;
  contributionCount: number;
  firstDate: string | null;

  /** What has to go in each month from now to land on time. Null with no date. */
  requiredPerMonthMinor: number | null;
  monthsLeft: number | null;
  /** Where a straight line from the first contribution to the target says you
   *  should be today. Null until there is a date and a starting point. */
  expectedByNowMinor: number | null;
  /** Positive is ahead of that line, negative is behind. */
  paceDeltaMinor: number | null;
  /**
   * Whether the pace figure has earned the right to be believed.
   *
   * A fund three days old with one deposit in it is arithmetically "₹6,857
   * ahead of plan" and that sentence is worthless — it is one payment divided
   * by a rounding error. Below the threshold the card says the fund has just
   * started instead of dressing noise up as feedback.
   */
  paceConfident: boolean;
  /** At the rate money has actually gone in so far. Null if nothing has. */
  projectedDate: string | null;
};

/** Pace needs time on the line before it means anything. */
const PACE_MIN_DAYS = 21;
/** A projection needs a rate, and one deposit is not a rate. */
const PROJECTION_MIN_DAYS = 30;
const PROJECTION_MIN_CONTRIBUTIONS = 2;

/** Months between two ISO dates, never below zero, counting a part month as one. */
function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const whole = (ty - fy) * 12 + (tm - fm);
  return Math.max(0, whole + (td >= Number(from.slice(8, 10)) ? 0 : -1) + 1);
}

export async function getFunds(userId: string, month: string): Promise<Fund[]> {
  const { start, end } = monthRange(month);
  const today = todayISO();

  const rows = await db
    .select({
      categoryId: categories.id,
      name: categories.name,
      icon: categories.icon,
      color: categories.color,
      targetMinor: categories.targetMinor,
      targetDate: categories.targetDate,
      saved: sql<string>`COALESCE(SUM(${expenses.amountMinor}) FILTER (WHERE ${expenses.deletedAt} IS NULL), 0)`,
      thisMonth: sql<string>`COALESCE(SUM(${expenses.amountMinor}) FILTER (
        WHERE ${expenses.deletedAt} IS NULL
          AND ${expenses.expenseDate} >= ${start}
          AND ${expenses.expenseDate} <= ${end}
      ), 0)`,
      count: sql<string>`COUNT(${expenses.id}) FILTER (WHERE ${expenses.deletedAt} IS NULL)`,
      first: sql<string | null>`MIN(${expenses.expenseDate}) FILTER (WHERE ${expenses.deletedAt} IS NULL)`,
    })
    .from(categories)
    // Left join: a fund with nothing in it yet is still a fund, and is exactly
    // the one most worth showing.
    .leftJoin(expenses, eq(expenses.categoryId, categories.id))
    .where(and(eq(categories.userId, userId), isNotNull(categories.targetMinor), eq(categories.isActive, true)))
    .groupBy(
      categories.id,
      categories.name,
      categories.icon,
      categories.color,
      categories.targetMinor,
      categories.targetDate,
      categories.sortOrder,
    )
    .orderBy(asc(categories.sortOrder), asc(categories.name));

  return rows.map((r) => {
    const targetMinor = r.targetMinor ?? 0;
    const savedMinor = sumToMinor(r.saved);
    const remainingMinor = Math.max(0, targetMinor - savedMinor);
    const firstDate = r.first ?? null;

    const contributionCount = Number(r.count);
    const daysRunning = firstDate ? daysApart(firstDate, today) : 0;

    let requiredPerMonthMinor: number | null = null;
    let monthsLeft: number | null = null;
    let expectedByNowMinor: number | null = null;
    let paceDeltaMinor: number | null = null;

    if (r.targetDate) {
      monthsLeft = monthsBetween(today, r.targetDate);
      requiredPerMonthMinor = monthsLeft > 0 ? Math.ceil(remainingMinor / monthsLeft) : remainingMinor;

      /*
       * The line runs from the day the fund started to its target date. Using
       * the first contribution rather than the day the category was created
       * keeps a fund set up months before anyone paid into it from reporting
       * an alarming deficit on day one.
       */
      const startDate = firstDate ?? today;
      const span = daysApart(startDate, r.targetDate);
      const elapsed = daysApart(startDate, today);
      if (span > 0) {
        const ratio = Math.max(0, Math.min(1, elapsed / span));
        expectedByNowMinor = Math.round(targetMinor * ratio);
        paceDeltaMinor = savedMinor - expectedByNowMinor;
      }
    }

    /*
     * Where the current rate lands, which is often not where the plan says.
     * Gated, because dividing one deposit by the three days since it was made
     * projects a bike by next month and is pure fiction.
     */
    let projectedDate: string | null = null;
    if (
      firstDate &&
      savedMinor > 0 &&
      remainingMinor > 0 &&
      contributionCount >= PROJECTION_MIN_CONTRIBUTIONS &&
      daysRunning >= PROJECTION_MIN_DAYS
    ) {
      const days = Math.max(1, daysApart(firstDate, today));
      const perDay = savedMinor / days;
      if (perDay > 0) {
        const daysNeeded = Math.ceil(remainingMinor / perDay);
        const t = new Date(`${today}T00:00:00Z`);
        t.setUTCDate(t.getUTCDate() + daysNeeded);
        projectedDate = t.toISOString().slice(0, 10);
      }
    }

    return {
      categoryId: r.categoryId,
      name: r.name,
      icon: r.icon,
      color: r.color,
      targetMinor,
      targetDate: r.targetDate,
      savedMinor,
      remainingMinor,
      progress: targetMinor > 0 ? Math.min(1, savedMinor / targetMinor) : 0,
      isComplete: targetMinor > 0 && savedMinor >= targetMinor,
      thisMonthMinor: sumToMinor(r.thisMonth),
      contributionCount,
      firstDate,
      requiredPerMonthMinor,
      monthsLeft,
      expectedByNowMinor,
      paceDeltaMinor,
      paceConfident: paceDeltaMinor != null && daysRunning >= PACE_MIN_DAYS,
      projectedDate,
    };
  });
}

/**
 * What every unfinished fund needs this month, put together.
 *
 * This is what makes a savings target something the app can derive rather than
 * ask for: your goals already state it. It feeds straight into safe-to-spend.
 */
export function requiredSavingsMinor(funds: Fund[]): number {
  return funds
    .filter((f) => !f.isComplete && f.requiredPerMonthMinor)
    .reduce((s, f) => s + (f.requiredPerMonthMinor ?? 0), 0);
}
