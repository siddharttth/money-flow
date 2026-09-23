'use client';

import { ReactNode, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { formatINR } from '@/lib/money';
import { Collapse, CountMoney } from './motion';

export function Card({
  children,
  className = '',
  style,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'children' | 'className' | 'style'>) {
  /* Extra attributes pass through — `data-pulse` from the motion layer. */
  return (
    <div className={`card p-4 sm:p-5 ${className}`} style={style} {...rest}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <h2 className="text-[15px] font-semibold">{children}</h2>
      {action}
    </div>
  );
}

/**
 * A section heading that sits on the page rather than inside a card — an
 * uppercase label with a rule running out to the action on the right. Used to
 * group content without wrapping every group in another box.
 */
export function SectionHead({ label, action }: { label: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 sm:gap-4 mb-3">
      {/* ReactNode, not string — a section can carry a status badge beside its
          name, and "Budgets · Over by ₹5,612" is one heading, not two. */}
      <span className="label mb-0 shrink-0">{label}</span>
      <span className="hair flex-1" aria-hidden />
      {action}
    </div>
  );
}

/**
 * The top of every screen. One shape everywhere: a mono eyebrow, a serif
 * title, and a slot on the right that holds the controls for that screen.
 * On a phone the controls wrap to their own full-width line rather than
 * squeezing the title into two words per line.
 */
export function PageHeader({
  eyebrow,
  title,
  sub,
  actions,
}: {
  eyebrow?: string;
  title: string;
  sub?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 mb-5">
      <div className="min-w-0">
        {eyebrow && <p className="label mb-1.5">{eyebrow}</p>}
        <h1 className="text-[1.6rem] sm:text-3xl font-semibold leading-none">{title}</h1>
        {sub && <p className="muted text-[13px] mt-2">{sub}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0 max-sm:w-full">{actions}</div>}
    </header>
  );
}

/**
 * The screen's headline number. Everything else on the page is a footnote to
 * it, so it gets the largest type in the app and nothing shares its line.
 */
export function HeroFigure({
  label,
  minor,
  delta,
  note,
}: {
  label: string;
  minor: number;
  delta?: ReactNode;
  note?: ReactNode;
}) {
  return (
    <div>
      <p className="label mb-2">{label}</p>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <CountMoney minor={minor} className="text-[2.6rem] sm:text-5xl font-semibold leading-none tracking-tight" />
        {delta}
      </div>
      {note && <p className="muted text-[13px] mt-2.5">{note}</p>}
    </div>
  );
}

/**
 * The change chip. Spending more is red and spending less is green — the
 * opposite of a stock ticker, and the right way round for an expense ledger.
 */
export function Delta({
  pct,
  invert = false,
  /** Named inside the pill — "↑ 4.1% vs last month" reads as one claim. */
  suffix,
}: {
  pct: number | null | undefined;
  invert?: boolean;
  suffix?: string;
}) {
  if (pct == null || !Number.isFinite(pct)) return null;

  // A change too small to round to a tenth of a percent is not a change, and
  // an arrow on it points somewhere the figure did not go.
  const flat = Math.abs(pct) < 0.05;
  const up = pct > 0;
  const bad = invert ? !up : up;

  return (
    <span
      className="num inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap"
      style={{
        color: flat ? 'var(--text-muted)' : bad ? 'var(--rule-red)' : 'var(--credit)',
        background: flat ? 'var(--surface-2)' : bad ? 'var(--rule-red-soft)' : 'var(--credit-soft)',
      }}
    >
      {flat ? 'no change' : `${up ? '\u2191' : '\u2193'} ${Math.abs(pct).toFixed(Math.abs(pct) >= 10 ? 0 : 1)}%`}
      {suffix && !flat && <span className="font-normal opacity-80">{suffix}</span>}
    </span>
  );
}

/**
 * Related figures on ONE surface, split by hairlines. Separate cards in a row
 * read as unrelated things; this reads as one summary. Two per row on a phone,
 * which keeps every figure at a readable size instead of shrinking to fit four.
 */
export function StatStrip({
  items,
  cols = 4,
  /**
   * Separate cards with their own borders, as the Obsidian screens draw them,
   * rather than one card divided by hairlines. The joined form is still right
   * where the strip is a footnote under a hero; the split form is right where
   * the four figures ARE the section.
   */
  split = false,
  bare = false,
  glow,
}: {
  items: {
    label: string;
    minor?: number;
    value?: string;
    sub?: string;
    tone?: string;
    /** A quiet mark in the corner, the way the reference cards carry one. */
    icon?: ReactNode;
    /** An accent rule under the figure, at 0–1 of the cell width. */
    meter?: number;
    meterTone?: string;
    /** Anything the figure needs beneath it that is not a sub-line — a
        second amount, a link — when a card's detail folds into its cell. */
    extra?: ReactNode;
    /** Where the figure leads: the whole cell becomes the link. */
    href?: string;
    /** Or what it does — a filter it switches on. */
    onClick?: () => void;
    /** Pressed state, for a cell that toggles something. */
    active?: boolean;
  }[];
  cols?: 2 | 3 | 4;
  split?: boolean;
  /**
   * No card of its own — the strip is the bottom row of a card it shares.
   * Wrap it in a CardStrip so the hairlines run to the card's edges.
   */
  bare?: boolean;
  /**
   * The ambient bloom, for a strip that is the page's headline rather than a
   * footnote under one. Pass the tint class ('' for the accent). Medium, not
   * large: on a card this short the large disc is cut off into a patch.
   */
  glow?: string;
}) {
  const wide = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-4' }[cols];

  /* An odd last cell spans the row at two-up, rather than leaving a hole
     the hairline background shows through. */
  const oddLast = (i: number) => (i === items.length - 1 && items.length % 2 === 1 ? 'max-sm:col-span-2' : '');

  const cells = items.map((it, i) => {
    const pressable = it.href || it.onClick;
    const cls = `${split ? 'card !p-4 min-w-0' : 'px-3.5 py-3 sm:px-5 sm:py-4 min-w-0'} ${oddLast(i)} ${
      pressable ? 'row block text-left w-full' : ''
    }`;
    const inner = (
    /*
     * Labels wrap rather than truncate — "Monthly avera…" is worse than two
     * lines — and the label block reserves two lines whether it needs them or
     * not, so the figures below sit on one line across the row. Pushing the
     * figures down with mt-auto instead would align their bottoms, which is
     * not the same thing once one cell has a sub-line and its neighbour does
     * not.
     */
      <>
      <div className="flex items-start justify-between gap-2">
        <p className="label mb-1.5 leading-[1.35] min-h-[1.85rem]">{it.label}</p>
        {it.icon && <span className="muted shrink-0 mt-[-2px]">{it.icon}</span>}
      </div>
      {it.minor !== undefined ? (
        <CountMoney
          minor={it.minor}
          className="text-[17px] sm:text-xl font-semibold"
          style={it.tone ? { color: it.tone } : undefined}
        />
      ) : (
        <p
          className="text-[17px] sm:text-xl font-semibold truncate"
          style={it.tone ? { color: it.tone } : undefined}
        >
          {it.value ?? '\u2014'}
        </p>
      )}
      {it.sub && <p className="muted text-[11px] mt-1 truncate">{it.sub}</p>}
      {it.extra}
      {it.meter !== undefined && (
        <span
          className="block h-[3px] rounded-full mt-2.5 overflow-hidden"
          style={{ background: 'var(--surface-2)' }}
        >
          <span
            className="block h-full rounded-full"
            style={{
              width: `${Math.max(2, Math.min(100, it.meter * 100))}%`,
              background: it.meterTone ?? it.tone ?? 'var(--accent)',
            }}
          />
        </span>
      )}
      </>
    );
    if (it.href)
      return (
        <Link key={it.label} href={it.href} className={cls} style={it.active ? { background: 'var(--accent-soft)' } : undefined}>
          {inner}
        </Link>
      );
    if (it.onClick)
      return (
        <button
          key={it.label}
          type="button"
          /* flex-col from the top: a button centres its contents vertically
             when the row stretches it, which dropped these figures below
             their neighbours'. */
          className={`${cls} flex flex-col justify-start`}
          onClick={it.onClick}
          aria-pressed={it.active}
          style={it.active ? { background: 'var(--accent-soft)' } : undefined}
        >
          {inner}
        </button>
      );
    return (
      <div key={it.label} className={cls}>
        {inner}
      </div>
    );
  });

  if (split) return <div className={`grid grid-cols-2 ${wide} gap-4`}>{cells}</div>;

  if (bare) return <div className={`grid grid-cols-2 ${wide} hair-grid`}>{cells}</div>;

  return (
    <div className={`card overflow-hidden ${glow !== undefined ? `glow-card ${glow}` : ''}`}>
      <div className={`grid grid-cols-2 ${wide} hair-grid`}>{cells}</div>
    </div>
  );
}

/**
 * One part of a card that holds several — a hairline above it and the same
 * gap every sub-section uses, so a merged card reads as one surface with
 * chapters rather than cards stacked inside a card.
 */
export function CardSection({
  label,
  action,
  children,
  className = '',
}: {
  label?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mt-5 pt-4 border-t ${className}`} style={{ borderColor: 'var(--border)' }}>
      {(label || action) && (
        <div className="flex items-baseline justify-between gap-3 mb-3">
          {label && <span className="label mb-0">{label}</span>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * A bare StatStrip as the bottom row of a card: pulled out to the card's
 * edges so its hairlines meet the border, with a rule above it. Pass the
 * card's own padding so the bleed matches.
 */
export function CardStrip({ children, pad = 'md' }: { children: ReactNode; pad?: 'md' | 'lg' }) {
  const bleed = pad === 'lg' ? '-mx-5 -mb-5 sm:-mx-6 sm:-mb-6' : '-mx-4 -mb-4 sm:-mx-5 sm:-mb-5';
  return (
    <div className={`relative mt-5 border-t overflow-hidden rounded-b-[0.875rem] ${bleed}`} style={{ borderColor: 'var(--border)' }}>
      {children}
    </div>
  );
}

/**
 * A section read less often than the rest of the page, folded to one line.
 * The summary rides on the closed header, so the headline figure is visible
 * without opening it — collapsing hides the working, never the answer.
 */
export function Disclosure({
  title,
  summary,
  children,
  defaultOpen = false,
}: {
  title: ReactNode;
  summary?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();

  return (
    <div>
      <button
        type="button"
        className="row w-full flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 text-left"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="label mb-0 shrink-0">{title}</span>
        <span className="flex items-center gap-2.5 min-w-0">
          {summary && <span className="text-[12.5px] truncate">{summary}</span>}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className="muted shrink-0 transition-transform"
            style={{ transform: open ? 'rotate(180deg)' : undefined, transitionDuration: '150ms' }}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>
      <Collapse open={open} id={id}>
        <div className="px-4 sm:px-5 pb-5 pt-1">{children}</div>
      </Collapse>
    </div>
  );
}

/**
 * A line of prose with the figures set in mono — the "insight" voice used
 * across Analytics. Reads as a sentence, but every number is still a number.
 */
export function Insight({ children, tone }: { children: ReactNode; tone?: 'warn' | 'good' }) {
  return (
    <p
      className="text-[13px] leading-relaxed pl-3 border-l-2"
      style={{
        borderColor: tone === 'warn' ? 'var(--rule-red)' : tone === 'good' ? 'var(--credit)' : 'var(--border-strong)',
        color: 'var(--text-muted)',
      }}
    >
      {children}
    </p>
  );
}

/** Segmented control. One row, equal widths, 38px tall — thumb-sized. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className = '',
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div
      className={`inline-flex p-0.5 rounded-full ${className}`}
      style={{ background: 'var(--surface-2)' }}
      role="tablist"
    >
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className="flex-1 px-3 sm:px-4 h-[38px] rounded-full text-xs font-semibold whitespace-nowrap transition-colors"
          style={{
            transitionDuration: '150ms',
            background: value === o.value ? 'var(--surface)' : 'transparent',
            color: value === o.value ? 'var(--text)' : 'var(--text-muted)',
            boxShadow: value === o.value ? 'var(--shadow)' : 'none',
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Nothing here yet. The mark is drawn rather than an emoji — emoji brought
 * their own palette and cartoon weight into a page built from two colours.
 */
export function EmptyState({
  title,
  hint,
  action,
  compact = false,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  /**
   * One quiet line, no mark — for an empty half of a paired or tabbed card,
   * where the full block would make the empty side taller than the full one.
   */
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="py-3">
        <p className="text-[13px] font-semibold">{title}</p>
        {hint && <p className="muted text-[12px] mt-0.5 leading-relaxed">{hint}</p>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    );
  }

  return (
    <div className="text-center py-10 px-4">
      <svg
        width="34"
        height="34"
        viewBox="0 0 24 24"
        className="mx-auto mb-3"
        style={{ color: 'var(--border-strong)' }}
        aria-hidden
      >
        <rect
          x="3.5"
          y="3.5"
          width="17"
          height="17"
          rx="3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeDasharray="3 3"
        />
        <path d="M8 12h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      <p className="font-semibold text-sm">{title}</p>
      {hint && <p className="muted text-[13px] mt-1.5 max-w-xs mx-auto leading-relaxed">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = 'h-4 w-full' }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/5" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="text-center py-8 px-4">
      <div className="text-3xl mb-2">⚠️</div>
      <p className="font-medium">Couldn&apos;t load this</p>
      <p className="muted text-sm mt-1">{message}</p>
      {onRetry && (
        <button className="btn btn-ghost mt-4" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

/**
 * Bottom sheet on mobile, centred dialog on desktop.
 *
 * MOBILE KEYBOARD
 * ---------------
 * iOS does not shrink the layout viewport when the software keyboard opens —
 * `innerHeight` and `100dvh` stay at full height. A sheet anchored to the
 * bottom of that viewport therefore sits *behind* the keyboard, taking the
 * Save button and the lower fields with it.
 *
 * `visualViewport` is the only thing that does report the visible area, so the
 * overlay is sized and positioned from it. The sheet then always ends exactly
 * where the keyboard begins.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  // Must sit with the other hooks: anything below the `if (!open) return null`
  // early return would be called conditionally and break hook ordering.
  const swallowNextClick = useRef(false);
  // null until measured, so SSR and no-visualViewport browsers fall back to inset-0.
  const [area, setArea] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);

    /*
     * iOS ignores `overflow: hidden` on body, so the page scrolls behind the
     * sheet. Pinning the body and restoring the offset afterwards is the only
     * lock that holds there.
     */
    const scrollY = window.scrollY;
    const body = document.body;
    const prev = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow,
      paddingRight: body.style.paddingRight,
    };
    /*
     * Pinning the body takes the page's scrollbar away with it. Where that
     * scrollbar occupies real width — Windows, Linux, macOS set to always show
     * them — the page and this centred sheet both slide right by its width the
     * moment the sheet opens, and back again when it closes. Holding the space
     * open keeps everything still.
     */
    const gutter = window.innerWidth - document.documentElement.clientWidth;
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    if (gutter > 0) body.style.paddingRight = `${gutter}px`;

    const vv = window.visualViewport;
    const sync = () => {
      if (!vv) return;
      /*
       * Both axes, not just the vertical one. The overlay was pinned to the
       * layout viewport horizontally, so any time the visual viewport was
       * offset sideways — an iOS pinch, a rubber-band pan, the keyboard
       * animating in — the sheet drifted left and right against the screen
       * while the page behind it stayed put.
       */
      setArea({ top: vv.offsetTop, left: vv.offsetLeft, width: vv.width, height: vv.height });
    };
    sync();
    vv?.addEventListener('resize', sync);
    vv?.addEventListener('scroll', sync);

    return () => {
      document.removeEventListener('keydown', onKey);
      vv?.removeEventListener('resize', sync);
      vv?.removeEventListener('scroll', sync);
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.width = prev.width;
      body.style.overflow = prev.overflow;
      body.style.paddingRight = prev.paddingRight;
      window.scrollTo(0, scrollY);
      setArea(null);
    };
  }, [open, onClose]);

  /**
   * Keep a focused field clear of the keyboard — and nothing more than that.
   *
   * This used to centre every focused field. Combined with the amount input
   * autofocusing on mount, the sheet opened and then immediately scrolled
   * itself so the amount sat mid-panel, leaving a band of dead space under the
   * header and pushing the rest below the fold. It read as the sheet shaking
   * on open.
   *
   * Two rules now: ignore focus while the sheet is still animating in, and
   * scroll by the smallest amount that works — a field already fully visible
   * does not move at all.
   */
  useEffect(() => {
    if (!open) return;
    const el = dialogRef.current;
    if (!el) return;

    // The entrance transition is 180ms; anything inside that window is the
    // sheet arriving, not the user choosing a field.
    let settled = false;
    const settle = setTimeout(() => {
      settled = true;
    }, 260);

    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (!settled || !/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      // Wait for the keyboard, then move only if the field is not fully in view.
      setTimeout(() => {
        const scroller = target.closest('[data-modal-scroll]');
        if (!scroller) return;
        const a = target.getBoundingClientRect();
        const b = scroller.getBoundingClientRect();
        if (a.top >= b.top && a.bottom <= b.bottom) return;
        target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }, 250);
    };

    el.addEventListener('focusin', onFocusIn);
    return () => {
      clearTimeout(settle);
      el.removeEventListener('focusin', onFocusIn);
    };
  }, [open]);

  if (!open) return null;

  /*
   * A backdrop tap while typing dismisses the keyboard rather than the sheet —
   * closing there would throw away a half-entered expense, and the area just
   * above the keyboard is exactly where stray taps land.
   *
   * The check has to happen on pointerdown: the browser blurs the focused
   * input on pointerdown, so by the time click fires there is nothing left to
   * detect. pointerdown records it, click acts on the record.
   */
  const onBackdropPointerDown = (e: React.PointerEvent) => {
    if (e.target !== e.currentTarget) return;
    const active = document.activeElement as HTMLElement | null;
    swallowNextClick.current = !!(
      active &&
      dialogRef.current?.contains(active) &&
      /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)
    );
    // The browser's own blur closes the keyboard; we only suppress the close.
  };

  const onBackdropClick = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget) return;
    if (swallowNextClick.current) {
      swallowNextClick.current = false;
      return;
    }
    onClose();
  };

  return (
    <div
      className="fixed z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-[2px]"
      style={
        area
          ? { top: area.top, left: area.left, width: area.width, height: area.height }
          : { top: 0, bottom: 0, left: 0, right: 0 }
      }
      onPointerDown={onBackdropPointerDown}
      onClick={onBackdropClick}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`card animate-in w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'} flex flex-col rounded-b-none sm:rounded-b-xl`}
        /* Always leave a strip of backdrop above the sheet: it keeps the
           bottom-sheet affordance and gives a tap target for dismissing. */
        style={{ maxHeight: 'calc(100% - 28px)' }}
      >
        <div
          className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b shrink-0"
          style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
        >
          <h3 className="font-semibold">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="muted -mr-2 w-11 h-11 flex items-center justify-center rounded-full text-2xl leading-none"
          >
            ×
          </button>
        </div>
        {/* Only this region scrolls, so the sticky footer inside it stays put. */}
        {/* scroll-padding keeps a field scrolled to the edge from landing
            under the sticky action bar that every form pins to the bottom. */}
        <div
          data-modal-scroll
          className="sheet-body overflow-y-auto overscroll-contain flex-1"
          style={{ scrollPaddingBottom: '5.5rem', scrollPaddingTop: '0.5rem' }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export function Toast({
  message,
  tone = 'success',
  action,
}: {
  message: string;
  tone?: 'success' | 'error';
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 bottom-24 sm:bottom-8 z-[60] animate-in flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg"
      style={{
        background: tone === 'error' ? 'var(--danger)' : 'var(--text)',
        color: tone === 'error' ? '#fff' : 'var(--surface)',
      }}
      role="status"
    >
      {message}
      {action && (
        <button
          onClick={action.onClick}
          className="font-semibold underline underline-offset-2 shrink-0"
          style={{ color: 'inherit' }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

/**
 * Chip picker. Defaults to wrapping so every option is visible at once —
 * horizontal scrolling hides most choices and costs a swipe per pick.
 * Pass `scroll` for genuinely long lists where wrapping would dominate the page.
 */
export function ChipRow({ children, scroll = false }: { children: ReactNode; scroll?: boolean }) {
  return (
    <div className={scroll ? 'scroll-x flex gap-2 pb-1 -mx-1 px-1' : 'flex flex-wrap gap-2'}>{children}</div>
  );
}

/**
 * A rupee figure. Always monospace, and a genuine zero is dimmed — "₹0 today"
 * is the absence of information and shouldn't compete with a real number.
 */
export function Money({
  minor,
  compact = false,
  decimals = false,
  className = '',
  style,
}: {
  minor: number;
  compact?: boolean;
  decimals?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span className={`num ${className}`} data-zero={minor === 0} style={style}>
      {formatINR(minor, { compact, decimals })}
    </span>
  );
}

export function StatTile({
  label,
  value,
  minor,
  sub,
  tone,
}: {
  label: string;
  /** Pass `minor` for money (mono + zero dimming); `value` for anything else. */
  value?: string;
  minor?: number;
  sub?: string;
  tone?: 'up' | 'down';
}) {
  return (
    <div className="card p-3.5 sm:p-4">
      <p className="label mb-1">{label}</p>
      {minor !== undefined ? (
        <Money minor={minor} className="text-xl sm:text-2xl font-semibold" />
      ) : (
        <p className="text-xl sm:text-2xl font-semibold">{value}</p>
      )}
      {sub && (
        <p
          className="text-xs mt-1"
          style={{ color: tone === 'up' ? 'var(--danger)' : tone === 'down' ? 'var(--success)' : 'var(--text-muted)' }}
        >
          {sub}
        </p>
      )}
    </div>
  );
}
