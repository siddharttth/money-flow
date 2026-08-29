'use client';

import { useState } from 'react';
import { useSWRConfig } from 'swr';
import type { Expense } from '@/lib/types';
import { Segmented } from './ui';
import { ExpenseForm } from './expense-form';
import { LedgerForm } from './ledger-form';

export type TxMode = 'expense' | 'lent' | 'borrowed';

/**
 * The single "add" surface. One segmented control picks the kind, then the
 * matching form renders — and that control is the ONLY place the direction is
 * chosen. The ledger form used to ask again in its own words ("I gave / I
 * got"), which meant two controls, two vocabularies and one confused user.
 *
 * Editing an existing expense skips the control: a saved expense cannot be
 * reclassified into a loan.
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
      <Segmented
        className="w-full"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'expense', label: 'Expense' },
          { value: 'lent', label: 'I lent' },
          { value: 'borrowed', label: 'I borrowed' },
        ]}
      />

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
            onSaved(mode === 'lent' ? 'Loan recorded' : 'Borrowing recorded', false);
          }}
        />
      )}
    </div>
  );
}
