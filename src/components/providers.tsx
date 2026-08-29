'use client';

import { SWRConfig } from 'swr';
import { fetcher } from '@/lib/client';
import { ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
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
