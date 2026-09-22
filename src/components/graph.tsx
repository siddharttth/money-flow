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
      {/*
        The readout as the reference draws it: two labelled columns, this
        period against the same point in the last, rather than one figure with
        a trailing "last". Above the plot, so a finger never covers it.
      */}
      <div className="flex items-start justify-between gap-3 mb-3 min-h-[2.4rem]">
        <span className="micro pt-1">{active ? dayLabel(active.date) : 'This month'}</span>
        <span
          className="flex items-stretch rounded-lg overflow-hidden text-right"
          style={{ background: 'var(--surface-2)' }}
        >
          <span className="px-3 py-1.5">
            <span className="micro block" style={{ color: 'var(--accent)' }}>
              This month
            </span>
            <span className="num text-[13px] font-semibold">
              {formatINR((active ?? points.at(-1)!).thisMinor)}
            </span>
          </span>
          <span className="px-3 py-1.5 border-l" style={{ borderColor: 'var(--border)' }}>
            <span className="micro block">Last month</span>
            <span className="num text-[13px] font-semibold muted">
              {formatINR((active ?? points.at(-1)!).prevMinor)}
            </span>
          </span>
        </span>
      </div>

      {/* A scale down the left, so a height can be read as an amount rather
          than only compared with the height beside it. */}
      <div className="flex gap-3">
        <div className="flex flex-col justify-between shrink-0 pb-[22px]" style={{ height }}>
          {[max, max * 0.5, 0].map((t) => (
            <span key={t} className="micro leading-none">
              {t === 0 ? '0' : formatINR(t, { compact: true })}
            </span>
          ))}
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
            <stop offset="0%" stopColor="var(--brass)" stopOpacity="0.3" />
            <stop offset="55%" stopColor="var(--brass)" stopOpacity="0.08" />
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
        {/* Drawn twice: a soft wide pass underneath for the bloom, then the
            crisp line on top. An SVG filter would blur the whole layer and
            cost a compositor pass on every hover frame. */}
        <path
          d={line('thisMinor')}
          fill="none"
          stroke="var(--brass)"
          strokeWidth="6"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          opacity="0.18"
        />
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

        {/* TODAY. A dashed rule down the live end of the line, and a dotted
            run-out to the end of the month — the part that has not happened
            yet, drawn as clearly unwritten rather than left blank. */}
        {points.at(-1)!.day < monthDays && (
          <>
            <line
              x1={x(points.at(-1)!.day)}
              x2={x(points.at(-1)!.day)}
              y1={PAD.top}
              y2={H - PAD.bottom}
              stroke="var(--brass)"
              strokeWidth="1"
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
              opacity="0.7"
            />
            <line
              x1={x(points.at(-1)!.day)}
              y1={y(points.at(-1)!.thisMinor)}
              x2={x(monthDays)}
              y2={y(Math.min(max, (points.at(-1)!.thisMinor / points.at(-1)!.day) * monthDays))}
              stroke="var(--brass)"
              strokeWidth="1.5"
              strokeDasharray="2 5"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              opacity="0.45"
            />
          </>
        )}

        {/* End cap on the live line, so the eye lands on where you are now. */}
        <circle cx={x(points.at(-1)!.day)} cy={y(points.at(-1)!.thisMinor)} r="3" fill="var(--brass)" />
      </svg>
      </div>

      {/* Five stops rather than two ends — "Day 14" is a place, "1 … 30" is a
          range you have to measure against. */}
      <div className="flex justify-between mt-1.5 pl-10">
        {axisDays(monthDays, points.at(-1)!.day).map((d) => (
          <span
            key={d.day}
            className="micro"
            style={d.isToday ? { color: 'var(--accent)' } : undefined}
          >
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Five evenly spaced day labels, with today named where it falls. */
function axisDays(monthDays: number, today: number) {
  const stops = [1, Math.round(monthDays * 0.25), Math.round(monthDays * 0.5), Math.round(monthDays * 0.75), monthDays];
  const out = stops.map((day) => ({ day, label: `Day ${day}`, isToday: false }));
  if (today > 1 && today < monthDays) {
    // Replace whichever stop today is nearest, so the labels never collide.
    let nearest = 0;
    for (let i = 1; i < out.length - 1; i++) {
      if (Math.abs(out[i].day - today) < Math.abs(out[nearest].day - today)) nearest = i;
    }
    out[nearest] = { day: today, label: `Today (${today})`, isToday: true };
  }
  return out;
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
  /** Value labels above each bar and a scale down the left, as the reference
   *  charts carry. Off by default — a sparkline-sized chart cannot hold them. */
  detailed = false,
  averageLabel,
}: {
  data: { month: string; totalMinor: number }[];
  activeMonth?: string;
  onPick?: (month: string) => void;
  height?: number;
  detailed?: boolean;
  averageLabel?: string;
}) {
  const max = niceMax(Math.max(1, ...data.map((d) => d.totalMinor)));
  const average = data.length ? Math.round(data.reduce((s, d) => s + d.totalMinor, 0) / data.length) : 0;
  /* Three gridlines and the baseline — enough to read a height against, few
     enough to stay out of the way of the bars. Exact thirds, not 0.66/0.33:
     a ₹15,000 scale must read 15K · 10K · 5K · 0, not 15K · 9.9K · 5K. */
  const ticks = [max, (max * 2) / 3, max / 3, 0];

  return (
    <div>
      <div className={detailed ? 'flex gap-3' : undefined}>
        {detailed && (
          <div className="flex flex-col justify-between shrink-0" style={{ height }}>
            {ticks.map((t) => (
              <span key={t} className="micro leading-none">
                {t === 0 ? '₹0' : formatINR(t, { compact: true })}
              </span>
            ))}
          </div>
        )}

        <div className="flex-1 min-w-0">
          {/* Bars are capped in width and centred. With a year of history they
              fill the row; with four months they must not become billboards. */}
          <div className="relative flex items-end justify-center gap-1.5 sm:gap-2" style={{ height }}>
            {detailed &&
              ticks.slice(0, -1).map((t) => (
                <div
                  key={t}
                  className="absolute inset-x-0 border-t pointer-events-none"
                  style={{ bottom: `${(t / max) * 100}%`, borderColor: 'var(--border)', opacity: 0.6 }}
                />
              ))}

            {average > 0 && (
              <div
                className="absolute inset-x-0 border-t border-dashed pointer-events-none flex justify-end"
                style={{ bottom: `${(average / max) * 100}%`, borderColor: 'var(--border-strong)' }}
              >
                {detailed && (
                  <span
                    className="num text-[10px] px-1.5 py-0.5 rounded -translate-y-1/2"
                    style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}
                  >
                    {averageLabel ?? `Avg ${formatINR(average, { compact: true })}`}
                  </span>
                )}
              </div>
            )}

            {data.map((d) => {
              const isActive = d.month === activeMonth;
              const Tag = onPick ? 'button' : 'div';
              return (
                <Tag
                  key={d.month}
                  {...(onPick ? { onClick: () => onPick(d.month), type: 'button' as const } : {})}
                  className="group relative flex-1 max-w-[3.25rem] h-full flex items-end min-w-0"
                  title={`${monthLabel(d.month)}: ${formatINR(d.totalMinor)}`}
                  aria-label={`${monthLabel(d.month)}, ${formatINR(d.totalMinor)}`}
                >
                  {detailed && d.totalMinor > 0 && (
                    <span
                      className="num absolute inset-x-0 text-[10px] text-center -translate-y-1.5 whitespace-nowrap"
                      style={{
                        bottom: `${Math.min(92, (d.totalMinor / max) * 100)}%`,
                        color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                      }}
                    >
                      {formatINR(d.totalMinor, { compact: d.totalMinor > 99_999 })}
                    </span>
                  )}
                  <div
                    className="w-full rounded-t-[3px] transition-opacity"
                    style={{
                      height: `${Math.max(d.totalMinor > 0 ? 3 : 1.5, (d.totalMinor / max) * 100)}%`,
                      background: isActive
                        ? 'var(--brass)'
                        : d.totalMinor === 0
                          ? 'var(--border)'
                          : 'var(--surface-2)',
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
        </div>
      </div>

      {average > 0 && !detailed && (
        <p className="micro text-center mt-3">
          dashed line: {formatINR(average)} average over {data.length} months
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Bubbles — a category split as proportional area.
 * ------------------------------------------------------------------ */

/**
 * The same numbers a donut carries, read as size rather than as arc length.
 *
 * A donut is precise and slow: comparing two arcs means comparing two angles.
 * Circles compare at a glance, which is what a dashboard wants — the biggest
 * one is obviously the biggest. AREA is proportional to the amount, not
 * radius, or a category twice the size would look four times as big.
 *
 * Laid out deterministically rather than by a force simulation: the leader
 * sits centred and the rest ring it clockwise by size. A simulation would move
 * on every render and animate for no reason.
 */
export function CategoryBubbles({
  data,
  size = 240,
}: {
  data: { name: string; totalMinor: number; color: string }[];
  size?: number;
}) {
  const top = data.filter((d) => d.totalMinor > 0).slice(0, 5);
  const total = top.reduce((s, d) => s + d.totalMinor, 0);
  if (!top.length || total <= 0) return null;

  const [lead, ...rest] = top;
  const cx = size / 2;
  const cy = size / 2;
  const leadR = size * 0.235;

  /* Radius from area: r = R·√(share / leadShare), floored so a 2% slice is
     still a legible disc rather than a dot. */
  const radiusFor = (minor: number) =>
    Math.max(size * 0.085, leadR * Math.sqrt(minor / lead.totalMinor));

  const orbit = size * 0.375;
  const placed = rest.map((d, i) => {
    const angle = (-Math.PI / 2) + (i * 2 * Math.PI) / Math.max(rest.length, 1) + Math.PI / 5;
    return { ...d, r: radiusFor(d.totalMinor), x: cx + Math.cos(angle) * orbit, y: cy + Math.sin(angle) * orbit };
  });

  const pct = (minor: number) => Math.round((minor / total) * 100);

  return (
    <div className="relative mx-auto shrink-0" style={{ width: size, height: size }}>
      {placed.map((d) => (
        <span
          key={d.name}
          title={`${d.name}: ${formatINR(d.totalMinor)}`}
          className="absolute rounded-full flex flex-col items-center justify-center text-center leading-none"
          style={{
            width: d.r * 2,
            height: d.r * 2,
            left: d.x - d.r,
            top: d.y - d.r,
            background: `color-mix(in oklab, ${d.color} 26%, var(--surface-2))`,
            border: `1px solid color-mix(in oklab, ${d.color} 45%, transparent)`,
          }}
        >
          <span className="num text-[12px] font-bold">{pct(d.totalMinor)}%</span>
          <span className="text-[9px] muted truncate max-w-[85%] mt-0.5">{d.name}</span>
        </span>
      ))}

      {/* The leader last, so it layers above anything that crowds it. */}
      <span
        title={`${lead.name}: ${formatINR(lead.totalMinor)}`}
        className="absolute rounded-full flex flex-col items-center justify-center text-center leading-none"
        style={{
          width: leadR * 2,
          height: leadR * 2,
          left: cx - leadR,
          top: cy - leadR,
          background: `color-mix(in oklab, ${lead.color} 55%, var(--surface))`,
          border: `1px solid ${lead.color}`,
          boxShadow: `0 0 28px -6px color-mix(in oklab, ${lead.color} 55%, transparent)`,
        }}
      >
        <span className="num text-[20px] font-bold">{pct(lead.totalMinor)}%</span>
        <span className="text-[10px] font-semibold truncate max-w-[80%] mt-0.5">{lead.name}</span>
        <span className="num text-[10px] muted mt-0.5">
          {formatINR(lead.totalMinor, { compact: lead.totalMinor > 99_999 })}
        </span>
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Donut — category split, with the total in the hole.
 * ------------------------------------------------------------------ */

/**
 * A ranked, tonal palette for a proportional breakdown.
 *
 * The reference does not colour these segments by category — it runs a scale
 * from the system's lime through to its coral, biggest share first, so the
 * ring reads as an ordered sequence rather than a bag of unrelated hues. A
 * category's own colour still identifies it everywhere it appears as a row;
 * here the position in the ranking is the thing being shown.
 */
export const SEGMENT_TONES = [
  'var(--lime)',
  'var(--fiscal-green)',
  'color-mix(in oklab, var(--lime) 55%, white)',
  'color-mix(in oklab, var(--coral) 45%, white)',
  'var(--coral)',
  'color-mix(in oklab, var(--coral) 60%, var(--text-muted))',
];

export const segmentTone = (i: number) => SEGMENT_TONES[i % SEGMENT_TONES.length];

export function Donut({
  data,
  size = 168,
  thickness = 13,
  centreLabel = 'Total',
  /** Colour by rank rather than by the category's own hue. */
  ranked = false,
}: {
  data: { name: string; totalMinor: number; color: string }[];
  size?: number;
  thickness?: number;
  centreLabel?: string;
  ranked?: boolean;
}) {
  const total = data.reduce((s, d) => s + d.totalMinor, 0);
  if (total <= 0) return null;

  const r = 50 - thickness / 2;
  const circumference = 2 * Math.PI * r;
  /* A real gap between segments, in degrees of arc. Butt-joined slices on a
     dark ground merge into one another; the ring has to be readable as parts. */
  const gap = data.length > 1 ? circumference * 0.012 : 0;
  let offset = 0;

  return (
    <div className="relative mx-auto shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label="Spending by category">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--surface-2)" strokeWidth={thickness} />
        {data.map((d, i) => {
          const fraction = d.totalMinor / total;
          const dash = fraction * circumference;
          const tone = ranked ? segmentTone(i) : d.color;
          const el = (
            <circle
              key={d.name}
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke={tone}
              strokeWidth={thickness}
              strokeDasharray={`${Math.max(dash - gap, 0.6)} ${circumference}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 50 50)"
              /* Rounded caps, as the reference draws them — the ring reads as
                 a set of separate arcs rather than one divided band. */
              strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 3px color-mix(in oklab, ${tone} 45%, transparent))` }}
            />
          );
          offset += dash;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="num text-[22px] font-bold leading-none">{centreLabel}</span>
        <span className="num text-[12px] muted mt-1">
          {formatINR(total, { compact: total > 9_999_00 })}
        </span>
      </div>
    </div>
  );
}

/**
 * The legend beside a ranked donut: a dot, a name, the amount, the share.
 *
 * Deliberately not `BreakdownList` — that draws an icon tile and a progress
 * bar per row, which is the right density for a list you are choosing from
 * and far too much beside a chart that has already shown the proportions.
 * Repeating the ring as eight bars says the same thing twice and louder.
 */
export function SegmentLegend({
  items,
  onPick,
}: {
  items: { id: string; name: string; totalMinor: number; share: number }[];
  onPick?: (id: string) => void;
}) {
  return (
    <ul className="space-y-2.5 min-w-0 flex-1">
      {items.map((it, i) => {
        const Tag = onPick ? 'button' : 'div';
        return (
          <li key={it.id}>
            <Tag
              {...(onPick ? { type: 'button' as const, onClick: () => onPick(it.id) } : {})}
              className="w-full flex items-baseline gap-2.5 text-left group"
            >
              <span
                className="w-2 h-2 rounded-full shrink-0 translate-y-[-1px]"
                style={{
                  background: segmentTone(i),
                  boxShadow: `0 0 6px -1px color-mix(in oklab, ${segmentTone(i)} 70%, transparent)`,
                }}
                aria-hidden
              />
              <span className="text-[13px] truncate flex-1 group-hover:underline">{it.name}</span>
              <span className="num text-[12px] muted shrink-0">{formatINR(it.totalMinor)}</span>
              <span className="num text-[13px] font-semibold shrink-0 w-10 text-right">
                {Math.round(it.share * 100)}%
              </span>
            </Tag>
          </li>
        );
      })}
    </ul>
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

export function ShareBar({
  share,
  color,
  height = 4,
  /**
   * Goal and budget bars overshoot by a hair on the way to their new value.
   * It reads as effort — the right feeling for a bar that has just moved
   * forward — and would be noise on a static breakdown, so it is opt-in.
   */
  spring = false,
}: {
  share: number;
  color?: string;
  height?: number;
  spring?: boolean;
}) {
  const base = color ?? 'var(--brass)';

  return (
    <div
      className="rounded-full overflow-hidden w-full"
      style={{ background: 'var(--surface-2)', height }}
      role="presentation"
    >
      <div
        className={`h-full rounded-full ${spring ? 'grow-spring' : 'grow'}`}
        style={{
          width: `${Math.min(100, Math.max(share * 100, share > 0 ? 2 : 0))}%`,
          /*
           * A gradient along the fill and a glow off it, as every bar in the
           * reference carries. A flat block of colour is the one thing that
           * makes a dark UI look unfinished — the light has to come from
           * somewhere, and here it comes off the bar itself.
           */
          background: `linear-gradient(90deg, color-mix(in oklab, ${base} 70%, var(--surface-2)) 0%, ${base} 55%, color-mix(in oklab, ${base} 80%, white) 100%)`,
          boxShadow: `0 0 12px -2px color-mix(in oklab, ${base} 55%, transparent)`,
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
