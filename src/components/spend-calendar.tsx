'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatINR } from '@/lib/money';
import { fullDayLabel, todayISO } from '@/lib/dates';
import type { CalendarDay } from '@/lib/analytics';

/**
 * EVERY DAY, AT A GLANCE — a year to a strip.
 *
 * Laid out the way a contribution graph is: one column per week, one row per
 * weekday, a calendar year across. The shape of a habit shows without reading
 * a figure — the weekends, the payday week, the quiet stretch — and a year
 * fits in one glance where month blocks needed four screens. Years are tabs.
 *
 * Three kinds of square, and they must not be confused:
 *  - a day with spending, in one of four shades of the accent;
 *  - a tracked day that cost nothing — filled, but plain;
 *  - a day with no record at all (before tracking began, or still to come) —
 *    an outline only.
 * "Spent nothing" is an achievement and "no record" is an absence; drawing
 * them the same would flatter a gap in the record.
 *
 * Nothing animates. Hovering (or tapping, on a phone) reads a day out; a
 * click — or a second tap — opens that day in Transactions. On a narrow
 * screen the strip scrolls sideways and opens on the latest weeks.
 */

/** How much accent is mixed into each spending shade, quietest first. */
const SHADES = [26, 46, 70, 100];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ROW_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', ''];

