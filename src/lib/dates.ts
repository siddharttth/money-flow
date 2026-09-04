/**
 * Dates are handled as plain 'YYYY-MM-DD' strings end to end. No Date objects
 * cross the API boundary, so nothing can shift a day due to a timezone.
 */

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** '2026-08' -> { start: '2026-08-01', end: '2026-08-31' } */
export function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${pad(last)}` };
}

export function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Monday-start week containing today. */
export function weekRange(iso = todayISO()): { start: string; end: string } {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = (dt.getUTCDay() + 6) % 7; // Mon = 0
  const start = new Date(dt);
  start.setUTCDate(dt.getUTCDate() - dow);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { start: fromDate(start), end: fromDate(end) };
}

function fromDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/**
 * Days from one date to another, exclusive — 1 Aug to 2 Aug is 1.
 *
 * `daysBetween` counts both ends, which is what "how many days in August"
 * means. It is the wrong measure for how far along a span you are: counting
 * both ends made a fund created today already 1/366th behind its own line.
 */
export function daysApart(start: string, end: string): number {
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

export function daysBetween(start: string, end: string): number {
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  return Math.round((b - a) / 86400000) + 1;
}

/**
 * A date that may be years out — a goal's target, a projected finish.
 *
 * `dayLabel` drops the year, which is right for a transaction ("15 Aug", and
 * of course it was this year) and wrong for a target ("by 15 Aug" on a goal
 * due in 2027 reads as eleven months earlier than it is).
 */
export function targetLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const sameYear = y === Number(todayISO().slice(0, 4));
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
    timeZone: 'UTC',
  });
}

/** '2026-08-23' -> '23 Aug' */
export function dayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

export function fullDayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function isValidISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  if (m < 1 || m > 12) return false;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d >= 1 && d <= last;
}

/**
 * Whole months from `from` to `to`, counting a part month as one, never below
 * zero.
 *
 * Lives here rather than beside the fund maths because the goal sheet quotes
 * the same figure live while you pick a date — and when it had its own copy
 * the two were off by one, so the sheet promised ₹9,091 a month and the saved
 * goal asked for ₹8,333. One function, one answer.
 */
export function monthsBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const whole = (ty - fy) * 12 + (tm - fm);
  return Math.max(0, whole + (td >= fd ? 0 : -1) + 1);
}
