'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { formatINR } from '@/lib/money';
import { dayLabel, monthLabel } from '@/lib/dates';

/**
 * Every chart in the app, hand-drawn in SVG.
 *
 * These replaced a charting library. Not for bundle size alone: a library's
 * defaults (its own tick type, its own tooltip chrome, its own stroke weights)
 * were the loudest thing on screen in a design built out of hairlines and one
 * accent. Drawing them here means a bar in the weekday chart and a rule under a
 * section heading are the same 1px in the same token colour.
 *
 * Shared conventions:
 *  - A viewBox in abstract units, `width: 100%` on the <svg>, and
 *    `vector-effect: non-scaling-stroke` so a 1px line is 1px at any width.
 *  - Amounts always arrive as integer paise and are formatted at the edge.
 *  - Nothing animates on mount except a single opacity fade; a chart that
 *    grows out of the axis is a toy in a ledger.
 */

const AXIS_LABEL = 'fill-[var(--text-muted)] text-[9px] font-mono tracking-wide';

/** Rounds a maximum up to a friendly axis top so the grid lines land on round numbers. */
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10]) {
    if (value <= step * magnitude) return step * magnitude;
  }
  return 10 * magnitude;
}

/* ------------------------------------------------------------------ *
 * FlowCurve — the month's cumulative spend against the month before.
 * ------------------------------------------------------------------ */

export type FlowPoint = { day: number; date: string; thisMinor: number; prevMinor: number };

