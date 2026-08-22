'use client';

import { monthLabel, shiftMonth, currentMonth } from '@/lib/dates';

export function MonthPicker({
  month,
  onChange,
  className = '',
}: {
  month: string;
  onChange: (m: string) => void;
  className?: string;
}) {
  const isCurrent = month >= currentMonth();

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <button
        className="btn btn-ghost px-3"
        onClick={() => onChange(shiftMonth(month, -1))}
        aria-label="Previous month"
      >
        ‹
      </button>
      <div className="px-2 min-w-[9.5rem] text-center font-medium text-sm">{monthLabel(month)}</div>
      <button
        className="btn btn-ghost px-3"
        onClick={() => onChange(shiftMonth(month, 1))}
        disabled={isCurrent}
        aria-label="Next month"
      >
        ›
      </button>
    </div>
  );
}
