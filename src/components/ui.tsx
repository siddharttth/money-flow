'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';
import { formatINR } from '@/lib/money';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`card p-4 sm:p-5 ${className}`}>{children}</div>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <h2 className="text-base font-semibold">{children}</h2>
      {action}
    </div>
  );
}

/** Consistent placeholder for "nothing here yet" across every list in the app. */
export function EmptyState({
  icon = '🗒️',
  title,
  hint,
  action,
}: {
  icon?: string;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="text-center py-10 px-4">
      <div className="text-4xl mb-3">{icon}</div>
      <p className="font-medium">{title}</p>
      {hint && <p className="muted text-sm mt-1 max-w-sm mx-auto">{hint}</p>}
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
  const [area, setArea] = useState<{ top: number; height: number } | null>(null);

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
    };
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
    body.style.overflow = 'hidden';

    const vv = window.visualViewport;
    const sync = () => {
      if (!vv) return;
      setArea({ top: vv.offsetTop, height: vv.height });
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
      window.scrollTo(0, scrollY);
      setArea(null);
    };
  }, [open, onClose]);

  /** Keep the focused field visible once the keyboard has finished animating. */
  useEffect(() => {
    if (!open) return;
    const el = dialogRef.current;
    if (!el) return;
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (!/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      setTimeout(() => target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 250);
    };
    el.addEventListener('focusin', onFocusIn);
    return () => el.removeEventListener('focusin', onFocusIn);
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
      className="fixed left-0 right-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-[2px]"
      style={area ? { top: area.top, height: area.height } : { top: 0, bottom: 0 }}
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
            className="muted text-2xl leading-none px-3 -mr-2 -my-2 py-2"
          >
            ×
          </button>
        </div>
        {/* Only this region scrolls, so the sticky footer inside it stays put. */}
        <div className="p-4 sm:p-5 overflow-y-auto overscroll-contain flex-1 safe-bottom">{children}</div>
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