export function FlowCurve({
  points,
  monthDays,
  height = 200,
}: {
  points: FlowPoint[];
  monthDays: number;
  height?: number;
}) {
  const gid = useId().replace(/:/g, '');
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const W = 1000;
  const H = 320;
  const PAD = { top: 14, right: 8, bottom: 22, left: 8 };

  const max = useMemo(
    () => niceMax(Math.max(1, ...points.map((p) => Math.max(p.thisMinor, p.prevMinor)))),
    [points],
  );

  if (points.length < 2) return null;

  // The x axis is always the full month, so a half-finished month visibly stops
  // short instead of stretching to fill the frame.
  const x = (day: number) => PAD.left + ((day - 1) / Math.max(1, monthDays - 1)) * (W - PAD.left - PAD.right);
  const y = (minor: number) => PAD.top + (1 - minor / max) * (H - PAD.top - PAD.bottom);

  const line = (key: 'thisMinor' | 'prevMinor') =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.day).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');

  const area = `${line('thisMinor')} L${x(points.at(-1)!.day).toFixed(1)},${y(0).toFixed(1)} L${x(points[0].day).toFixed(1)},${y(0).toFixed(1)} Z`;

  const active = hover != null ? points[Math.min(hover, points.length - 1)] : null;

  /*
   * Mouse only. A finger dragged up the page still emits pointermove across
   * this chart, so on a phone every scroll past the dashboard ran a setState
   * per frame and re-rendered the whole curve — the main thread was busy
   * exactly when the next tap arrived, which is how taps get dropped.
   */
  function onMove(e: React.PointerEvent) {
    if (e.pointerType !== 'mouse') return;
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box) return;
    const ratio = (e.clientX - box.left) / box.width;
    const day = Math.round(ratio * (monthDays - 1)) + 1;
    const idx = points.findIndex((p) => p.day >= day);
    setHover(idx === -1 ? points.length - 1 : idx);
  }

  return (
    <div className="relative select-none" ref={wrapRef}>
      {/* Readout sits above the plot so a finger never covers it. */}
      <div className="flex items-baseline justify-between gap-3 mb-2 min-h-[1.5rem]">
        <span className="micro">{active ? dayLabel(active.date) : 'This month'}</span>
        <span className="flex items-baseline gap-3">
          <span className="num text-sm font-semibold">
            {formatINR((active ?? points.at(-1)!).thisMinor)}
          </span>
          <span className="num text-xs" style={{ color: 'var(--text-muted)' }}>
            {formatINR((active ?? points.at(-1)!).prevMinor)} last
          </span>
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        role="img"
        aria-label="Cumulative spending this month compared with last month"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        style={{ touchAction: 'pan-y', display: 'block' }}
        onPointerDown={(e) => {
          // A deliberate tap still reads the curve; a scroll past it does not.
          if (e.pointerType === 'mouse') return;
          const box = wrapRef.current?.getBoundingClientRect();
          if (!box) return;
          const ratio = (e.clientX - box.left) / box.width;
          const day = Math.round(ratio * (monthDays - 1)) + 1;
          const idx = points.findIndex((p) => p.day >= day);
          setHover(idx === -1 ? points.length - 1 : idx);
        }}
      >
        <defs>
          <linearGradient id={`fill-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brass)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--brass)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Three quiet gridlines, no axis frame. */}
        {[0, 0.5, 1].map((t) => (
          <line
            key={t}
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(max * t)}
            y2={y(max * t)}
            stroke="var(--border)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {/* Last month, dashed and behind — a reference, not a second subject. */}
        <path
          d={line('prevMinor')}
          fill="none"
          stroke="var(--text-muted)"
          strokeWidth="1.5"
          strokeDasharray="4 4"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          opacity="0.65"
        />

        <path d={area} fill={`url(#fill-${gid})`} />
        <path
          d={line('thisMinor')}
          fill="none"
          stroke="var(--brass)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        {active && (
          <>
            <line
              x1={x(active.day)}
              x2={x(active.day)}
              y1={PAD.top}
              y2={H - PAD.bottom}
              stroke="var(--border-strong)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={x(active.day)} cy={y(active.thisMinor)} r="4" fill="var(--brass)" />
          </>
        )}

        {/* End cap on the live line, so the eye lands on where you are now. */}
        <circle cx={x(points.at(-1)!.day)} cy={y(points.at(-1)!.thisMinor)} r="3" fill="var(--brass)" />
      </svg>

      <div className="flex justify-between mt-1">
        <span className="micro">1</span>
        <span className="micro">{monthDays}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * DayBars — one thin bar per day of the month.
 * ------------------------------------------------------------------ */

export function DayBars({
  data,
  monthDays,
  height = 120,
}: {
  data: { date: string; totalMinor: number }[];
  monthDays: number;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const byDay = new Map(data.map((d) => [Number(d.date.slice(8, 10)), d.totalMinor]));
  const max = niceMax(Math.max(1, ...data.map((d) => d.totalMinor)));
  const peak = Math.max(0, ...data.map((d) => d.totalMinor));
  const peakDay = [...byDay.entries()].find(([, minor]) => minor === peak && peak > 0)?.[0] ?? null;

  const monthPrefix = data[0]?.date.slice(0, 8) ?? '';
  const shown = hover ?? peakDay;
  const shownMinor = shown === null ? 0 : (byDay.get(shown) ?? 0);

  return (
    <div>
      {/*
        A fixed-height readout above the bars. It shows the heaviest day until
        a bar is pointed at, so the row carries something either way and the
        chart never shifts as the pointer moves across it.
      */}
      <div className="flex items-baseline justify-between gap-3 mb-2 h-[1.15rem]">
        <span className="micro truncate">
          {shown === null ? '' : hover === null ? `Heaviest · ${dayLabel(`${monthPrefix}${String(shown).padStart(2, '0')}`)}` : dayLabel(`${monthPrefix}${String(shown).padStart(2, '0')}`)}
        </span>
        {shown !== null && (
          /* data-zero is the app's convention: a genuine zero recedes rather
             than competing with the figures around it. */
          <span className="num text-[12px] font-semibold shrink-0" data-zero={shownMinor === 0}>
            {formatINR(shownMinor)}
          </span>
        )}
      </div>

      <div className="flex items-end gap-[2px]" style={{ height }} onMouseLeave={() => setHover(null)}>
        {Array.from({ length: monthDays }, (_, i) => {
          const day = i + 1;
          const minor = byDay.get(day) ?? 0;
          const isPeak = minor > 0 && minor === peak;
          const isHovered = hover === day;
          return (
            /* The whole column is the target, not the bar — at 31 days a bar
               is two pixels wide and impossible to point at. */
            <div
              key={day}
              className="flex-1 h-full flex items-end min-w-0 cursor-default"
              onMouseEnter={() => setHover(day)}
              onPointerDown={(e) => {
                if (e.pointerType !== 'mouse') setHover(day);
              }}
              title={`${dayLabel(`${monthPrefix}${String(day).padStart(2, '0')}`)}: ${formatINR(minor)}`}
            >
              <div
                className="w-full rounded-[1px]"
                style={{
                  height: `${Math.max(minor > 0 ? 3 : 1, (minor / max) * 100)}%`,
                  background:
                    minor === 0 ? 'var(--border)' : isHovered ? 'var(--text)' : isPeak ? 'var(--hi)' : 'var(--brass)',
                  opacity: minor === 0 ? 1 : isHovered || isPeak ? 1 : 0.75,
                  transition: 'background 120ms ease-out, opacity 120ms ease-out',
                }}
              />
            </div>
          );
        })}
      </div>

      <div className="flex justify-between mt-1.5">
        <span className="micro">1</span>
        <span className="micro">{Math.round(monthDays / 2)}</span>
        <span className="micro">{monthDays}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * WeekdayBars — what each day of the week actually costs.
 * ------------------------------------------------------------------ */

export function WeekdayBars({
  data,
  height = 108,
}: {
  data: { label: string; avgMinor: number; totalMinor: number; count: number }[];
  height?: number;
}) {
  const max = Math.max(1, ...data.map((d) => d.avgMinor));
  const peak = Math.max(...data.map((d) => d.avgMinor));

  return (
    <div className="flex items-end gap-1.5 sm:gap-2">
      {data.map((d) => {
        const isPeak = d.avgMinor > 0 && d.avgMinor === peak;
        return (
          <div key={d.label} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
            <span
              className="num text-[10px] tabular-nums truncate w-full text-center"
              style={{ color: isPeak ? 'var(--text)' : 'var(--text-muted)' }}
            >
              {d.avgMinor > 0 ? formatINR(d.avgMinor, { compact: true }) : '—'}
            </span>
            <div className="w-full flex items-end" style={{ height }}>
              <div
                className="w-full rounded-t-[2px] transition-[height]"
                style={{
                  height: `${Math.max(d.avgMinor > 0 ? 4 : 2, (d.avgMinor / max) * 100)}%`,
                  background: d.avgMinor === 0 ? 'var(--border)' : isPeak ? 'var(--hi)' : 'var(--brass)',
                  opacity: d.avgMinor === 0 ? 1 : isPeak ? 1 : 0.6,
                  transitionDuration: '220ms',
                }}
              />
            </div>
            <span className="micro">{d.label.slice(0, 1)}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * MonthBars — the long view.
 * ------------------------------------------------------------------ */

export function MonthBars({
  data,
  activeMonth,
  onPick,
  height = 132,
}: {
  data: { month: string; totalMinor: number }[];
  activeMonth?: string;
  onPick?: (month: string) => void;
  height?: number;
}) {
  const max = niceMax(Math.max(1, ...data.map((d) => d.totalMinor)));
  const average = data.length ? Math.round(data.reduce((s, d) => s + d.totalMinor, 0) / data.length) : 0;

  return (
    <div>
      {/* Bars are capped in width and centred. With a year of history they
          fill the row; with four months they must not become billboards. */}
      <div className="relative flex items-end justify-center gap-1.5 sm:gap-2" style={{ height }}>
        {average > 0 && (
          <div
            className="absolute inset-x-0 border-t border-dashed pointer-events-none"
            style={{ bottom: `${(average / max) * 100}%`, borderColor: 'var(--border-strong)' }}
          />
        )}
        {data.map((d) => {
          const isActive = d.month === activeMonth;
          const Tag = onPick ? 'button' : 'div';
          return (
            <Tag
              key={d.month}
              {...(onPick ? { onClick: () => onPick(d.month), type: 'button' as const } : {})}
              className="flex-1 max-w-[3.25rem] h-full flex items-end min-w-0"
              title={`${monthLabel(d.month)}: ${formatINR(d.totalMinor)}`}
              aria-label={`${monthLabel(d.month)}, ${formatINR(d.totalMinor)}`}
            >
              <div
                className="w-full rounded-t-[3px]"
                style={{
                  height: `${Math.max(d.totalMinor > 0 ? 3 : 1.5, (d.totalMinor / max) * 100)}%`,
                  background: isActive ? 'var(--brass)' : d.totalMinor === 0 ? 'var(--border)' : 'var(--surface-2)',
                  outline: isActive ? 'none' : '1px solid var(--border)',
                  outlineOffset: '-1px',
                }}
              />
            </Tag>
          );
        })}
      </div>

      <div className="flex justify-center gap-1.5 sm:gap-2 mt-1.5">
        {data.map((d) => (
          <span
            key={d.month}
            className="flex-1 max-w-[3.25rem] micro text-center truncate"
            style={{ color: d.month === activeMonth ? 'var(--text)' : undefined }}
          >
            {monthLabel(d.month).slice(0, 3)}
          </span>
        ))}
      </div>

      {average > 0 && (
        <p className="micro text-center mt-3">
          dashed line: {formatINR(average)} average over {data.length} months
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Donut — category split, with the total in the hole.
 * ------------------------------------------------------------------ */

export function Donut({
  data,
  size = 168,
  thickness = 16,
  centreLabel = 'Total',
}: {
  data: { name: string; totalMinor: number; color: string }[];
  size?: number;
  thickness?: number;
  centreLabel?: string;
}) {
  const total = data.reduce((s, d) => s + d.totalMinor, 0);
  if (total <= 0) return null;

  const r = 50 - thickness / 2;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label="Spending by category">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--surface-2)" strokeWidth={thickness} />
        {data.map((d) => {
          const fraction = d.totalMinor / total;
          const dash = fraction * circumference;
          const el = (
            <circle
              key={d.name}
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke={d.color}
              strokeWidth={thickness}
              strokeDasharray={`${Math.max(dash - 1.2, 0.6)} ${circumference}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 50 50)"
              strokeLinecap="butt"
            />
          );
          offset += dash;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="micro">{centreLabel}</span>
        <span className="num text-lg font-semibold">{formatINR(total, { compact: total > 9_999_00 })}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Sparkline — a figure's recent shape, inline.
 * ------------------------------------------------------------------ */

export function Sparkline({
  values,
  width = 72,
  height = 22,
  tone = 'var(--brass)',
}: {
  values: number[];
  width?: number;
  height?: number;
  tone?: string;
}) {
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const step = width / (values.length - 1);
  const d = values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(height - (v / max) * (height - 2) - 1).toFixed(1)}`)
    .join(' ');

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden style={{ display: 'block' }}>
      <path d={d} fill="none" stroke={tone} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/* ------------------------------------------------------------------ *
 * ShareBar — proportion, in a list row.
 * ------------------------------------------------------------------ */

export function ShareBar({ share, color, height = 4 }: { share: number; color?: string; height?: number }) {
  return (
    <div
      className="rounded-full overflow-hidden w-full"
      style={{ background: 'var(--surface-2)', height }}
      role="presentation"
    >
      <div
        className="h-full rounded-full"
        style={{
          width: `${Math.min(100, Math.max(share * 100, share > 0 ? 2 : 0))}%`,
          background: color ?? 'var(--brass)',
          transition: 'width 260ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      />
    </div>
  );
}

/**
 * A two-sided bar for figures that can go either way — a category that rose or
 * fell, a balance owed or owing. Zero sits in the middle of the track.
 */
export function DeltaBar({ value, max, height = 4 }: { value: number; max: number; height?: number }) {
  const ratio = max > 0 ? Math.min(1, Math.abs(value) / max) : 0;
  const up = value >= 0;
  return (
    <div className="relative w-full" style={{ height }} role="presentation">
      <div className="absolute inset-0 rounded-full" style={{ background: 'var(--surface-2)' }} />
      <div className="absolute inset-y-0 left-1/2 w-px" style={{ background: 'var(--border-strong)' }} />
      <div
        className="absolute inset-y-0 rounded-full"
        style={{
          width: `${(ratio * 50).toFixed(2)}%`,
          [up ? 'left' : 'right']: '50%',
          background: up ? 'var(--rule-red)' : 'var(--credit)',
          transition: 'width 260ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      />
    </div>
  );
}

export { AXIS_LABEL };
