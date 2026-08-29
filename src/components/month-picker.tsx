'use client';

import { monthLabel, shiftMonth, currentMonth } from '@/lib/dates';

/**
 * A month stepper, not a month label.
 *
 * Every screen that uses this already prints the full month as its title, so
 * repeating "August 2026" here was saying the same thing twice at the top of
 * the page. It shows the short month instead — enough to confirm the arrows
 * did what you expected — and the year only when it is not the current one.
 */
export function MonthPicker({
  month,
  onChange,
  className = '',
}: {
  month: string;
  onChange: (m: string) => void;
  className?: string;
}) {
  const now = currentMonth();
  const isCurrent = month >= now;
  const short = monthLabel(month).split(' ');
  const label = short[1] === now.slice(0, 4) ? short[0].slice(0, 3) : `${short[0].slice(0, 3)} ’${short[1].slice(2)}`;

  return (
    <div
      className={`inline-flex items-center rounded-full max-sm:flex-1 ${className}`}
      style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}
    >
      <button
        className="w-10 h-10 flex items-center justify-center rounded-full text-lg leading-none"
        style={{ color: 'var(--text-muted)' }}
        onClick={() => onChange(shiftMonth(month, -1))}
        aria-label="Previous month"
      >
        ‹
      </button>
      <span className="num flex-1 px-1 min-w-[3.75rem] text-center text-[13px] font-semibold">{label}</span>
      <button
        className="w-10 h-10 flex items-center justify-center rounded-full text-lg leading-none disabled:opacity-30"
        style={{ color: 'var(--text-muted)' }}
        onClick={() => onChange(shiftMonth(month, 1))}
        disabled={isCurrent}
        aria-label="Next month"
      >
        ›
      </button>
    </div>
  );
}
