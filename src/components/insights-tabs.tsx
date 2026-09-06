'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Segmented } from './ui';

/**
 * The one control that makes two analytics pages feel like one destination.
 *
 * Splitting Analytics by time horizon was right — a month picker above a
 * twelve-month chart is a control that lies. But two nav entries for what a
 * user thinks of as "the numbers" is two entries too many on a phone, so the
 * mobile bar carries one Insights tab and this switches between them.
 *
 * It is the same segmented control the add sheet uses to pick a kind, so
 * nothing new has to be learned.
 */
export function InsightsTabs() {
  const pathname = usePathname();
  const router = useRouter();
  const value = pathname.startsWith('/analytics/lifetime') ? 'lifetime' : 'month';

  return (
    <Segmented
      className="w-full sm:w-auto"
      value={value}
      onChange={(v) => router.push(v === 'month' ? '/analytics/month' : '/analytics/lifetime')}
      options={[
        { value: 'month', label: 'This month' },
        { value: 'lifetime', label: 'Lifetime' },
      ]}
    />
  );
}
