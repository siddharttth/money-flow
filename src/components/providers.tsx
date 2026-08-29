'use client';

import { SWRConfig } from 'swr';
import { fetcher } from '@/lib/client';
import { ReactNode, useEffect } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  /*
   * iOS Safari only treats an element as tappable — painting the tap
   * highlight, applying :active — if a touch listener is actually attached to
   * it or an ancestor. React attaches everything at the root container, not on
   * the elements, so rows and cards read as inert: the tap worked, but nothing
   * on screen acknowledged it, and people tapped again.
   *
   * One empty listener on the document restores it for every descendant. It is
   * passive and does nothing, so it costs nothing.
   */
  useEffect(() => {
    const noop = () => {};
    document.addEventListener('touchstart', noop, { passive: true });
    return () => document.removeEventListener('touchstart', noop);
  }, []);

  return (
    <SWRConfig
      value={{
        fetcher,
        revalidateOnFocus: false,
        shouldRetryOnError: false,
        dedupingInterval: 2000,
        /*
         * Hold the last month's figures on screen while the next month loads.
         * Without this, stepping the month picker blanked every card to a
         * skeleton and back on each tap — which on a phone reads as the app
         * lurching rather than responding.
         */
        keepPreviousData: true,
      }}
    >
      {children}
    </SWRConfig>
  );
}
