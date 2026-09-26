'use client';

import {
  ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { formatINR } from '@/lib/money';
import { useToast } from './toast';

/*
 * MOTION FOR CHANGES, NEVER FOR ARRIVAL.
 *
 * Everything here animates a value that moved while you were looking at it —
 * a total after an edit, a bar after a contribution, a month switched — and
 * nothing that is simply turning up. A page loading is not an event; a figure
 * counting up from zero on every visit is decoration, and the app would feel
 * slower for it.
 *
 * The one hard part is telling the two apart, because most figures render ₹0
 * while their data loads and then jump to the real value — which looks,
 * from inside a component, exactly like a change. So every request the app
 * makes is counted, and a component only goes "live" once the requests in
 * flight when it mounted have finished and nothing has been fetched for a
 * moment. Until then every change snaps; after it, every change animates.
 */

/* ---------- requests in flight ---------- */

let inflight = 0;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Wrap a fetch so the motion layer knows the page is still arriving. */
export function trackFetch<T>(p: Promise<T>): Promise<T> {
  inflight += 1;
  notify();
  return p.finally(() => {
    inflight -= 1;
    notify();
  });
}

/** How long the page has to be quiet before its figures count as settled. */
const SETTLE_MS = 450;

/**
 * False until this component's page has finished loading, then true for good.
 * Changes before that are the page arriving and must not animate.
 */
export function useMotionLive(): boolean {
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (live) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      clearTimeout(timer);
      if (inflight === 0) timer = setTimeout(() => inflight === 0 && setLive(true), SETTLE_MS);
    };
    check();
    listeners.add(check);
    return () => {
      listeners.delete(check);
      clearTimeout(timer);
    };
  }, [live]);

  return live;
}

/* ---------- reduced motion ---------- */

const REDUCED = '(prefers-reduced-motion: reduce)';

function subscribeReduced(cb: () => void) {
  const mq = window.matchMedia?.(REDUCED);
  mq?.addEventListener('change', cb);
  return () => mq?.removeEventListener('change', cb);
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReduced,
    () => !!window.matchMedia?.(REDUCED).matches,
    () => false,
  );
}

/** Whether a change right now should animate: the page is up, and motion is welcome. */
export function useMotionOk(): boolean {
  const live = useMotionLive();
  const reduced = useReducedMotion();
  return live && !reduced;
}

/* ---------- counting figures ---------- */

const COUNT_MS = 220;
const INTRO_MS = 300;

/**
 * The number to draw for a value that may be changing: the value itself,
 * until it moves after the page has settled — then a 220ms ease-out from
 * where it was to where it is going. Integer paise throughout, so a figure
 * mid-count is still a real amount.
 */
export function useTween(value: number): number {
  const ok = useMotionOk();
  const [shown, setShown] = useState(value);
  const shownRef = useRef(value);
  const raf = useRef(0);

  useEffect(() => {
    cancelAnimationFrame(raf.current);
    const from = shownRef.current;
    if (!ok || from === value) {
      shownRef.current = value;
      setShown(value);
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      /* Clamped at both ends: a frame's timestamp can fall a hair before
         `start`, and a negative progress through the ease overshoots below
         the starting figure — a total flashing negative on its way up. */
      const p = Math.min(1, Math.max(0, (now - start) / COUNT_MS));
      const eased = 1 - Math.pow(1 - p, 3);
      const next = p >= 1 ? value : Math.round(from + (value - from) * eased);
      shownRef.current = next;
      setShown(next);
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [value, ok]);

  return shown;
}

/**
 * A money figure that counts to its new value when it changes. Draws exactly
 * what `Money` draws — the same formatting, the same zero dimming — so a hero
 * can swap one for the other without looking any different at rest.
 */
export function CountMoney({
  minor,
  className = '',
  style,
  compact,
  intro = false,
}: {
  minor: number;
  className?: string;
  style?: React.CSSProperties;
  compact?: boolean;
  /**
   * Count up from zero once, on arrival — the single exception to "nothing
   * animates on arrival", reserved for the first look at a new month. A
   * touch slower than a change (300ms), so it reads as deliberate.
   */
  intro?: boolean;
}) {
  const tweened = useTween(minor);
  const reduced = useReducedMotion();
  /* Starting at zero from the first render, so the figure never flashes its
     full value for a frame before counting up to it. */
  const [introShown, setIntroShown] = useState<number | null>(() => (intro && !reduced ? 0 : null));
  useEffect(() => {
    if (!intro || reduced) return;
    const target = minor;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - start) / INTRO_MS));
      setIntroShown(p >= 1 ? null : Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    setIntroShown(0);
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the intro is asked for
  }, [intro, reduced]);
  const shown = introShown ?? tweened;
  return (
    <span className={`num ${className}`} data-zero={minor === 0} style={style}>
      {formatINR(shown, { compact })}
    </span>
  );
}

