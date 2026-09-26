'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { CountUp } from './lp-countup';
import { Logo } from './logo';
import { useBubblePhysics } from './bubble-physics';

/**
 * Product panels for the landing page — flat, hairline-bordered surfaces
 * rather than device frames, drawn in the landing page's own palette. What
 * they show follows the app as it is: the same cards, labels and rules the
 * real screens have. The figures are one consistent month, so the three
 * panels tell the same story — September's ₹14,962 of spending is the same
 * ₹14,962 in the chart, the categories and the stat strip.
 */

/* September: ₹52,000 in, ₹14,962 spent, ₹10,000 invested, ₹27,038 left. */
const MONTH = { inMinor: 52000, spent: 14962, invested: 10000, left: 27038 };

/* Spending only — investing is kept, not spent, and never listed here. */
const CATEGORIES: [string, number][] = [
  ['Shopping', 4843],
  ['Outside Food', 2921],
  ['Misc', 2140],
  ['Ciggs / Alc', 1931],
  ['Bills / Recharge', 1599],
  ['Transport', 1528],
];

const TICKER = [
  ['Sankalp', '3,764'],
  ['Mummy', '2,208'],
  ['Aarya', '2,160'],
  ['Shopping', '4,843'],
  ['Outside Food', '2,921'],
  ['Misc', '2,140'],
  ['Ciggs / Alc', '1,931'],
  ['Bills / Recharge', '1,599'],
  ['Me', '13,480'],
];

/* Running totals, day 1 to today (the 26th), and August on the same days. */
const THIS_MONTH = [0, 350, 350, 1200, 1540, 1540, 2100, 2380, 2380, 3900, 4260, 4600, 4600, 5150, 6200, 6480, 6480, 7300, 8120, 8400, 9950, 10300, 10650, 12400, 13840, 14962];
const LAST_MONTH = [420, 420, 900, 1600, 2100, 2600, 2600, 3400, 4100, 4900, 5200, 6100, 6700, 7200, 8000, 8900, 9400, 10100, 11200, 11800, 12900, 13600, 14300, 15800, 17100, 18400];
const MONTH_DAYS = 30;
const PROJECTED = 17264; // ₹575 a day, over thirty days

const inr = (n: number) => `₹${Math.abs(n).toLocaleString('en-IN')}`;
const HAIR = 'color-mix(in oklab, var(--onforest) 10%, transparent)';
const WASH = 'color-mix(in oklab, var(--onforest) 4%, transparent)';
const PICKED = {
  borderColor: 'color-mix(in oklab, var(--gold) 60%, transparent)',
  background: 'color-mix(in oklab, var(--gold) 15%, transparent)',
  color: 'var(--gold-soft)',
};
const UNPICKED = { borderColor: 'color-mix(in oklab, var(--onforest) 15%, transparent)', color: 'var(--onforest-muted)' };

/* ------------------------------------------------------------------ *
 * The demo: one small, pretend ledger the three panels share.
 *
 * Nothing leaves the page — no request, no storage; a reload starts over.
 * It is shared so the panels behave like one app: money lent in the add
 * sheet moves the balance in the Ledger panel, and the dashboard's "Net
 * with people" follows it.
 * ------------------------------------------------------------------ */

type DemoExpense = { id: number; amount: number; category: string; people: string[]; date: string; note: string };

const START_EXPENSES: DemoExpense[] = [
  { id: 0, amount: 800, category: 'Outside Food', people: ['Sankalp'], date: '23 Aug', note: 'Dinner' },
];
const START_BALANCES: [string, number][] = [
  ['Aditi', -13950],
  ['Mummy', 2500],
  ['Sankalp', 1000],
  ['Aarya', 500],
  ['Rohan', 0],
];

type Demo = {
  expenses: DemoExpense[];
  balances: [string, number][];
  addExpense: (e: Omit<DemoExpense, 'id'>) => void;
  /** Positive: they owe you more (you lent). Negative: you owe more. */
  moveBalance: (person: string, by: number) => void;
  settle: (person: string) => void;
  reset: () => void;
  /** Bumped on reset, so panels can drop their own local state too. */
  epoch: number;
};

const DemoCtx = createContext<Demo | null>(null);
const useDemo = () => useContext(DemoCtx)!;

export function LandingDemo({ children }: { children: ReactNode }) {
  const [expenses, setExpenses] = useState(START_EXPENSES);
  const [balances, setBalances] = useState(START_BALANCES);
  const [epoch, setEpoch] = useState(0);
  const demo: Demo = {
    expenses,
    balances,
    epoch,
    addExpense: (e) => setExpenses((xs) => [...xs, { ...e, id: xs.length ? xs[xs.length - 1].id + 1 : 1 }]),
    moveBalance: (person, by) => setBalances((bs) => bs.map(([n, v]) => (n === person ? [n, v + by] : [n, v]))),
    settle: (person) => setBalances((bs) => bs.map(([n, v]) => (n === person ? [n, 0] : [n, v]))),
    reset: () => {
      setExpenses(START_EXPENSES);
      setBalances(START_BALANCES);
      setEpoch((n) => n + 1);
    },
  };
  return <DemoCtx.Provider value={demo}>{children}</DemoCtx.Provider>;
}

/** A figure that eases to its new value when it changes — never on arrival. */
function useEased(value: number, ms = 500) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    if (start === value) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      from.current = value;
      setShown(value);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      const v = Math.round(start + (value - start) * (1 - Math.pow(1 - p, 3)));
      from.current = v;
      setShown(v);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