type Cell = { date: string; kind: 'none' | 'zero' | 'spent'; day?: CalendarDay; level?: number };

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function SpendCalendar({ firstDate, days }: { firstDate: string | null; days: CalendarDay[] }) {
  const router = useRouter();
  const wrap = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  /* Read on pointer-down: not every browser says on a click what did it. */
  const lastPointer = useRef('mouse');
  const today = todayISO();
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const [active, setActive] = useState<{ date: string; x: number; y: number; touch: boolean } | null>(null);

  /* A narrow strip opens on the weeks you are most likely to look for: this
     year with today near the right edge (the recent past in view, not the
     empty weeks still to come), a past year from its start. */
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const now = el.querySelector<HTMLElement>('[data-today]');
    el.scrollLeft = now ? Math.max(0, now.offsetLeft + now.offsetWidth - el.clientWidth * 0.85) : 0;
  }, [year, today]);

  if (!firstDate) return null;

  const byDate = new Map(days.map((d) => [d.date, d]));
  const firstYear = Number(firstDate.slice(0, 4));
  const years: number[] = [];
  for (let y = Number(today.slice(0, 4)); y >= firstYear; y--) years.push(y);

  /* Shades by quartile of every day with any spending, across all years, so
     one scale reads the same in every tab and fits this person's spending. */
  const sorted = days.map((d) => d.totalMinor).filter((v) => v > 0).sort((a, b) => a - b);
  const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
  const cuts = [q(0.25), q(0.5), q(0.75)];
  const levelOf = (minor: number) => cuts.filter((c) => minor > c).length;

  /* Columns run Monday to Sunday, from the week holding 1 January to the week
     holding 31 December. Days outside the year leave their slot empty. */
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const start = new Date(jan1);
  start.setUTCDate(start.getUTCDate() - ((jan1.getUTCDay() + 6) % 7));
  const dec31 = iso(new Date(Date.UTC(year, 11, 31)));
  const cells: (Cell | null)[] = [];
  for (const d = new Date(start); iso(d) <= dec31 || cells.length % 7; d.setUTCDate(d.getUTCDate() + 1)) {
    const date = iso(d);
    if (date.slice(0, 4) !== String(year)) {
      cells.push(null);
      continue;
    }
    const day = byDate.get(date);
    if (date < firstDate || date > today) cells.push({ date, kind: 'none' });
    else if (day && day.totalMinor > 0) cells.push({ date, kind: 'spent', day, level: levelOf(day.totalMinor) });
    else cells.push({ date, kind: 'zero' });
  }
  const weeks = cells.length / 7;
  /* Each month's label sits over the week its 1st falls in. */
  const monthCols = MONTHS.map((_, m) => {
    const first = iso(new Date(Date.UTC(year, m, 1)));
    return Math.floor(cells.findIndex((c) => c?.date === first) / 7);
  });

  const inYear = cells.filter((c): c is Cell => !!c);
  const yearTotal = inYear.reduce((s, c) => s + (c.day?.totalMinor ?? 0), 0);
  const spentDays = inYear.filter((c) => c.kind === 'spent').length;
  const zeroDays = inYear.filter((c) => c.kind === 'zero').length;

  function point(date: string, el: HTMLElement, touch: boolean) {
    const box = wrap.current?.getBoundingClientRect();
    const cell = el.getBoundingClientRect();
    if (!box) return;
    setActive({ date, x: cell.left - box.left + cell.width / 2, y: cell.top - box.top, touch });
  }
  const open = (date: string) => router.push(`/expenses?day=${date}`);
  const tip = active ? byDate.get(active.date) : null;
  const grid = { gridTemplateColumns: `repeat(${weeks}, minmax(11px, 1fr))` };

  return (
    <div ref={wrap} className="relative" onPointerLeave={() => active?.touch || setActive(null)}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        {/* One tab per year with any record, newest first. */}
        <div className="flex gap-1.5" role="tablist" aria-label="Year">
          {years.map((y) => (
            <button
              key={y}
              type="button"
              role="tab"
              aria-selected={y === year}
              className="num text-[12px] font-semibold px-2.5 py-1 rounded-md transition-colors"
              style={
                y === year
                  ? { background: 'var(--brass)', color: 'var(--on-brass)' }
                  : { background: 'var(--surface-2)', color: 'var(--text-muted)' }
              }
              onClick={() => {
                setYear(y);
                setActive(null);
              }}
            >
              {y}
            </button>
          ))}
        </div>
        <p className="text-[12px] muted">
          <span className="num font-semibold" style={{ color: 'var(--text)' }}>
            {formatINR(yearTotal)}
          </span>{' '}
          in {year} · spent on {spentDays} {spentDays === 1 ? 'day' : 'days'} · {zeroDays} no-spend{' '}
          {zeroDays === 1 ? 'day' : 'days'}
        </p>
      </div>

      <div className="flex gap-2">
        {/* Weekday labels, pinned while the strip scrolls. */}
        <div className="grid grid-rows-[auto_repeat(7,1fr)] gap-[3px] shrink-0 pt-px">
          <span className="micro leading-none pb-1.5">&nbsp;</span>
          {ROW_LABELS.map((l, i) => (
            <span key={i} className="micro leading-none flex items-center text-[9px]">
              {l}
            </span>
          ))}
        </div>

        <div ref={scroller} className="min-w-0 flex-1 overflow-x-auto pb-1" style={{ scrollbarWidth: 'thin' }}>
          <div className="min-w-[640px]">
            <div className="grid gap-[3px] mb-1.5" style={grid}>
              {monthCols.map((col, m) => (
                <span
                  key={m}
                  className="micro leading-none text-[9px] whitespace-nowrap"
                  style={{ gridColumn: `${col + 1} / span 4`, gridRow: 1 }}
                >
                  {MONTHS[m]}
                </span>
              ))}
            </div>
            <div className="grid grid-rows-7 grid-flow-col gap-[3px]" style={grid}>
              {cells.map((c, i) => {
                if (!c) return <span key={`e${i}`} aria-hidden className="aspect-square" />;
                const ring =
                  c.date === today ? { outline: '1.5px solid var(--accent)', outlineOffset: '1px' } : {};
                if (c.kind === 'none') {
                  return (
                    <span
                      key={c.date}
                      aria-hidden
                      className="aspect-square rounded-[2px]"
                      style={{ border: '1px solid var(--border)', opacity: 0.5, ...ring }}
                    />
                  );
                }
                const bg =
                  c.kind === 'zero'
                    ? 'var(--surface-2)'
                    : `color-mix(in oklab, var(--accent) ${SHADES[c.level!]}%, var(--surface-2))`;
                const label =
                  c.kind === 'zero'
                    ? `${fullDayLabel(c.date)}: nothing spent`
                    : `${fullDayLabel(c.date)}: ${formatINR(c.day!.totalMinor)}, mostly ${c.day!.top?.name ?? 'uncategorised'}`;
                return (
                  <button
                    key={c.date}
                    type="button"
                    aria-label={label}
                    data-today={c.date === today || undefined}
                    className="aspect-square rounded-[2px] cursor-pointer focus-visible:outline-2"
                    style={{ background: bg, ...ring }}
                    onPointerEnter={(e) => e.pointerType === 'mouse' && point(c.date, e.currentTarget, false)}
                    onPointerLeave={(e) => e.pointerType === 'mouse' && setActive(null)}
                    onFocus={(e) => point(c.date, e.currentTarget, false)}
                    onBlur={() => setActive(null)}
                    onPointerDown={(e) => (lastPointer.current = e.pointerType)}
                    onClick={(e) => {
                      // A mouse opens the day; a first tap reads it, a second opens it.
                      const touch = lastPointer.current !== 'mouse';
                      lastPointer.current = 'mouse';
                      if (!touch || (active?.date === c.date && active.touch)) open(c.date);
                      else point(c.date, e.currentTarget, true);
                    }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* The key: the two kinds of empty, then the four shades. */}
      <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 mt-4 micro">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-[2px]" style={{ border: '1px solid var(--border)', opacity: 0.7 }} />
          No record
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-[2px]" style={{ background: 'var(--surface-2)' }} />
          Nothing spent
        </span>
        <span className="inline-flex items-center gap-1.5">
          Less
          {SHADES.map((p) => (
            <span
              key={p}
              className="w-2.5 h-2.5 rounded-[2px]"
              style={{ background: `color-mix(in oklab, var(--accent) ${p}%, var(--surface-2))` }}
            />
          ))}
          More
        </span>
      </div>

      {active && (
        <div
          role="tooltip"
          className={`absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg px-2.5 py-2 whitespace-nowrap ${active.touch ? '' : 'pointer-events-none'}`}
          style={{
            left: Math.max(90, Math.min(active.x, (wrap.current?.clientWidth ?? 0) - 90)),
            top: active.y - 6,
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            boxShadow: '0 8px 24px -8px rgb(0 0 0 / 0.5)',
          }}
        >
          <p className="micro leading-none">{fullDayLabel(active.date)}</p>
          {tip && tip.totalMinor > 0 ? (
            <>
              <p className="text-[13px] font-semibold mt-1.5">
                <span className="num">{formatINR(tip.totalMinor)}</span>
                <span className="muted font-normal text-[11.5px]">
                  {' '}
                  · {tip.count} {tip.count === 1 ? 'entry' : 'entries'}
                </span>
              </p>
              {tip.top && (
                <p className="text-[11.5px] muted mt-0.5 inline-flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: tip.top.color }} />
                  Mostly {tip.top.name}
                </p>
              )}
            </>
          ) : (
            <p className="text-[13px] font-semibold mt-1.5">Nothing spent</p>
          )}
          {active.touch && (
            <button
              type="button"
              className="micro micro-link block mt-1.5"
              style={{ color: 'var(--accent)' }}
              onClick={() => open(active.date)}
            >
              Open day →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