/**
 * The transition class for a bar's width: none while the page is arriving,
 * so a bar filling from nothing on load does not read as progress.
 */
export function useGrowClass(spring = false): string {
  const ok = useMotionOk();
  return ok ? (spring ? 'grow-spring' : 'grow') : '';
}

/* ---------- expand and collapse ---------- */

/**
 * Smooth open and close without measuring anything: the wrapper animates its
 * single grid row between 0fr and 1fr. The contents mount on first open and
 * stay mounted, so closing animates too — and `inert` keeps a closed section
 * out of the tab order and away from screen readers.
 */
export function Collapse({ open, children, id }: { open: boolean; children: ReactNode; id?: string }) {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  return (
    <div
      id={id}
      className="collapse-rows"
      data-open={open}
      inert={!open}
      aria-hidden={!open}
    >
      <div className="min-h-0 overflow-hidden">{mounted && children}</div>
    </div>
  );
}

/* ---------- a card acknowledging your change ---------- */

/**
 * A card's brief highlight after something in it changed because of what you
 * just did. Spread `pulseProps` on the card; call `pulse()` after the save.
 */
export function usePulse() {
  const [n, setN] = useState(0);
  const pulse = useCallback(() => setN((x) => x + 1), []);
  /* A new key per pulse restarts the animation even mid-flight. */
  return { pulse, pulseProps: n ? { 'data-pulse': n % 2 ? 'a' : 'b' } : {} } as const;
}

/**
 * The same highlight, fired by the data instead of a callback: when `value`
 * changes once the page is up. On a screen with no month to switch, the only
 * thing that moves a figure is something you just did — a transaction added,
 * a contribution saved — so the card that changed says so.
 */
export function usePulseOnChange(value: unknown, scope = '', ready = true) {
  const ok = useMotionOk();
  const { pulse, pulseProps } = usePulse();
  const prev = useRef({ value, scope });
  const key = JSON.stringify(value);
  useEffect(() => {
    /* While a load is in flight the figures on screen may belong to the view
       being left (they are held so the page does not blank); compare only
       once the data matches the scope it is shown under. */
    if (!ready) return;
    const before = prev.current;
    prev.current = { value, scope };
    /* A new scope — another month — is a different view, not a change. */
    if (ok && before.scope === scope && JSON.stringify(before.value) !== key) pulse();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the serialised value
  }, [key, scope, ok, ready]);
  return pulseProps;
}

/**
 * Which of a list's rows are new since the last settled view — the one you
 * just added, edited or brought back — held for the length of the wash so a
 * re-render mid-animation cannot take it away. Compared only within one
 * `scope` (a month, a filter): a new view replaces every row, and none of
 * that is news. `ready` is false while a load is in flight, so the baseline
 * is always a finished list.
 */