function Eased({ value, signed = false }: { value: number; signed?: boolean }) {
  const v = useEased(value);
  return (
    <>
      {signed ? (v > 0 ? '+' : v < 0 ? '−' : '') : v < 0 ? '−' : ''}
      {inr(v)}
    </>
  );
}

function Initial({ name, size = 22 }: { name: string; size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.45),
        color: 'var(--gold-400)',
        border: '1px solid rgba(201,169,106,0.4)',
      }}
      aria-hidden
    >
      {name.trim()[0]?.toUpperCase()}
    </span>
  );
}

/** Scrolling strip of real figures, between the hero and the product. */
export function Ticker() {
  const run = [...TICKER, ...TICKER];
  return (
    <div
      className="lp-ticker border-y py-3"
      style={{ borderColor: 'color-mix(in oklab, var(--onforest) 10%, transparent)' }}
    >
      {/* Duplicated so the -50% loop is seamless. */}
      <div
        className="lp-ticker-track w-max gap-10 font-mono text-[11px] uppercase tracking-[0.25em]"
        style={{ color: 'var(--onforest-muted)' }}
      >
        {run.map(([name, amount], i) => (
          <span key={i} className="flex shrink-0 items-center gap-10">
            {name} ₹{amount}
            <span style={{ color: 'var(--gold)' }}>·</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** The dashboard as it is now: the month's hero, its trajectory, where the
    spending went, and the running tallies. */
export function DashboardPanel() {
  const nav: [string, string[]][] = [
    ['', ['Dashboard']],
    ['Record', ['Transactions', 'Income', 'People']],
    ['Understand', ['This month', 'Lifetime', 'Goals']],
    ['', ['Settings']],
  ];

  return (
    <div
      className="overflow-hidden rounded-lg border"
      style={{
        borderColor: HAIR,
        background: 'var(--forest-ink)',
        boxShadow: '0 60px 120px -40px color-mix(in oklab, var(--forest-ink) 70%, transparent)',
      }}
    >
      <div className="grid grid-cols-1 md:grid-cols-[180px_1fr]">
        <aside className="hidden border-r p-5 md:block" style={{ borderColor: HAIR }}>
          <Logo height={22} onDark />
          <nav className="mt-8 text-[13px]">
            {nav.map(([group, items], g) => (
              <div key={g} className={g ? 'mt-4' : ''}>
                {group && (
                  <p className="lp-eyebrow mb-1.5 px-3 text-[8px]" style={{ color: 'var(--onforest-muted)' }}>
                    {group}
                  </p>
                )}
                {items.map((item) => (
                  <div
                    key={item}
                    className={`rounded px-3 py-1.5 ${item === 'Dashboard' ? '' : 'lp-hoverable'}`}
                    style={
                      item === 'Dashboard'
                        ? { background: 'color-mix(in oklab, var(--onforest) 10%, transparent)', color: 'var(--onforest)' }
                        : { color: 'var(--onforest-muted)' }
                    }
                  >
                    {item}
                  </div>
                ))}
              </div>
            ))}
          </nav>
        </aside>

        <div className="p-6 md:p-8">
          {/* The stage header: a live dot, the month, how far through it is. */}
          <p className="lp-eyebrow flex items-center gap-2 text-[9px]" style={{ color: 'var(--onforest-muted)' }}>
            <span
              className="pulse-dot h-1.5 w-1.5 rounded-full"
              style={{ background: 'var(--gold)', boxShadow: '0 0 8px var(--gold)' }}
              aria-hidden
            />
            Active ledger pulse
          </p>
          <p className="lp-display mt-2 text-2xl" style={{ color: 'var(--onforest)' }}>
            September 2026
          </p>
          <p className="text-[12px]" style={{ color: 'var(--onforest-muted)' }}>
            Day 26 of 30
          </p>

          <div className="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            {/* The month: what is left, where the income went, and the curve. */}
            <div className="rounded border p-5" style={{ borderColor: HAIR, background: WASH }}>
              <p className="lp-eyebrow text-[9px]" style={{ color: 'var(--onforest-muted)' }}>
                Left in hand · September
              </p>
              <p className="mt-2 flex items-baseline gap-2">
                <span className="lp-display text-5xl" style={{ color: 'var(--gold-soft)' }}>
                  <CountUp to={MONTH.left} />
                </span>
                <span className="text-[12px]" style={{ color: 'var(--onforest-muted)' }}>
                  liquid
                </span>
              </p>
              <p className="mt-1 text-[12px]" style={{ color: 'var(--onforest-muted)' }}>
                after <span className="lp-tab">{inr(MONTH.spent)}</span> spent and{' '}
                <span className="lp-tab">{inr(MONTH.invested)}</span> invested
              </p>

              <Allocation />
              <Trajectory />
            </div>

            <div className="flex flex-col rounded border p-5" style={{ borderColor: HAIR, background: WASH }}>
              <p className="lp-eyebrow text-[9px]" style={{ color: 'var(--onforest-muted)' }}>
                Spend by category
              </p>
              <Bubbles />
            </div>
          </div>

          {/* The running tallies, as the dashboard's footer row. */}
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ['Today', '₹1,120', 'onforest'],
              ['This week', '₹3,480', 'onforest'],
              ['Typical entry', '₹350', 'onforest'],
              ['Net with people', 'net', 'gold'],
            ].map(([label, value, tone]) => (
              /* A flex column, figure pinned to the bottom, so a label that
                 wraps cannot drop its figure a line. */
              <div key={label} className="flex flex-col rounded border px-2.5 py-3.5" style={{ borderColor: HAIR, background: WASH }}>
                <p
                  className="lp-eyebrow text-[9px] leading-[1.35]"
                  style={{ color: 'var(--onforest-muted)', letterSpacing: '0.16em' }}
                >
                  {label}
                </p>
                <p
                  className="lp-display lp-tab mt-auto whitespace-nowrap pt-2 text-[15px] sm:text-lg md:text-xl"
                  style={{ color: tone === 'gold' ? 'var(--gold-soft)' : 'var(--onforest)' }}
                >
                  {value === 'net' ? <NetWithPeople /> : value}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Follows the Ledger panel below: lend or settle there and this moves. */
function NetWithPeople() {
  const { balances } = useDemo();
  return <Eased value={balances.reduce((t, [, v]) => t + v, 0)} />;
}

/** Where the month's income went: spent, invested, and still free. */
function Allocation() {
  const parts: [string, number, string][] = [
    ['Spent', MONTH.spent, 'color-mix(in oklab, var(--onforest) 45%, transparent)'],
    ['Invested', MONTH.invested, 'color-mix(in oklab, var(--gold) 55%, transparent)'],
    ['Free', MONTH.left, 'var(--gold)'],
  ];
  return (
    <div className="mt-5">
      <div className="flex h-1.5 gap-px overflow-hidden rounded-full">
        {parts.map(([label, v, c]) => (
          <span key={label} style={{ width: `${(v / MONTH.inMinor) * 100}%`, background: c }} />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[11px]" style={{ color: 'var(--onforest-muted)' }}>
        {parts.map(([label, v]) => (
          <span key={label} className="lp-tab">
            {label} {Math.round((v / MONTH.inMinor) * 100)}%
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * The month's running total against August's on the same days, the dotted
 * run-out to the month's end with its faint shading, and today's point
 * breathing — the one point still moving.
 *
 * It draws itself once, from day 1 to today, when it first scrolls into
 * view — the same moment the count-ups above start — and the projection
 * fades in after the line arrives. Reduced motion shows it drawn.
 */
function Trajectory() {
  const W = 300;
  const H = 110;
  const max = 20000;
  const x = (day: number) => ((day - 1) / (MONTH_DAYS - 1)) * W;
  const y = (v: number) => 6 + (1 - v / max) * (H - 12);
  const today = THIS_MONTH.length;

  const ref = useRef<HTMLDivElement>(null);
  /* How far along the line is drawn, 0 → 1. Undrawn until it plays, so it
     cannot flash drawn first; drawn at once for anyone who opts out of
     motion, or a browser that cannot say when it is in view. */
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || typeof IntersectionObserver === 'undefined') {
      setProgress(1);
      return;
    }
    let raf = 0;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        const t0 = performance.now();
        const step = (now: number) => {
          const p = Math.min(1, (now - t0) / 1600);
          setProgress(1 - Math.pow(1 - p, 3));
          if (p < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  /* The line up to the day the drawing has reached, the last step
     interpolated so it grows smoothly rather than a day at a time. */
  const reach = 1 + progress * (today - 1);
  const upTo = (vals: number[]) => {
    const whole = Math.floor(reach);
    const pts = vals.slice(0, whole).map((v, i) => [x(i + 1), y(v)] as const);
    if (whole < vals.length && reach > whole) {
      const f = reach - whole;
      const v = vals[whole - 1] + (vals[whole] - vals[whole - 1]) * f;
      pts.push([x(reach), y(v)]);
    }
    return pts;
  };
  const d = (pts: readonly (readonly [number, number])[]) => pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
  const mine = upTo(THIS_MONTH);
  const theirs = upTo(LAST_MONTH);
  const head = mine[mine.length - 1];
  const now = THIS_MONTH[today - 1];
  const done = progress >= 1;

  return (
    <div className="mt-6" ref={ref}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px]" style={{ color: 'var(--onforest-muted)' }}>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="h-[2px] w-3.5 rounded-full" style={{ background: 'var(--gold)' }} />
            September
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3.5 border-t border-dashed" style={{ borderColor: 'var(--onforest-muted)' }} />
            August, same days
          </span>
        </span>
        <span className="lp-tab">projected {inr(PROJECTED)} at ₹575/day</span>
      </div>
      <div className="relative mt-2">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-[110px] w-full" preserveAspectRatio="none" aria-hidden>
          <g style={{ opacity: done ? 1 : 0, transition: 'opacity 500ms ease-out' }}>
            <path
              d={`M${x(today)},${y(now)} L${x(MONTH_DAYS)},${y(PROJECTED)} L${x(MONTH_DAYS)},${y(0)} L${x(today)},${y(0)} Z`}
              fill="var(--gold)"
              opacity="0.07"
            />
            <line x1={x(today)} y1={y(now)} x2={x(MONTH_DAYS)} y2={y(PROJECTED)} stroke="var(--gold)" strokeWidth="1.2" strokeDasharray="1.5 4" strokeLinecap="round" vectorEffect="non-scaling-stroke" opacity="0.6" />
            <line x1={x(today)} x2={x(today)} y1={0} y2={H} stroke="var(--gold)" strokeWidth="1" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" opacity="0.45" />
          </g>
          <path d={d(theirs)} fill="none" stroke="var(--onforest-muted)" strokeWidth="1.2" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity="0.8" />
          {mine.length > 1 && <path d={`${d(mine)} L${head[0]},${y(0)} L${x(1)},${y(0)} Z`} fill="var(--gold)" opacity="0.1" />}
          <path d={d(mine)} fill="none" stroke="var(--gold)" strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
        </svg>
        {/* The drawing's leading point; once it reaches today, it breathes. */}
        <span
          className={`absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full ${done ? 'pulse-dot' : ''}`}
          style={{ left: `${(head[0] / W) * 100}%`, top: `${(head[1] / H) * 100}%`, background: 'var(--gold)', boxShadow: '0 0 8px var(--gold)' }}
          aria-hidden
        />
      </div>
      {/* Each label under the day it names — today under the today rule. */}
      <div className="relative mt-1.5 h-3 font-mono text-[9px] uppercase tracking-[0.15em]" style={{ color: 'var(--onforest-muted)' }}>
        <span className="absolute left-0">Day 1</span>
        <span className="absolute -translate-x-1/2" style={{ left: `${(x(15) / W) * 100}%` }}>
          Day 15
        </span>
        <span className="absolute -translate-x-1/2" style={{ left: `${(x(today) / W) * 100}%`, color: 'var(--gold-soft)' }}>
          Today
        </span>
        {/* On a phone today sits too close to the month's end to name both. */}
        <span className="absolute right-0 hidden sm:inline">Day 30</span>
      </div>
    </div>
  );
}

/**
 * Spending by category as area, the biggest in the middle — and, as on the
 * real dashboard, something to play with: grab one and throw it, or flick it
 * with a passing cursor, and it bounces off the walls and the others.
 *
 * The box is the whole card below its title. It is measured, and the layout
 * spreads to it: the leader in the middle, the rest out towards the corners
 * on an ellipse the shape of the box, so the space is used end to end.
 */
function Bubbles() {
  /* A fixed first guess, identical on the server and in the browser, then
     the real size once the box can be measured. */
  const [size, setSize] = useState({ w: 300, h: 260 });
  const top = CATEGORIES.slice(0, 5);
  const total = MONTH.spent;
  const [lead, ...rest] = top;
  const { w, h } = size;
  const leadR = Math.min(w, h) * 0.24;
  const radiusFor = (v: number) => Math.max(Math.min(w, h) * 0.09, leadR * Math.sqrt(v / lead[1]));
  /* Whole pixels: this panel is rendered on the server too, and a long
     decimal is written differently there than in the browser. */
  const px = Math.round;
  const bubbles = [
    ...rest.map(([name, v], i) => {
      const r = radiusFor(v);
      const angle = -Math.PI * 0.75 + (i * 2 * Math.PI) / rest.length;
      return { name, v, r: px(r), x: px(Math.cos(angle) * (w / 2 - r - 4)), y: px(h / 2 + Math.sin(angle) * (h / 2 - r - 4)) };
    }),
    // The leader last, so it layers above anything that crowds it.
    { name: lead[0], v: lead[1], r: px(leadR), x: 0, y: px(h / 2) },
  ];
  const { boxProps, bubbleProps } = useBubblePhysics(bubbles, `landing:${w}x${h}`);

  useEffect(() => {
    const el = boxProps.ref.current;
    if (!el) return;
    const measure = () => setSize({ w: Math.round(el.clientWidth), h: Math.round(el.clientHeight) });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the box element is stable
  }, []);

  return (
    <div {...boxProps} className="relative mt-3 min-h-[240px] w-full flex-1 select-none">
      {bubbles.map((b, i) => {
        const isLead = i === bubbles.length - 1;
        return (
          <span
            key={b.name}
            {...bubbleProps(i)}
            title={`${b.name}: ${inr(b.v)}`}
            className="group absolute left-1/2 top-0 cursor-grab data-[held]:cursor-grabbing will-change-transform"
            style={{ width: b.r * 2, height: b.r * 2, transform: `translate(${b.x - b.r}px, ${b.y - b.r}px)`, touchAction: 'none' }}
          >
            <span
              className="flex h-full w-full flex-col items-center justify-center rounded-full text-center leading-none transition-transform duration-200 group-hover:scale-[1.04] group-data-[held]:scale-[1.08]"
              style={{
                background: `color-mix(in oklab, var(--gold) ${isLead ? 30 : 14}%, var(--forest-ink))`,
                border: `1px solid color-mix(in oklab, var(--gold) ${isLead ? 70 : 35}%, transparent)`,
                boxShadow: isLead ? '0 0 24px -6px color-mix(in oklab, var(--gold) 60%, transparent)' : undefined,
                color: 'var(--onforest)',
              }}
            >
              <span className="lp-display lp-tab" style={{ fontSize: isLead ? 20 : 12 }}>
                {Math.round((b.v / total) * 100)}%
              </span>
              <span className="mt-1 max-w-[85%] truncate text-[8px]" style={{ color: 'var(--onforest-muted)' }}>
                {b.name}
              </span>
            </span>
          </span>
        );
      })}
    </div>
  );
}

/**
 * The single-entry card, its three readings, and the add sheet — working.
 *
 * Save an expense and it becomes the card, read the three ways the section
 * describes: its category's total, its person's total, and the month's —
 * each counting it once. Income is recorded apart from spending; a lend or a
 * borrow goes to the Ledger panel below, as it would in the app.
 */
type Mode = 'Expense' | 'Income' | 'I lent' | 'I borrowed';
const MODES: Mode[] = ['Expense', 'Income', 'I lent', 'I borrowed'];
const SPEND_CATS = ['Outside Food', 'Transport', 'Shopping', 'Bills'];
const INVEST_CATS = ['Investment', 'Bike fund'];
const WITH = ['Sankalp', 'Me', 'Mummy'];
const LEDGER_PEOPLE = ['Sankalp', 'Mummy', 'Aditi', 'Aarya', 'Rohan'];
const SOURCES = ['Salary', 'Freelance', 'Refund'];

export function MechanismPanels() {
  const hair = 'color-mix(in oklab, var(--onforest) 10%, transparent)';
  const wash = 'color-mix(in oklab, var(--onforest) 4%, transparent)';
  const demo = useDemo();

  const [mode, setMode] = useState<Mode>('Expense');
  const [amount, setAmount] = useState('350');
  const [category, setCategory] = useState('Outside Food');
  const [people, setPeople] = useState<string[]>(['Sankalp']);
  const [multi, setMulti] = useState(false);
  const [person, setPerson] = useState('Sankalp');
  const [source, setSource] = useState('Salary');
  const [day, setDay] = useState('Today');
  const [note, setNote] = useState('Chai');
  const [phase, setPhase] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [said, setSaid] = useState<string | null>(null);
  const [shake, setShake] = useState(0);

  /* Reset demo clears the sheet too. */
  useEffect(() => {
    setMode('Expense');
    setAmount('350');
    setPhase('idle');
    setSaid(null);
  }, [demo.epoch]);

  const latest = demo.expenses[demo.expenses.length - 1];
  const categoryTotal = demo.expenses.filter((e) => e.category === latest.category).reduce((t, e) => t + e.amount, 0);
  const lead = latest.people[0] ?? 'Me';
  const personTotal = demo.expenses.filter((e) => e.people.includes(lead)).reduce((t, e) => t + e.amount, 0);
  /* Investing is kept, not spent: it never adds to the month's spending. */
  const monthTotal = demo.expenses.filter((e) => !INVEST_CATS.includes(e.category)).reduce((t, e) => t + e.amount, 0);

  function pickPerson(n: string) {
    if (!multi) return setPeople([n]);
    setPeople((ps) => (ps.includes(n) ? (ps.length > 1 ? ps.filter((p) => p !== n) : ps) : [...ps, n]));
  }

  function save() {
    const value = Math.round(Number(amount.replace(/[^0-9.]/g, '')));
    if (!value || phase !== 'idle') {
      if (!value) setShake((n) => n + 1);
      return;
    }
    setPhase('saving');
    setSaid(null);
    setTimeout(() => {
      const date = day === 'Today' ? '31 Aug' : '30 Aug';
      if (mode === 'Expense') {
        demo.addExpense({ amount: value, category, people, date, note: note.trim() });
        setSaid(
          INVEST_CATS.includes(category)
            ? `Invested — kept, not spent. The August total stays ${inr(monthTotal)}.`
            : 'Saved once, read three ways above.',
        );
      } else if (mode === 'Income') {
        setSaid(`${inr(value)} of ${source.toLowerCase()} recorded — kept out of spending, so the August total stays ${inr(monthTotal)}.`);
      } else {
        demo.moveBalance(person, mode === 'I lent' ? value : -value);
        setSaid(`${mode === 'I lent' ? 'Lent to' : 'Borrowed from'} ${person} — in the ledger, not in spending. See it below.`);
      }
      setPhase('saved');
      setTimeout(() => setPhase('idle'), 1300);
    }, 380);
  }

  const saveLabel = { Expense: 'Save', Income: 'Save income', 'I lent': 'Record loan', 'I borrowed': 'Record borrowing' }[mode];

  return (
    <div className="relative">
      {/* The entry sits on the darkest green, so it reads as the subject. */}
      <div key={latest.id} className={`rounded-lg border p-6 ${latest.id ? 'lp-rise' : ''}`} style={{ borderColor: hair, background: 'var(--forest-ink)' }}>
        <div className="flex items-baseline justify-between">
          <p className="lp-display lp-tab text-4xl" style={{ color: 'var(--gold-soft)' }}>
            {inr(latest.amount)}
          </p>
          <p className="font-mono text-[11px]" style={{ color: 'var(--onforest-muted)' }}>
            {latest.date}
          </p>
        </div>
        <div className="mt-4 space-y-2 text-[13px]">
          <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: hair }}>
            <span className="lp-eyebrow text-[9px]" style={{ color: 'var(--onforest-muted)' }}>
              Category
            </span>
            <span style={{ color: 'var(--onforest)' }}>{latest.category}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="lp-eyebrow text-[9px]" style={{ color: 'var(--onforest-muted)' }}>
              With
            </span>
            <span style={{ color: 'var(--onforest)' }}>{latest.people.join(', ')}</span>
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3">
        {[
          [latest.category, categoryTotal],
          [latest.people.length > 1 ? `${lead} +${latest.people.length - 1}` : lead, personTotal],
          ['August total', monthTotal],
        ].map(([label, value]) => (
          /*
           * A flex column with the figure pushed to the bottom. The grid makes
           * the three tiles equal height, so mt-auto puts all three figures on
           * one line no matter how many lines their label needed.
           */
          <div key={String(label)} className="flex flex-col rounded border px-2.5 py-3.5 text-center" style={{ borderColor: hair, background: wash }}>
            <p className="lp-eyebrow text-[8px] leading-[1.35]" style={{ color: 'var(--onforest-muted)', letterSpacing: '0.16em' }}>
              {label}
            </p>
            <p className="lp-display lp-tab mt-auto whitespace-nowrap pt-3 text-[15px] sm:text-lg" style={{ color: 'var(--gold-soft)' }}>
              <Eased value={value as number} />
            </p>
          </div>
        ))}
      </div>

      {/* The add sheet as it is in the app: four kinds of entry, spending and
          investing kept in separate groups, any number of people. */}
      <div className="mt-3 rounded-lg border p-5" style={{ borderColor: hair, background: wash }}>
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-medium" style={{ color: 'var(--onforest)' }}>
            Add transaction
          </p>
          <button type="button" onClick={demo.reset} className="lp-hoverable text-[10px] uppercase tracking-[0.16em]" style={{ color: 'var(--onforest-muted)' }}>
            Reset demo
          </button>
        </div>

        <div role="tablist" className="mt-4 grid grid-cols-4 gap-1 rounded-full border p-1 text-[11px]" style={{ borderColor: hair }}>
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => {
                setMode(m);
                setSaid(null);
              }}
              className="whitespace-nowrap rounded-full px-2 py-1 text-center transition-colors"
              style={mode === m ? { background: 'color-mix(in oklab, var(--gold) 15%, transparent)', color: 'var(--gold-soft)' } : { color: 'var(--onforest-muted)' }}
            >
              {m}
            </button>
          ))}
        </div>

        <div key={mode} className="lp-fade">
          <div className="mt-4">
            <p className="lp-eyebrow text-[9px]" style={{ color: 'var(--onforest-muted)' }}>
              Amount
            </p>
            <label key={shake} className={`lp-display lp-tab mt-1 flex items-baseline text-2xl ${shake ? 'lp-shake' : ''}`} style={{ color: 'var(--onforest)' }}>
              ₹
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, '').slice(0, 7))}
                onKeyDown={(e) => e.key === 'Enter' && save()}
                inputMode="numeric"
                aria-label="Amount"
                className="w-full bg-transparent outline-none"
                style={{ caretColor: 'var(--gold)' }}
              />
            </label>
          </div>

          {mode === 'Expense' && (
            <>
              <div className="mt-4">
                <p className="lp-eyebrow text-[9px]" style={{ color: 'var(--onforest-muted)' }}>
                  Category
                </p>
                <Chips items={SPEND_CATS} picked={[category]} onPick={setCategory} />
                <p className="lp-eyebrow mt-3 text-[8px]" style={{ color: 'var(--onforest-muted)' }}>
                  Investing · kept, not spent
                </p>
                <Chips items={INVEST_CATS} picked={[category]} onPick={setCategory} />
              </div>
              <div className="mt-4">
                <p className="lp-eyebrow text-[9px]" style={{ color: 'var(--onforest-muted)' }}>
                  With
                </p>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                  {WITH.map((n) => (
                    <button key={n} type="button" onClick={() => pickPerson(n)} className="flex items-center gap-2 rounded-full border px-3 py-1 transition-colors" style={people.includes(n) ? PICKED : UNPICKED}>
                      <Initial name={n} size={16} />
                      {n}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setMulti((v) => !v);
                      if (multi) setPeople((ps) => ps.slice(0, 1));
                    }}
                    className="rounded-full border px-3 py-1 transition-colors"
                    style={multi ? PICKED : UNPICKED}
                  >
                    {multi ? '✓ Multiple' : '＋ Multiple'}
                  </button>
                </div>
              </div>
            </>
          )}

          {mode === 'Income' && (
            <div className="mt-4">
              <p className="lp-eyebrow text-[9px]" style={{ color: 'var(--onforest-muted)' }}>
                Source
              </p>
              <Chips items={SOURCES} picked={[source]} onPick={setSource} />
            </div>
          )}

          {(mode === 'I lent' || mode === 'I borrowed') && (
            <div className="mt-4">
              <p className="lp-eyebrow text-[9px]" style={{ color: 'var(--onforest-muted)' }}>
                {mode === 'I lent' ? 'Lent to' : 'Borrowed from'}
              </p>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                {LEDGER_PEOPLE.map((n) => (
                  <button key={n} type="button" onClick={() => setPerson(n)} className="flex items-center gap-2 rounded-full border px-3 py-1 transition-colors" style={person === n ? PICKED : UNPICKED}>
                    <Initial name={n} size={16} />
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <p className="lp-eyebrow text-[9px]" style={{ color: 'var(--onforest-muted)' }}>
                Date
              </p>
              <Chips items={['Today', 'Yesterday']} picked={[day]} onPick={setDay} />
            </div>
            <div>
              <p className="lp-eyebrow text-[9px]" style={{ color: 'var(--onforest-muted)' }}>
                Note
              </p>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 40))}
                aria-label="Note"
                className="mt-2 w-full border-b bg-transparent pb-1 text-[12px] outline-none"
                style={{ borderColor: hair, color: 'var(--onforest)' }}
              />
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={save}
          aria-busy={phase === 'saving'}
          className={`relative mt-5 w-full overflow-hidden rounded py-3 text-center text-[11px] font-semibold uppercase tracking-[0.2em] ${phase === 'saved' ? 'lp-saved' : ''}`}
          style={{ background: 'var(--gold)', color: 'var(--forest-deep)' }}
        >
          {phase === 'saving' && <span className="lp-saving absolute inset-y-0 left-0" aria-hidden />}
          <span className="relative">{phase === 'saving' ? 'Saving…' : phase === 'saved' ? '✓ Saved' : saveLabel}</span>
        </button>
        {said && (
          <p role="status" className="lp-rise mt-3 text-[12px] leading-relaxed" style={{ color: 'var(--onforest-muted)' }}>
            {said}
            {(mode === 'I lent' || mode === 'I borrowed') && (
              <a href="#ledger" className="ml-1" style={{ color: 'var(--gold-soft)' }}>
                ↓
              </a>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

function Chips({ items, picked, onPick }: { items: string[]; picked: string[]; onPick: (v: string) => void }) {
  return (
    <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
      {items.map((c) => (
        <button key={c} type="button" onClick={() => onPick(c)} className="rounded-full border px-3 py-1 transition-colors" style={picked.includes(c) ? PICKED : UNPICKED}>
          {c}
        </button>
      ))}
    </div>
  );
}

/**
 * People as it is now — and working. Net exposure, the two sides of it on one
 * bar with a knob where they meet, and each person's balance with the action
 * it needs. Record a lend or a borrow and the knob swings and the row
 * lights; settle a debt and it counts itself off to "Settled ✓".
 */
const AMOUNTS = [500, 1000, 2500];

export function LedgerPanel() {
  const demo = useDemo();
  const owedToMe = demo.balances.reduce((t, [, v]) => t + Math.max(0, v), 0);
  const owedByMe = demo.balances.reduce((t, [, v]) => t + Math.max(0, -v), 0);
  const net = owedToMe - owedByMe;
  const square = owedToMe === 0 && owedByMe === 0;
  const share = square ? 0.5 : owedToMe / (owedToMe + owedByMe);

  const [form, setForm] = useState<null | 'lent' | 'borrowed'>(null);
  const [who, setWho] = useState('Sankalp');
  const [howMuch, setHowMuch] = useState(1000);
  /* Which row just moved, and which was just settled, for their highlight. */
  const [flash, setFlash] = useState<{ name: string; kind: 'moved' | 'settled'; id: number } | null>(null);
  const [reminded, setReminded] = useState<string | null>(null);

  useEffect(() => {
    setForm(null);
    setFlash(null);
  }, [demo.epoch]);

  const mark = (name: string, kind: 'moved' | 'settled') => setFlash((f) => ({ name, kind, id: (f?.id ?? 0) + 1 }));

  function record() {
    demo.moveBalance(who, form === 'lent' ? howMuch : -howMuch);
    mark(who, 'moved');
    setForm(null);
  }

  return (
    // One box, not two — the section already provides the forest surround.
    <div className="rounded-lg border p-6" style={{ borderColor: HAIR, background: 'var(--forest-ink)' }}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <p className="lp-eyebrow text-[9px]" style={{ color: 'var(--onforest-muted)' }}>
            Net exposure
          </p>
          {!square && (
            <span className="rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-[0.14em]" style={net < 0 ? PICKED : UNPICKED}>
              {net < 0 ? 'Net payable' : 'Net receivable'}
            </span>
          )}
        </div>
        <button type="button" onClick={demo.reset} className="lp-hoverable text-[10px] uppercase tracking-[0.16em]" style={{ color: 'var(--onforest-muted)' }}>
          Reset demo
        </button>
      </div>
      <p className="mt-2 flex flex-wrap items-baseline gap-2">
        <span className="lp-display lp-tab text-4xl" style={{ color: net < 0 ? 'var(--gold-soft)' : 'var(--onforest)' }}>
          <Eased value={Math.abs(net)} />
        </span>
        <span className="text-[12px]" style={{ color: 'var(--onforest-muted)' }}>
          {square ? 'everything is settled' : net < 0 ? 'you owe, on balance' : 'owed to you, on balance'}
        </span>
      </p>

      <div className="mt-5">
        <div className="flex items-baseline justify-between text-[11px]" style={{ color: 'var(--onforest-muted)' }}>
          <span>
            They owe me{' '}
            <span className="lp-tab" style={{ color: 'var(--onforest)' }}>
              <Eased value={owedToMe} />
            </span>
          </span>
          <span>
            I owe{' '}
            <span className="lp-tab" style={{ color: 'var(--gold-soft)' }}>
              <Eased value={owedByMe} />
            </span>
          </span>
        </div>
        {/* One bar, both sides, and the knob where they meet — pulled across
            with an overshoot when a balance changes. */}
        <div className="relative mt-2 h-1.5">
          <div className="absolute inset-0 flex gap-px overflow-hidden rounded-full" style={{ background: 'color-mix(in oklab, var(--onforest) 8%, transparent)' }}>
            <span className="tug" style={{ width: `${share * 100}%`, background: 'color-mix(in oklab, var(--onforest) 70%, transparent)', opacity: square ? 0 : 1 }} />
            <span className="tug" style={{ width: `${(1 - share) * 100}%`, background: 'var(--gold)', opacity: square ? 0 : 1 }} />
          </div>
          <span className="absolute -bottom-1 -top-1 left-1/2 w-px" style={{ background: HAIR }} aria-hidden />
          <span
            className="tug absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ left: `${share * 100}%`, background: 'var(--onforest)', border: '2px solid var(--forest-ink)' }}
            aria-hidden
          />
        </div>
        <div className="lp-tab mt-2 flex justify-between text-[10px]" style={{ color: 'var(--onforest-muted)' }}>
          {square ? (
            <span className="w-full text-center">All square, both ways</span>
          ) : (
            <>
              <span>receivable {Math.round(share * 100)}%</span>
              <span>payable {Math.round((1 - share) * 100)}%</span>
            </>
          )}
        </div>
      </div>

      {/* The two actions that change it. */}
      <div className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
        {(['lent', 'borrowed'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setForm((f) => (f === k ? null : k))}
            className="rounded-full border py-1.5 transition-colors"
            style={form === k ? PICKED : UNPICKED}
          >
            {k === 'lent' ? '↗ I lent money' : '↙ I borrowed money'}
          </button>
        ))}
      </div>
      {form && (
        <div className="lp-rise mt-3 rounded border p-3" style={{ borderColor: HAIR, background: WASH }}>
          <p className="lp-eyebrow text-[8px]" style={{ color: 'var(--onforest-muted)' }}>
            {form === 'lent' ? 'Lent to' : 'Borrowed from'}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
            {demo.balances.map(([n]) => (
              <button key={n} type="button" onClick={() => setWho(n)} className="rounded-full border px-2.5 py-0.5 transition-colors" style={who === n ? PICKED : UNPICKED}>
                {n}
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
            {AMOUNTS.map((a) => (
              <button key={a} type="button" onClick={() => setHowMuch(a)} className="lp-tab rounded-full border px-2.5 py-0.5 transition-colors" style={howMuch === a ? PICKED : UNPICKED}>
                {inr(a)}
              </button>
            ))}
            <button
              type="button"
              onClick={record}
              className="ml-auto rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]"
              style={{ background: 'var(--gold)', color: 'var(--forest-deep)' }}
            >
              Record
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 space-y-1">
        {demo.balances.map(([name, amt]) => (
          <LedgerRow
            key={name}
            name={name}
            amount={amt}
            flash={flash?.name === name ? flash : null}
            reminded={reminded === name}
            onSettle={() => {
              demo.settle(name);
              mark(name, 'settled');
            }}
            onRemind={() => {
              setReminded(name);
              setTimeout(() => setReminded((r) => (r === name ? null : r)), 1600);
            }}
          />
        ))}
      </div>
    </div>
  );
}

function LedgerRow({
  name,
  amount,
  flash,
  reminded,
  onSettle,
  onRemind,
}: {
  name: string;
  amount: number;
  flash: { kind: 'moved' | 'settled'; id: number } | null;
  reminded: boolean;
  onSettle: () => void;
  onRemind: () => void;
}) {
  /* A settled balance counts itself off, slower than a figure usually moves,
     because the count is the point — then says so. */
  const shown = useEased(amount, flash?.kind === 'settled' ? 700 : 450);
  const settled = amount === 0 && shown === 0;

  return (
    <div
      key={flash?.id}
      className={`-mx-2 flex items-center justify-between gap-3 rounded border-b px-2 py-2.5 text-[13px] last:border-0 ${
        flash?.kind === 'settled' ? 'lp-sweep' : flash?.kind === 'moved' ? 'lp-flash' : ''
      }`}
      style={{ borderColor: HAIR }}
    >
      <span className="flex min-w-0 items-center gap-3" style={{ color: 'var(--onforest)' }}>
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border font-mono text-[10px]"
          style={{ borderColor: 'color-mix(in oklab, var(--onforest) 20%, transparent)', color: 'var(--gold-soft)' }}
        >
          {name[0]}
        </span>
        <span className="truncate">{name}</span>
        {amount < 0 && (
          <span className="hidden rounded-full border px-1.5 py-px text-[8px] uppercase tracking-[0.12em] sm:inline" style={PICKED}>
            unsettled
          </span>
        )}
        {amount > 0 && (
          <span className="hidden rounded-full border px-1.5 py-px text-[8px] uppercase tracking-[0.12em] sm:inline" style={UNPICKED}>
            receivable
          </span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-3">
        {settled ? (
          <span className="lp-tab" style={{ color: 'var(--gold-soft)' }}>
            Settled ✓
          </span>
        ) : (
          <span className="lp-tab" style={{ color: shown > 0 ? 'var(--onforest)' : 'var(--gold-soft)' }}>
            {shown > 0 ? '+' : '−'}
            {inr(shown)}
          </span>
        )}
        {amount < 0 && (
          <button type="button" onClick={onSettle} className="rounded-full px-2.5 py-1 text-[10px] font-semibold" style={{ background: 'var(--gold)', color: 'var(--forest-deep)' }}>
            Settle
          </button>
        )}
        {amount > 0 && (
          <button
            type="button"
            onClick={onRemind}
            className="rounded-full px-2.5 py-1 text-[10px] font-semibold transition-colors"
            style={{ border: '1px solid color-mix(in oklab, var(--onforest) 25%, transparent)', color: reminded ? 'var(--gold-soft)' : 'var(--onforest)' }}
          >
            {reminded ? 'Reminded ✓' : 'Remind'}
          </button>
        )}
      </span>
    </div>
  );
}
