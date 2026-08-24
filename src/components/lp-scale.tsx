'use client';

import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';

const useIso = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Renders children at a fixed design width and scales the whole thing down to
 * fit the available space.
 *
 * A product mockup must not reflow: letting a dashboard laid out for 900px
 * squeeze into a 230px phone column collapses its columns and truncates every
 * label. Real marketing renders keep their proportions and simply get smaller,
 * which is what this does — one transform on the whole device.
 */
export function ScaleFrame({
  designWidth,
  children,
  maxScale = 1,
  className = '',
}: {
  designWidth: number;
  children: ReactNode;
  maxScale?: number;
  className?: string;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(maxScale);
  const [height, setHeight] = useState<number | undefined>(undefined);

  useIso(() => {
    const outerEl = outer.current;
    const innerEl = inner.current;
    if (!outerEl || !innerEl) return;

    const measure = () => {
      const available = outerEl.clientWidth;
      const next = Math.min(maxScale, available / designWidth);
      setScale(next);
      setHeight(innerEl.offsetHeight * next);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(outerEl);
    ro.observe(innerEl);
    return () => ro.disconnect();
  }, [designWidth, maxScale]);

  return (
    <div ref={outer} className={`w-full ${className}`} style={{ height }}>
      <div
        ref={inner}
        style={{
          width: designWidth,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          // Keep it centred once it is smaller than the column.
          marginLeft: scale < maxScale ? 0 : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
}