const WASH_MS = 950;
export function useFreshKeys(keys: string[], ready: boolean, scope = ''): Set<string> {
  const ok = useMotionOk();
  const seen = useRef<{ scope: string; keys: Set<string> } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [fresh, setFresh] = useState<Set<string>>(() => new Set());
  const sig = keys.join('\n');

  useEffect(() => {
    if (!ready) return;
    const prev = seen.current;
    seen.current = { scope, keys: new Set(keys) };
    if (!ok || !prev || prev.scope !== scope) return;
    const added = keys.filter((k) => !prev.keys.has(k));
    if (!added.length) return;
    setFresh(new Set(added));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setFresh(new Set()), WASH_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the joined keys
  }, [sig, ready, scope, ok]);

  useEffect(() => () => clearTimeout(timer.current), []);
  return fresh;
}

/* ---------- a figure crossing a line ---------- */

/**
 * The thresholds a figure has just risen past — a budget reaching 90% and then
 * 100%, a goal passing a quarter, a half, three quarters, all of it — while
 * you were looking. Compared only between two settled views in the same
 * `scope`: the first load is not a crossing (it was crossed before this page
 * opened), another month is not a crossing, and falling back below a line
 * is not one either. Each event carries a fresh `id` so the same line
 * crossed twice plays twice.
 *
 * Not gated on reduced motion: what crossed is information. The caller
 * decides what moves.
 */
