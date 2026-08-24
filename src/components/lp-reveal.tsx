'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';

/**
 * Fade + rise as a section enters view, once.
 *
 * IntersectionObserver alone is not enough: an anchor jump (or restoring a
 * scroll position on refresh) can skip a section entirely, so it never
 * intersects and would stay at opacity 0 forever. A cheap position check on
 * mount and on scroll guarantees anything at or above the fold is revealed —
 * content must never be permanently invisible because an animation missed.
 */
export function Reveal({
  children,
  delay = 0,
  className = '',
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // No observer support: show immediately rather than risk hidden content.
    if (typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }

    let done = false;
    const reveal = () => {
      if (done) return;
      done = true;
      setShown(true);
      io.disconnect();
      window.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
    };

    // Anything already at or above the fold has been "passed" and must show.
    const passed = () => el.getBoundingClientRect().top < window.innerHeight;
    const check = () => passed() && reveal();

    const io = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && reveal(),
      { rootMargin: '0px 0px -12% 0px', threshold: 0.05 },
    );
    io.observe(el);

    if (passed()) reveal();
    else {
      window.addEventListener('scroll', check, { passive: true });
      // A resize can bring a section into view without any scroll event —
      // including a full-page screenshot, which expands the viewport.
      window.addEventListener('resize', check, { passive: true });
    }

    return () => {
      io.disconnect();
      window.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
    };
  }, []);

  return (
    <div ref={ref} data-shown={shown} className={`lp-reveal ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}
