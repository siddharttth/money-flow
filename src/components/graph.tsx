'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { formatINR } from '@/lib/money';
import { dayLabel, monthLabel } from '@/lib/dates';
import { useGrowClass, useReducedMotion, useTween } from './motion';

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
  /**
   * Label the axis with real dates — "Sep 06" rather than "Day 6". On a
   * screen already headed September the day number alone is ambiguous with
   * every other number on the page.
   */
  dated = false,
  fill = false,
  live = false,
  names,
  whatIf,
}: {
  points: FlowPoint[];
  monthDays: number;
  height?: number;
  dated?: boolean;
  /** Grow to the height of the container, with `height` as the floor. The
      plot is drawn with preserveAspectRatio="none", so it stretches cleanly. */
  fill?: boolean;
  /** The month is still under way: its last point is today, still moving. */
  live?: boolean;
  /**
   * The two months by name, for the key above the chart and the readout.
   * Without them the chart relies on the caption around it.
   */
  names?: { current: string; previous: string };
  /**
   * A handle on the end of the projection, for the month still under way:
   * drag it to try a daily rate for the days that are left and read where the
   * month would land. Exploratory only — nothing is saved, and it resets on
   * leaving the page or on Reset. It never proposes a rate of its own.
   */
  whatIf?: {
    /** The month's own pace and projection, as the dashboard states them —
        the handle rests there, and the readout repeats them until dragged. */
    paceMinor: number;
    projectedMinor: number;
    prevFullMinor: number;
    monthName: string;
    prevMonthName: string;
  };
}) {
  const gid = useId().replace(/:/g, '');
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  /** The daily rate being tried, in paise; null is the real pace. */
  const [tryRate, setTryRate] = useState<number | null>(null);
  const dragging = useRef(false);
  /** A finger on the chart: where it went down, and whether it has turned
      into a sideways scrub (as opposed to a scroll, which the browser keeps). */
  const touch = useRef<{ x: number; y: number; scrubbing: boolean } | null>(null);

  const W = 1000;
  const H = 320;
  const PAD = { top: 14, right: 8, bottom: 22, left: 8 };

  const last = points.at(-1);
  /*
   * Today's total, eased when it changes — a transaction added while you are
   * looking moves the newest segment into place rather than snapping it.
   * Only that point: the rest of the line is history and never re-animates,
   * and nothing moves on arrival (useTween waits for the page to settle).
   */
  const lastShown = useTween(last?.thisMinor ?? 0);
  const remaining = last ? monthDays - last.day : 0;
  const planning = !!whatIf && !!last && remaining > 0 && last.day > 0;
  const paceRate = whatIf?.paceMinor ?? 0;
  const paceEnd = whatIf?.projectedMinor ?? 0;
  /** Where the month lands at the rate on screen: the real projection until
      a rate is tried. */
  const planEnd = tryRate == null ? paceEnd : (last?.thisMinor ?? 0) + tryRate * remaining;

  const max = useMemo(
    () =>
      niceMax(
        Math.max(
          1,
          ...points.map((p) => Math.max(p.thisMinor, p.prevMinor)),
          /* Room above the projection to drag into, when there is one. */
          ...(planning ? [paceEnd * 1.2, (whatIf?.prevFullMinor ?? 0) * 1.1] : []),
        ),
      ),
    [points, planning, paceEnd, whatIf?.prevFullMinor],
  );

  if (points.length < 2 || !last) return null;

  /* The line as drawn: history as it is, today where the ease has got to. */
  const drawn = points.map((p, i) => (i === points.length - 1 ? { ...p, thisMinor: lastShown } : p));
  const today = drawn.at(-1)!;
  /* A month with nothing in it to compare against says so in words, rather
     than drawing a flat dashed line along the axis and calling it a comparison. */
  const hasPrev = points.some((p) => p.prevMinor > 0);

  // The x axis is always the full month, so a half-finished month visibly stops
  // short instead of stretching to fill the frame.
  const x = (day: number) => PAD.left + ((day - 1) / Math.max(1, monthDays - 1)) * (W - PAD.left - PAD.right);
  const y = (minor: number) => PAD.top + (1 - minor / max) * (H - PAD.top - PAD.bottom);
  const pctX = (day: number) => (x(day) / W) * 100;
  const pctY = (minor: number) => (y(minor) / H) * 100;

  const line = (key: 'thisMinor' | 'prevMinor') =>
    drawn.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.day).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');

  const area = `${line('thisMinor')} L${x(today.day).toFixed(1)},${y(0).toFixed(1)} L${x(drawn[0].day).toFixed(1)},${y(0).toFixed(1)} Z`;

  /* The run-out to the month's end: the what-if rate when there is one, the
     straight-line pace otherwise. */
  const projecting = today.day < monthDays;
  const projEnd = Math.min(max, planning ? planEnd : (today.thisMinor / today.day) * monthDays);
  const projArea = `M${x(today.day).toFixed(1)},${y(today.thisMinor).toFixed(1)} L${x(monthDays).toFixed(1)},${y(projEnd).toFixed(1)} L${x(monthDays).toFixed(1)},${y(0).toFixed(1)} L${x(today.day).toFixed(1)},${y(0).toFixed(1)} Z`;

  const active = hover != null ? drawn[Math.min(hover, drawn.length - 1)] : null;
  const at = active ?? today;

  function pointAt(clientX: number) {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return;
    const ratio = (clientX - box.left) / box.width;
    const day = Math.round(ratio * (monthDays - 1)) + 1;
    const idx = points.findIndex((p) => p.day >= day);
    setHover(idx === -1 ? points.length - 1 : idx);
  }

  /*
   * Reading the line. A mouse reads wherever it hovers. A finger reads only
   * once it drags sideways along the line: a tap does nothing, and a drag up
   * or down is a scroll — the chart is `pan-y`, so the browser keeps those and
   * cancels ours. Either way the readout swaps instantly; reading is not a
   * change, so nothing about it animates.
   */
  function onDown(e: React.PointerEvent) {
    if (e.pointerType === 'mouse') return;
    touch.current = { x: e.clientX, y: e.clientY, scrubbing: false };
  }
  function onMove(e: React.PointerEvent) {
    if (e.pointerType === 'mouse') return pointAt(e.clientX);
    const t = touch.current;
    if (!t) return;
    if (!t.scrubbing) {
      const dx = Math.abs(e.clientX - t.x);
      if (dx < 8 || dx < Math.abs(e.clientY - t.y)) return;
      t.scrubbing = true;
    }
    pointAt(e.clientX);
  }
  function onEnd() {
    touch.current = null;
    setHover(null);
  }

  const dayName = (p: FlowPoint) =>
    p === today && live ? `Day ${p.day} · today` : dated ? dayLabel(p.date) : `Day ${p.day} · ${dayLabel(p.date)}`;

  return (
    <div className={`relative select-none ${fill ? 'flex flex-col flex-1 min-h-0' : ''}`} ref={wrapRef}>
      {/*
        What the two lines are. On a wide screen a key, with the figures
        floating on the curve; on a phone a readout bar pinned here instead —
        a floating box there covers the line it is describing, or clips. The
        bar follows a scrub and rests on today.
      */}
      {names && (
        <>
          <div className="hidden sm:flex items-center gap-4 mb-3 micro">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-4 h-[2px] rounded-full" style={{ background: 'var(--brass)' }} />
              {names.current}
            </span>
            {hasPrev ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="w-4 border-t-[1.5px] border-dashed" style={{ borderColor: 'var(--text-muted)' }} />
                {names.previous}, same days
              </span>
            ) : (
              <span className="normal-case tracking-normal text-[11.5px] muted">
                No spending recorded in {names.previous} to compare against
              </span>
            )}
          </div>
          <div
            className="sm:hidden flex items-center justify-between gap-3 h-9 px-3 mb-2 rounded-lg"
            style={{ background: 'var(--surface-2)' }}
            aria-live="polite"
          >
            <span className="micro truncate">{dayName(at)}</span>
            <span className="flex items-baseline gap-2.5 shrink-0">
              <span className="num text-[13px] font-semibold" style={{ color: 'var(--brass)' }}>
                {formatINR(at.thisMinor)}
              </span>
              {hasPrev ? (
                <span className="num text-[11.5px] muted">
                  {names.previous.slice(0, 3)} {formatINR(at.prevMinor)}
                </span>
              ) : (
                <span className="text-[11px] muted">no {names.previous.slice(0, 3)} data</span>
              )}
            </span>
          </div>
        </>
      )}

      {/*
        No y scale. A cumulative curve is read as a shape against the dashed
        one beside it, not as a series of values off an axis — and the exact
        figure is on the marker. The gridlines alone give the eye its levels.
      */}
      <div className={`relative ${fill ? 'flex flex-col flex-1 min-h-0' : ''}`}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={fill ? undefined : height}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Cumulative spending this month${hasPrev ? ' compared with last month' : ''}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={(e) => e.pointerType !== 'mouse' && onEnd()}
        onPointerCancel={onEnd}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(null)}
        style={{ touchAction: 'pan-y', display: 'block', ...(fill ? { flex: '1 1 auto', minHeight: height } : null) }}
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

        {/* The part that has not happened yet, shaded faintly under the
            run-out — "this is a projection" readable before any figure is. */}
        {projecting && live && (
          <path d={projArea} fill={tryRate != null ? 'var(--accent)' : 'var(--brass)'} opacity={tryRate != null ? 0.1 : 0.06} />
        )}

        {/* Last month, dashed and behind — a reference, not a second subject.
            Stronger than a gridline, so a quiet month along the axis still reads. */}
        {hasPrev && (
          <path
            d={line('prevMinor')}
            fill="none"
            stroke="var(--text-muted)"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            opacity="0.9"
          />
        )}

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

        {/* The scrub's guide, following the cursor or finger. */}
        {active && (
          <line
            x1={x(active.day)}
            x2={x(active.day)}
            y1={PAD.top}
            y2={H - PAD.bottom}
            stroke="var(--border-strong)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {/* TODAY. A dashed rule down the live end of the line, and a dotted
            run-out to the end of the month — the part that has not happened
            yet, drawn as clearly unwritten rather than left blank. */}
        {projecting && (
          <>
            <line
              x1={x(today.day)}
              x2={x(today.day)}
              y1={PAD.top}
              y2={H - PAD.bottom}
              stroke="var(--brass)"
              strokeWidth="1"
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
              opacity="0.7"
            />
            <line
              x1={x(today.day)}
              y1={y(today.thisMinor)}
              x2={x(monthDays)}
              y2={y(projEnd)}
              stroke={tryRate != null ? 'var(--accent)' : 'var(--brass)'}
              strokeWidth="1.5"
              strokeDasharray="2 5"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              opacity={tryRate != null ? 0.9 : 0.45}
            />
          </>
        )}
      </svg>

      {/*
        Points are HTML, not SVG circles: the plot stretches to its box, which
        would squash a circle into an ellipse. Today's point breathes, in the
        same slow pulse as the header's live dot — the one point on the line
        that is still true only for now. Everything behind it is settled, and
        still. A month that is over has no live point.
      */}
      <span
        aria-hidden
        className={`absolute w-2.5 h-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none ${live ? 'pulse-dot' : ''}`}
        style={{ left: `${pctX(today.day)}%`, top: `${pctY(today.thisMinor)}%`, background: 'var(--brass)' }}
      />
      {active && active !== today && (
        <span
          aria-hidden
          className="absolute w-2.5 h-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none"
          style={{
            left: `${pctX(active.day)}%`,
            top: `${pctY(active.thisMinor)}%`,
            background: 'var(--brass)',
            border: '2px solid var(--surface)',
          }}
        />
      )}

      {/* The figure, pinned to the point it describes — on a wide screen.
          Follows the hover and rests on today otherwise. */}
      <span
        className={`${names ? 'hidden sm:block' : ''} absolute -translate-x-1/2 -translate-y-full pointer-events-none whitespace-nowrap rounded-md px-2 py-1`}
        style={{
          left: `${Math.min(92, Math.max(8, pctX(at.day)))}%`,
          top: `${pctY(at.thisMinor)}%`,
          marginTop: '-12px',
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
        }}
      >
        <span className="micro block leading-none">{dayName(at)}</span>
        <span className="num text-[12px] font-semibold">{formatINR(at.thisMinor)}</span>
        {names && hasPrev && (
          <span className="num text-[11px] muted block leading-tight">
            {names.previous.slice(0, 3)} {formatINR(at.prevMinor)}
          </span>
        )}
      </span>

      {/* The handle on the month's end. A generous target of its own, so a
          finger on it drags and a finger anywhere else still scrolls. */}
      {planning && (
        <span
          role="slider"
          tabIndex={0}
          aria-label={`Daily spending to try for the rest of ${whatIf!.monthName}`}
          aria-valuemin={0}
          aria-valuenow={Math.round((tryRate ?? paceRate) / 100)}
          aria-valuetext={`${formatINR(tryRate ?? paceRate)} a day`}
          className="absolute w-9 h-9 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center cursor-ns-resize rounded-full focus-visible:outline-2"
          style={{
            left: `${pctX(monthDays)}%`,
            top: `${pctY(Math.min(max, planEnd))}%`,
            touchAction: 'none',
          }}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
            dragging.current = true;
            drag(e.clientY);
          }}
          onPointerMove={(e) => dragging.current && drag(e.clientY)}
          onPointerUp={() => (dragging.current = false)}
          onPointerCancel={() => (dragging.current = false)}
          onKeyDown={(e) => {
            const step = (e.shiftKey ? 100 : 10) * 100;
            if (e.key === 'ArrowUp' || e.key === 'ArrowRight') setTryRate(roundRate((tryRate ?? paceRate) + step));
            else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') setTryRate(Math.max(0, roundRate((tryRate ?? paceRate) - step)));
            else if (e.key === 'Escape') setTryRate(null);
            else return;
            e.preventDefault();
          }}
        >
          <span
            className="w-3 h-3 rounded-full"
            style={{
              background: tryRate != null ? 'var(--accent)' : 'var(--surface)',
              border: '2px solid var(--accent)',
              boxShadow: '0 0 10px -1px color-mix(in oklab, var(--accent) 70%, transparent)',
            }}
          />
        </span>
      )}
      </div>

      {/* Five stops rather than two ends — "Day 14" is a place, "1 … 30" is a
          range you have to measure against. */}
      <div className="flex justify-between mt-2">
        {axisDays(monthDays, today.day, dated ? points[0].date : undefined).map((d) => (
          <span
            key={d.day}
            className="micro"
            style={d.isToday ? { color: 'var(--accent)' } : undefined}
          >
            {d.label}
          </span>
        ))}
      </div>

      {planning && (() => {
        const rate = tryRate ?? paceRate;
        const end = Math.round(planEnd);
        const diff = end - whatIf!.prevFullMinor;
        return (
          <p className="text-[12.5px] mt-3 leading-relaxed" aria-live="polite">
            <span className="muted">At </span>
            <span className="num font-semibold">{formatINR(rate)}</span>
            <span className="muted"> a day from here{tryRate == null ? ' (your pace so far)' : ''}, {whatIf!.monthName} ends at </span>
            <span className="num font-semibold">{formatINR(end)}</span>
            {whatIf!.prevFullMinor > 0 && (
              <span className="muted">
                {' '}
                — <span className="num" style={{ color: diff > 0 ? 'var(--rule-red)' : 'var(--credit)' }}>{formatINR(Math.abs(diff))}</span>{' '}
                {diff > 0 ? 'over' : 'under'} {whatIf!.prevMonthName}
              </span>
            )}
            <span className="muted">.</span>{' '}
            {tryRate == null ? (
              <span className="muted">Drag the end of the dotted line to try another rate.</span>
            ) : (
              <button type="button" className="micro micro-link" style={{ color: 'var(--accent)' }} onClick={() => setTryRate(null)}>
                Reset
              </button>
            )}
          </p>
        );
      })()}
    </div>
  );

  /** The rate a drag to this height means, in whole ₹10 steps, never below zero. */
  function drag(clientY: number) {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return;
    const units = ((clientY - box.top) / box.height) * H;
    const minor = max * (1 - (units - PAD.top) / (H - PAD.top - PAD.bottom));
    const end = Math.min(max, Math.max(last!.thisMinor, minor));
    setTryRate(roundRate((end - last!.thisMinor) / remaining));
  }
}