export function useCrossing(
  value: number | null | undefined,
  marks: readonly number[],
  ready: boolean,
  scope = '',
): { marks: number[]; id: number } | null {
  const prev = useRef<{ scope: string; value: number } | null>(null);
  const [event, setEvent] = useState<{ marks: number[]; id: number } | null>(null);

  useEffect(() => {
    if (!ready || value == null) return;
    const before = prev.current;
    prev.current = { scope, value };
    if (!before || before.scope !== scope || value <= before.value) return;
    const crossed = marks.filter((m) => before.value < m && value >= m);
    if (crossed.length) setEvent((e) => ({ marks: crossed, id: (e?.id ?? 0) + 1 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the marks are constant per caller
  }, [value, ready, scope]);

  return event;
}

/* ---------- a new month ---------- */

/**
 * True on the first visit in a month that is later than the last one seen
 * here — a new tracking period starting, which otherwise happens without a
 * word. Remembered per browser (a convenience, not data): a private window or
 * cleared storage just means no cue, never a wrong one. The very first visit
 * is not a transition, so it stays quiet too.
 */
const SEEN_MONTH_KEY = 'mf:last-month-seen';
export function useFreshMonth(month: string): boolean {
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    try {
      const last = window.localStorage.getItem(SEEN_MONTH_KEY);
      window.localStorage.setItem(SEEN_MONTH_KEY, month);
      if (last && last < month) setFresh(true);
    } catch {
      /* storage unavailable: no cue */
    }
  }, [month]);
  return fresh;
}

/* ---------- a debt reaching zero ---------- */

/**
 * The ids whose balance just reached zero from anything else — a settle-up
 * landing, not a page arriving with a settled row. Each maps to the amount
 * it came down from, so the row can count it off. Held for the length of the
 * moment, then released. Not gated on reduced motion: "settled" is news
 * either way; the row decides what moves.
 */
const CLEARED_MS = 1900;
export function useJustCleared(balances: [id: string, minor: number][], ready: boolean): Map<string, number> {
  const seen = useRef<Map<string, number> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [cleared, setCleared] = useState<Map<string, number>>(() => new Map());
  const sig = balances.map(([id, m]) => `${id}:${m}`).join('|');

  useEffect(() => {
    if (!ready) return;
    const before = seen.current;
    seen.current = new Map(balances);
    if (!before) return;
    const hit = new Map<string, number>();
    for (const [id, minor] of balances) {
      const was = before.get(id);
      if (minor === 0 && was) hit.set(id, Math.abs(was));
    }
    if (!hit.size) return;
    setCleared(hit);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCleared(new Map()), CLEARED_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the joined balances
  }, [sig, ready]);

  useEffect(() => () => clearTimeout(timer.current), []);
  return cleared;
}

/**
 * A settled balance counting itself off: from what was owed down to ₹0 over
 * ~0.7s — slower than a figure's usual 220ms, because the count is the point —
 * then "Settled ✓". Straight to the end state under reduced motion.
 */
export function CountDownToZero({ from, className = '' }: { from: number; className?: string }) {
  /* Reduced motion only — not the page-settled gate: this only ever mounts
     because a settle-up just landed, while that gate is still closing behind
     the refetch, and waiting on it flashed the end state first. */
  const reduced = useReducedMotion();
  const ok = !reduced;
  const [shown, setShown] = useState(ok ? from : 0);
  useEffect(() => {
    if (!ok) return;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - start) / 700));
      setShown(p >= 1 ? 0 : Math.round(from * Math.pow(1 - p, 2)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [from, ok]);

  return shown > 0 ? (
    <span className={`num ${className}`}>{formatINR(shown)}</span>
  ) : (
    <span className={`num ${className}`} style={{ color: 'var(--credit)' }}>
      Settled ✓
    </span>
  );
}

/* ---------- editing a figure in place ---------- */

/**
 * A figure you can tap to change. Enter saves, Escape cancels, and leaving
 * the field cancels too — a save should never happen by accident. It is a
 * span with a button role rather than a button, so it can sit inside rows
 * that are themselves pressable without nesting interactive elements.
 *
 * Money is entered in rupees and handed back in rupees, which is what the
 * category API takes; dates are ISO strings. An empty money field saves as
 * null where `clearable` allows it — removing a budget is a real edit.
 */
export function InlineEdit({
  kind,
  value,
  label,
  onSave,
  children,
  clearable = false,
  min,
  className = '',
}: {
  kind: 'money' | 'date';
  /** Rupees for money (not paise), ISO for a date; null when unset. */
  value: number | string | null;
  /** What is being edited, for the accessible name: "Edit monthly budget". */
  label: string;
  onSave: (next: number | string | null) => Promise<void>;
  children: ReactNode;
  clearable?: boolean;
  /** Earliest allowed date, for a target that cannot sit in the past. */
  min?: string;
  className?: string;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const inputId = useId();

  function begin(e: React.SyntheticEvent) {
    e.stopPropagation();
    e.preventDefault();
    setDraft(value == null ? '' : String(value));
    setEditing(true);
  }

  async function commit() {
    let next: number | string | null;
    if (kind === 'money') {
      const trimmed = draft.replace(/[₹,\s]/g, '');
      if (trimmed === '') {
        if (!clearable) return setEditing(false);
        next = null;
      } else {
        const n = Number(trimmed);
        if (!Number.isFinite(n) || n < 0) {
          toast('Enter an amount in rupees', 'error');
          return;
        }
        next = Math.round(n * 100) / 100;
      }
    } else {
      next = draft || null;
      if (next == null && !clearable) return setEditing(false);
    }
    if (next === value) return setEditing(false);

    setSaving(true);
    try {
      await onSave(next);
      setEditing(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <label htmlFor={inputId} className="sr-only">
          {label}
        </label>
        {kind === 'money' && <span className="num text-[12px] muted">₹</span>}
        <input
          id={inputId}
          autoFocus
          type={kind === 'date' ? 'date' : 'text'}
          inputMode={kind === 'money' ? 'decimal' : undefined}
          min={min}
          value={draft}
          disabled={saving}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
              e.preventDefault();
              void commit();
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              setEditing(false);
            }
          }}
          onBlur={() => !saving && setEditing(false)}
          className="inline-edit num"
          style={{ width: kind === 'date' ? '9.5rem' : `${Math.max(5, draft.length + 2)}ch` }}
        />
      </span>
    );
  }

  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={`Edit ${label}`}
      title={`Edit ${label}`}
      className={`inline-edit-target ${className}`}
      onClick={begin}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') begin(e);
      }}
    >
      {children}
    </span>
  );
}
