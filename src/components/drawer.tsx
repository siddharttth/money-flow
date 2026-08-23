'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';

/**
 * Slide-over inspector. Anchors right on desktop, bottom on mobile.
 *
 * Shares the hard-won mobile behaviour from Modal: sized from `visualViewport`
 * (iOS does not shrink the layout viewport for the keyboard), body pinned
 * rather than `overflow: hidden` (which iOS ignores), and scroll restored on
 * close.
 */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState<{ top: number; height: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);

    const scrollY = window.scrollY;
    const body = document.body;
    const prev = { position: body.style.position, top: body.style.top, width: body.style.width, overflow: body.style.overflow };
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
    body.style.overflow = 'hidden';

    const vv = window.visualViewport;
    const sync = () => vv && setArea({ top: vv.offsetTop, height: vv.height });
    sync();
    vv?.addEventListener('resize', sync);
    vv?.addEventListener('scroll', sync);

    // Move focus into the panel so Escape and tabbing behave.
    const t = setTimeout(() => panelRef.current?.focus(), 60);

    return () => {
      clearTimeout(t);
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

  if (!open) return null;

  return (
    <div
      className="fixed left-0 right-0 z-[60] flex items-end sm:items-stretch sm:justify-end"
      style={area ? { top: area.top, height: area.height } : { top: 0, bottom: 0 }}
    >
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-[2px] animate-fade"
        onClick={onClose}
        aria-hidden
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className="relative w-full sm:w-[30rem] sm:max-w-[92vw] flex flex-col outline-none animate-slide-in"
        style={{
          background: 'var(--surface)',
          borderLeft: '1px solid var(--border)',
          maxHeight: '100%',
        }}
      >
        <header
          className="shrink-0 px-5 py-4 border-b flex items-start justify-between gap-3"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="min-w-0">{title}</div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="muted text-2xl leading-none px-2 -mr-1 -mt-1 shrink-0 hover:opacity-70 transition-opacity"
            style={{ transitionDuration: '150ms' }}
          >
            ×
          </button>
        </header>

        {subtitle}

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 safe-bottom">{children}</div>

        {footer && (
          <div className="shrink-0 border-t px-5 py-3 safe-bottom" style={{ borderColor: 'var(--border)' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