/** A daily rate in whole ₹10 steps. */
function roundRate(minor: number) {
  return Math.max(0, Math.round(minor / 1000) * 1000);
}

/** Five evenly spaced day labels, with today named where it falls. */
function axisDays(monthDays: number, today: number, monthStart?: string) {
  const stops = [1, Math.round(monthDays * 0.25), Math.round(monthDays * 0.5), Math.round(monthDays * 0.75), monthDays];
  const name = (day: number) =>
    monthStart
      ? dayLabel(`${monthStart.slice(0, 8)}${String(day).padStart(2, '0')}`)
      : `Day ${day}`;
  const out = stops.map((day) => ({ day, label: name(day), isToday: false }));
  if (today > 1 && today < monthDays) {
    // Replace whichever stop today is nearest, so the labels never collide.
    let nearest = 0;
    for (let i = 1; i < out.length - 1; i++) {
      if (Math.abs(out[i].day - today) < Math.abs(out[nearest].day - today)) nearest = i;
    }
    out[nearest] = {
      day: today,
      label: monthStart ? `${name(today)} · now` : `Today (${today})`,
      isToday: true,
    };
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
  days,
  fill = false,
  onPick,
}: {
  data: { date: string; totalMinor: number }[];
  monthDays: number;
  height?: number;
  /**
   * Open a day. With a mouse, a click; on touch the first tap reads the day
   * out (as it always has) and a second tap on the same bar opens it, so the
   * readout is not lost to the link. Only days with spending are pressable.
   */
  onPick?: (date: string) => void;
  /**
   * How many days to draw — the days that have happened, in a month still
   * running. The days still to come are a count at the end of the axis, not
   * a row of empty slots squeezing the real bars into the first few columns.
   * Never fewer than the last day that has spending, so nothing is cut off.
   */
  days?: number;
  /** Grow to the height of the container, with `height` as the floor. */
  fill?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const lastPointer = useRef<string>('mouse');
  const tappedDay = useRef<number | null>(null);

  const byDay = new Map(data.map((d) => [Number(d.date.slice(8, 10)), d.totalMinor]));
  const lastDataDay = Math.max(0, ...[...byDay.entries()].filter(([, m]) => m > 0).map(([d]) => d));
  const drawn = Math.min(monthDays, Math.max(days ?? monthDays, lastDataDay, 1));
  const max = niceMax(Math.max(1, ...data.map((d) => d.totalMinor)));
  const peak = Math.max(0, ...data.map((d) => d.totalMinor));
  const peakDay = [...byDay.entries()].find(([, minor]) => minor === peak && peak > 0)?.[0] ?? null;

  const monthPrefix = data[0]?.date.slice(0, 8) ?? '';
  const shown = hover ?? peakDay;
  const shownMinor = shown === null ? 0 : (byDay.get(shown) ?? 0);

  return (
    <div className={fill ? 'flex flex-col flex-1 min-h-0' : undefined}>
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

      <div
        className={`flex items-stretch gap-[2px] ${fill ? 'flex-1' : ''}`}
        style={fill ? { minHeight: height } : { height }}
        onMouseLeave={() => setHover(null)}
      >
        {Array.from({ length: drawn }, (_, i) => {
          const day = i + 1;
          const minor = byDay.get(day) ?? 0;
          const isPeak = minor > 0 && minor === peak;
          const isHovered = hover === day;
          return (
            /* The whole column is the target, not the bar — at 31 days a bar
               is two pixels wide and impossible to point at. */
            <div
              key={day}
              className={`flex-1 flex items-end min-w-0 ${onPick && minor > 0 ? 'cursor-pointer' : 'cursor-default'}`}
              onMouseEnter={() => setHover(day)}
              onPointerDown={(e) => {
                lastPointer.current = e.pointerType;
                if (e.pointerType !== 'mouse') setHover(day);
              }}
              {...(onPick && minor > 0
                ? {
                    role: 'button',
                    tabIndex: 0,
                    'aria-label': `Open ${dayLabel(`${monthPrefix}${String(day).padStart(2, '0')}`)}, ${formatINR(minor)}`,
                    onClick: () => {
                      const date = `${monthPrefix}${String(day).padStart(2, '0')}`;
                      if (lastPointer.current === 'mouse' || tappedDay.current === day) onPick(date);
                      tappedDay.current = day;
                    },
                    onKeyDown: (e: React.KeyboardEvent) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onPick(`${monthPrefix}${String(day).padStart(2, '0')}`);
                      }
                    },
                  }
                : {})}
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
        <span className="micro">{Math.round(drawn / 2)}</span>
        <span className="micro">
          {drawn}
          {drawn < monthDays && <span className="muted"> · {monthDays - drawn} days to go</span>}
        </span>
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
  fill = false,
  maxHeight,
  average: averageOverride,
}: {
  data: { month: string; totalMinor: number }[];
  activeMonth?: string;
  onPick?: (month: string) => void;
  height?: number;
  detailed?: boolean;
  averageLabel?: string;
  /** Grow to the height of the container, with `height` as the floor and
      `maxHeight` as the ceiling. */
  fill?: boolean;
  maxHeight?: number;
  /**
   * The dashed line's value and the month count its caption names, when the
   * bars drawn are not the months it was taken over — so trimming the empty
   * front of a chart cannot quietly change the figure.
   */
  average?: { minor: number; months: number };
}) {
  const max = niceMax(Math.max(1, ...data.map((d) => d.totalMinor)));
  /*
   * The average runs from the first month with anything in it, not from the
   * start of the window: months before tracking began are not zero months,
   * they are no months. Empty months after that first one still count — a
   * gap is real.
   */
  const firstActive = data.findIndex((d) => d.totalMinor > 0);
  const counted = firstActive < 0 ? [] : data.slice(firstActive);
  const average =
    averageOverride?.minor ??
    (counted.length ? Math.round(counted.reduce((s, d) => s + d.totalMinor, 0) / counted.length) : 0);
  const averageMonths = averageOverride?.months ?? counted.length;
  /* Three gridlines and the baseline — enough to read a height against, few
     enough to stay out of the way of the bars. Exact thirds, not 0.66/0.33:
     a ₹15,000 scale must read 15K · 10K · 5K · 0, not 15K · 9.9K · 5K. */
  const ticks = [max, (max * 2) / 3, max / 3, 0];

  /*
   * Bars are capped in width and centred. With a year of history they fill
   * the row; with four months they must not become billboards — but at 3¼rem
   * a short history sat in the middle 40% of the card with empty rails either
   * side, so a short run gets a wider cap.
   */
  const slot = data.length <= 6 ? 'max-w-[5rem]' : 'max-w-[3.25rem]';
  const barsStyle = fill ? { minHeight: height, maxHeight } : { height };

  return (
    <div className={fill ? 'flex flex-col flex-1 min-h-0' : undefined}>
      <div className={`${detailed ? 'flex gap-3' : ''} ${fill ? 'flex-1 flex min-h-0' : ''}`}>
        {detailed && (
          <div className="flex flex-col justify-between shrink-0" style={{ height }}>
            {ticks.map((t) => (
              <span key={t} className="micro leading-none">
                {t === 0 ? '₹0' : formatINR(t, { compact: true })}
              </span>
            ))}
          </div>
        )}

        <div className={`flex-1 min-w-0 ${fill ? 'flex flex-col' : ''}`}>
          <div
            /* In the detailed chart the average's tag sits at the right end of
               its dashed line; the bars keep clear of it rather than printing
               their own value through it. */
            className={`relative flex items-stretch justify-center gap-1.5 sm:gap-2 ${fill ? 'flex-1' : ''} ${
              detailed && average > 0 ? 'pr-20' : ''
            }`}
            style={barsStyle}
          >
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
                  className={`group relative flex-1 ${slot} flex items-end min-w-0`}
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

          <div className={`flex justify-center gap-1.5 sm:gap-2 mt-1.5 ${detailed && average > 0 ? 'pr-20' : ''}`}>
            {data.map((d) => (
              <span
                key={d.month}
                className={`flex-1 ${slot} micro text-center truncate`}
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
          dashed line: {formatINR(average)} average over {averageMonths} months
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
 * They start laid out deterministically — the leader centred, the rest
 * ringing it clockwise by size — and stay still until touched. Then they are
 * things to play with: grab one and throw it, or flick it with a passing
 * cursor, and it bounces off the walls of its box and off the others, then
 * settles. The loop runs only while something moves and writes transforms
 * straight to the DOM, so a thrown bubble never re-renders the dashboard.
 * Reduced motion keeps the dragging and drops the throw and the flick.
 */
type Bubble = { name: string; totalMinor: number; color: string; r: number; x: number; y: number };
type Body = { x: number; y: number; vx: number; vy: number; r: number; m: number };

const FRAME = 1000 / 60; // velocities are in px per 60 Hz frame
const BOUNCE = 0.82; // energy kept off a wall or another bubble
const DRAG_AIR = 0.985; // per frame; a throw crosses the box, then settles
const MAX_SPEED = 38;

export function CategoryBubbles({
  data,
  size = 240,
}: {
  data: { name: string; totalMinor: number; color: string }[];
  size?: number;
}) {
  const reduced = useReducedMotion();
  const top = data.filter((d) => d.totalMinor > 0).slice(0, 5);
  const total = top.reduce((s, d) => s + d.totalMinor, 0);

  /* x is measured from the box's centre line, y from its top, so the layout
     is right before the box has been measured — and stays centred after. */
  const bubbles: Bubble[] = [];
  if (top.length && total > 0) {
    const [lead, ...rest] = top;
    const leadR = size * 0.235;
    /* Radius from area: r = R·√(share / leadShare), floored so a 2% slice is
       still a legible disc rather than a dot. */
    const radiusFor = (minor: number) =>
      Math.max(size * 0.085, leadR * Math.sqrt(minor / lead.totalMinor));
    const orbit = size * 0.375;
    rest.forEach((d, i) => {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(rest.length, 1) + Math.PI / 5;
      bubbles.push({ ...d, r: radiusFor(d.totalMinor), x: Math.cos(angle) * orbit, y: size / 2 + Math.sin(angle) * orbit });
    });
    // The leader last, so it layers above anything that crowds it.
    bubbles.push({ ...lead, r: leadR, x: 0, y: size / 2 });
  }
  const layoutKey = `${size}|${bubbles.map((b) => `${b.name}:${b.totalMinor}`).join('|')}`;

  const box = useRef<HTMLDivElement>(null);
  const nodes = useRef<(HTMLSpanElement | null)[]>([]);
  const bodies = useRef<Body[]>([]);
  const frame = useRef(0);
  const last = useRef(0);
  const held = useRef<{ i: number; ox: number; oy: number; px: number; py: number; t: number; vx: number; vy: number } | null>(null);
  const hover = useRef<{ px: number; py: number; t: number } | null>(null);

  // New numbers, new layout: the bodies start over from it, as the DOM does.
  useEffect(() => {
    bodies.current = bubbles.map((b) => ({ x: b.x, y: b.y, vx: 0, vy: 0, r: b.r, m: b.r * b.r }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the serialised layout
  }, [layoutKey]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    // A narrower box pulls stray bubbles back inside it.
    const ro = new ResizeObserver(() => wake());
    ro.observe(el);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once; wake reads only refs
  }, []);

  function wake() {
    if (frame.current) return;
    last.current = performance.now();
    frame.current = requestAnimationFrame(tick);
  }

  function walls() {
    const el = box.current!;
    return { half: el.clientWidth / 2, height: el.clientHeight };
  }

  function place(i: number) {
    const b = bodies.current[i];
    const node = nodes.current[i];
    if (node) node.style.transform = `translate(${b.x - b.r}px, ${b.y - b.r}px)`;
  }

  function tick(now: number) {
    const bs = bodies.current;
    if (!box.current || !bs.length) {
      frame.current = 0;
      return;
    }
    const dt = Math.min(2, (now - last.current) / FRAME);
    last.current = now;
    const { half, height } = walls();
    const grabbed = held.current?.i ?? -1;
    const air = Math.pow(DRAG_AIR, dt);

    bs.forEach((b, i) => {
      if (i === grabbed) return;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      // Slow bubbles drag harder, so a throw ends in a settle, not a creep.
      const k = Math.hypot(b.vx, b.vy) < 1.5 ? air * Math.pow(0.93, dt) : air;
      b.vx *= k;
      b.vy *= k;
    });

    // Bubble against bubble: pushed apart by mass, then an elastic bounce
    // along the line between centres. A held bubble is immovable — it
    // shoves, it is not shoved.
    let crowded = false;
    for (let pass = 0; pass < 3; pass++) {
      for (let a = 0; a < bs.length; a++) {
        for (let c = a + 1; c < bs.length; c++) {
          const A = bs[a];
          const C = bs[c];
          const dx = C.x - A.x;
          const dy = C.y - A.y;
          const dist = Math.hypot(dx, dy) || 0.01;
          const overlap = A.r + C.r - dist;
          if (overlap <= 0) continue;
          if (overlap > 0.5) crowded = true;
          const nx = dx / dist;
          const ny = dy / dist;
          const ia = a === grabbed ? 0 : 1 / A.m;
          const ic = c === grabbed ? 0 : 1 / C.m;
          const sum = ia + ic;
          if (!sum) continue;
          A.x -= (nx * overlap * ia) / sum;
          A.y -= (ny * overlap * ia) / sum;
          C.x += (nx * overlap * ic) / sum;
          C.y += (ny * overlap * ic) / sum;
          const closing = (C.vx - A.vx) * nx + (C.vy - A.vy) * ny;
          if (pass === 0 && closing < 0) {
            const j = (-(1 + BOUNCE) * closing) / sum;
            A.vx -= j * ia * nx;
            A.vy -= j * ia * ny;
            C.vx += j * ic * nx;
            C.vy += j * ic * ny;
          }
        }
      }
    }

    let moving = grabbed >= 0 || crowded;
    bs.forEach((b, i) => {
      if (i !== grabbed) {
        if (b.x - b.r < -half) { b.x = -half + b.r; b.vx = Math.abs(b.vx) * BOUNCE; }
        if (b.x + b.r > half) { b.x = half - b.r; b.vx = -Math.abs(b.vx) * BOUNCE; }
        if (b.y - b.r < 0) { b.y = b.r; b.vy = Math.abs(b.vy) * BOUNCE; }
        if (b.y + b.r > height) { b.y = height - b.r; b.vy = -Math.abs(b.vy) * BOUNCE; }
        if (Math.hypot(b.vx, b.vy) < 0.04) { b.vx = 0; b.vy = 0; } else moving = true;
      }
      place(i);
    });

    frame.current = moving ? requestAnimationFrame(tick) : 0;
  }

  /** The pointer, in body coordinates. */
  function at(e: React.PointerEvent) {
    const r = box.current!.getBoundingClientRect();
    return { px: e.clientX - r.left - r.width / 2, py: e.clientY - r.top };
  }

  function grab(i: number, e: React.PointerEvent<HTMLSpanElement>) {
    const b = bodies.current[i];
    if (!b || e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const { px, py } = at(e);
    held.current = { i, ox: b.x - px, oy: b.y - py, px, py, t: e.timeStamp, vx: 0, vy: 0 };
    b.vx = 0;
    b.vy = 0;
    const node = nodes.current[i];
    if (node) {
      node.dataset.held = '';
      node.style.zIndex = '2';
    }
    wake();
  }

  function move(i: number, e: React.PointerEvent<HTMLSpanElement>) {
    const h = held.current;
    if (!h || h.i !== i) return;
    const b = bodies.current[i];
    const { px, py } = at(e);
    const { half, height } = walls();
    // Throw speed is the pointer's, smoothed over the last few moves.
    const k = FRAME / Math.max(1, e.timeStamp - h.t);
    h.vx = h.vx * 0.4 + (px - h.px) * k * 0.6;
    h.vy = h.vy * 0.4 + (py - h.py) * k * 0.6;
    h.px = px;
    h.py = py;
    h.t = e.timeStamp;
    b.x = Math.min(half - b.r, Math.max(-half + b.r, px + h.ox));
    b.y = Math.min(height - b.r, Math.max(b.r, py + h.oy));
    b.vx = h.vx;
    b.vy = h.vy;
    wake();
  }

  function release(i: number, e: React.PointerEvent<HTMLSpanElement>) {
    const h = held.current;
    if (!h || h.i !== i) return;
    const b = bodies.current[i];
    // Held still before letting go is a drop, not a throw.
    const paused = e.timeStamp - h.t > 80;
    const speed = Math.hypot(h.vx, h.vy);
    const scale = reduced || paused ? 0 : Math.min(1, MAX_SPEED / (speed || 1));
    b.vx = h.vx * scale;
    b.vy = h.vy * scale;
    held.current = null;
    const node = nodes.current[i];
    if (node) {
      delete node.dataset.held;
      node.style.zIndex = '';
    }
    wake();
  }

  // A cursor passing through a bubble nudges it along the way it was going.
  function flick(e: React.PointerEvent<HTMLDivElement>) {
    if (reduced || held.current || e.pointerType !== 'mouse') return;
    const { px, py } = at(e);
    const prev = hover.current;
    hover.current = { px, py, t: e.timeStamp };
    if (!prev) return;
    const k = FRAME / Math.max(1, e.timeStamp - prev.t);
    const vx = (px - prev.px) * k;
    const vy = (py - prev.py) * k;
    if (Math.hypot(vx, vy) < 1.5) return;
    let nudged = false;
    for (const b of bodies.current) {
      if (Math.hypot(px - b.x, py - b.y) > b.r) continue;
      b.vx = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, b.vx + vx * 0.3));
      b.vy = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, b.vy + vy * 0.3));
      nudged = true;
    }
    if (nudged) wake();
  }

  if (!bubbles.length) return null;
  const leadIndex = bubbles.length - 1;
  const pct = (minor: number) => Math.round((minor / total) * 100);

  return (
    <div
      ref={box}
      className="relative w-full select-none"
      style={{ height: size }}
      onPointerMove={flick}
      onPointerLeave={() => (hover.current = null)}
    >
      {bubbles.map((d, i) => {
        const isLead = i === leadIndex;
        return (
          <span
            key={d.name}
            ref={(n) => {
              nodes.current[i] = n;
            }}
            title={`${d.name}: ${formatINR(d.totalMinor)}`}
            className="group absolute left-1/2 top-0 cursor-grab data-[held]:cursor-grabbing will-change-transform"
            style={{ width: d.r * 2, height: d.r * 2, transform: `translate(${d.x - d.r}px, ${d.y - d.r}px)`, touchAction: 'none' }}
            onPointerDown={(e) => grab(i, e)}
            onPointerMove={(e) => move(i, e)}
            onPointerUp={(e) => release(i, e)}
            onPointerCancel={(e) => release(i, e)}
          >
            <span
              className="w-full h-full rounded-full flex flex-col items-center justify-center text-center leading-none transition-transform duration-200 group-hover:scale-[1.04] group-data-[held]:scale-[1.08]"
              style={
                isLead
                  ? {
                      background: `color-mix(in oklab, ${d.color} 55%, var(--surface))`,
                      border: `1px solid ${d.color}`,
                      boxShadow: `0 0 28px -6px color-mix(in oklab, ${d.color} 55%, transparent)`,
                    }
                  : {
                      background: `color-mix(in oklab, ${d.color} 26%, var(--surface-2))`,
                      border: `1px solid color-mix(in oklab, ${d.color} 45%, transparent)`,
                    }
              }
            >
              {isLead ? (
                <>
                  <span className="num text-[20px] font-bold">{pct(d.totalMinor)}%</span>
                  <span className="text-[10px] font-semibold truncate max-w-[80%] mt-0.5">{d.name}</span>
                  <span className="num text-[10px] muted mt-0.5">
                    {formatINR(d.totalMinor, { compact: d.totalMinor > 99_999 })}
                  </span>
                </>
              ) : (
                <>
                  <span className="num text-[12px] font-bold">{pct(d.totalMinor)}%</span>
                  <span className="text-[9px] muted truncate max-w-[85%] mt-0.5">{d.name}</span>
                </>
              )}
            </span>
          </span>
        );
      })}
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
  /* No transition while the page arrives — a bar filling from nothing on
     every load is not progress. */
  const grow = useGrowClass(spring);

  return (
    <div
      className="rounded-full overflow-hidden w-full"
      style={{ background: 'var(--surface-2)', height }}
      role="presentation"
    >
      <div
        className={`h-full rounded-full ${grow}`}
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
