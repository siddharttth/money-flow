'use client';

import { useState } from 'react';
import { useSWRConfig } from 'swr';
import type { Expense } from '@/lib/types';
import { ExpenseForm } from './expense-form';
import { LedgerForm } from './ledger-form';

export type TxMode = 'expense' | 'lent' | 'borrowed';

/**
 * The single "add" surface. A segmented control picks the kind, then the
 * matching form renders. Editing an existing expense skips the control —
 * a saved expense cannot be reclassified into a loan.
 */
export function AddTransaction({
  existing,
  onSaved,
}: {
  existing?: Expense;
  onSaved: (message: string, keepOpen: boolean) => void;
}) {
  const [mode, setMode] = useState<TxMode>('expense');
  const { mutate } = useSWRConfig();

  const refresh = () => mutate((k) => typeof k === 'string' && k.startsWith('/api/'), undefined, { revalidate: true });

  if (existing) {
    return (
      <ExpenseForm
        existing={existing}
        onSaved={() => {
          refresh();
          onSaved('Expense updated', false);
        }}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-1 p-1 rounded-full" style={{ background: 'var(--surface-2)' }}>
        {([
          ['expense', 'Expense'],
          ['lent', 'I lent'],
          ['borrowed', 'I borrowed'],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setMode(k)}
            className="py-2 rounded-full text-xs font-semibold transition-colors"
            style={{
              transitionDuration: '150ms',
              background: mode === k ? 'var(--surface)' : 'transparent',
              color: mode === k ? 'var(--text)' : 'var(--text-muted)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'expense' ? (
        <ExpenseForm
          keepOpenAfterSave
          onSaved={(_e, again) => {
            refresh();
            onSaved('Expense saved', again);
          }}
        />
      ) : (
        <LedgerForm
          key={mode}
          defaultDirection={mode === 'lent' ? 'out' : 'in'}
          onSaved={() => {
            refresh();
            onSaved(mode === 'lent' ? 'Recorded what you gave' : 'Recorded what you got', false);
          }}
        />
      )}
    </div>
  );
}
