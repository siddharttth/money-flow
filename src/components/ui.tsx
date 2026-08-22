'use client';

import { ReactNode, useEffect } from 'react';
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

/** Bottom sheet on mobile, centred dialog on desktop. */
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
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`card animate-in w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'} max-h-[92dvh] overflow-y-auto rounded-b-none sm:rounded-b-2xl safe-bottom`}
      >
        <div
          className="sticky top-0 flex items-center justify-between px-4 sm:px-5 py-3.5 border-b"
          style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
        >
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="muted text-xl leading-none px-2 py-1">
            ×
          </button>
        </div>
        <div className="p-4 sm:p-5">{children}</div>
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
