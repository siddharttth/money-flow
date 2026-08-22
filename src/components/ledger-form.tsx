'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { api, RequestError } from '@/lib/client';
import { todayISO } from '@/lib/dates';
import type { Person } from '@/lib/types';
import { ChipRow } from './ui';

export type LedgerEntry = {
  id: string;
  direction: 'out' | 'in';
  amount: number;
  amountMinor: number;
  entryDate: string;
  note: string | null;
  person: { id: string; name: string; avatar: string; color: string };
};

export function LedgerForm({
  existing,
  lockedPersonId,
  defaultDirection = 'out',
  defaultAmount,
  onSaved,
}: {
  existing?: LedgerEntry;
  /** Set when adding from a peer's own page — the person is already known. */
  lockedPersonId?: string;
  defaultDirection?: 'out' | 'in';
  defaultAmount?: number;
  onSaved: () => void;
}) {
  const { mutate } = useSWRConfig();
  const { data } = useSWR<{ items: Person[] }>('/api/people');

  const [direction, setDirection] = useState<'out' | 'in'>(existing?.direction ?? defaultDirection);
  const [personId, setPersonId] = useState(existing?.person.id ?? lockedPersonId ?? '');
  const [amount, setAmount] = useState(
    existing ? String(existing.amount) : defaultAmount ? String(defaultAmount) : '',
  );
  const [entryDate, setEntryDate] = useState(existing?.entryDate ?? todayISO());
  const [note, setNote] = useState(existing?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    amountRef.current?.focus();
  }, []);

  // "Me" is excluded — you cannot lend to yourself.
  const peers = (data?.items ?? []).filter((p) => !p.isSelf);
  const value = Number(amount);
  const valid = amount !== '' && Number.isFinite(value) && value > 0 && !!personId;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    const payload = {
      personId,
      direction,
      amount: Math.round(value * 100) / 100,
      entryDate,
      note: note.trim() || null,
    };
    try {
      if (existing) await api.patch(`/api/ledger/${existing.id}`, payload);
      else await api.post('/api/ledger', payload);
      await mutate((k) => typeof k === 'string' && k.startsWith('/api/ledger'), undefined, { revalidate: true });
      onSaved();
    } catch (err) {
      setError(err instanceof RequestError ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <label className="label">What happened</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className="btn"
            onClick={() => setDirection('out')}
            style={
              direction === 'out'
                ? { background: 'var(--danger)', color: '#fff' }
                : { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }
            }
          >
            ↑ I gave
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => setDirection('in')}
            style={
              direction === 'in'
                ? { background: 'var(--success)', color: '#fff' }
                : { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }
            }
          >
            ↓ I got
          </button>
        </div>
        <p className="muted text-xs mt-2">
          {direction === 'out'
            ? 'Money left you — lent, or paid on their behalf. They owe you more.'
            : 'Money came to you — borrowed, or they paid you back. You owe them more.'}
        </p>
      </div>

      <div>
        <label className="label" htmlFor="lamount">
          Amount
        </label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl muted">₹</span>
          <input
            id="lamount"
            ref={amountRef}
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            inputMode="decimal"
            placeholder="0"
            autoComplete="off"
            className="input text-3xl font-semibold tabular"
            style={{ paddingLeft: '2.6rem', paddingTop: '0.9rem', paddingBottom: '0.9rem' }}
          />
        </div>
      </div>

      {!lockedPersonId && (
        <div>
          <label className="label">Person</label>
          {peers.length === 0 ? (
            <p className="muted text-sm">Add someone on the People page first.</p>
          ) : (
            <ChipRow>
              {peers.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="chip"
                  data-selected={personId === p.id}
                  onClick={() => setPersonId(p.id)}
                  style={personId === p.id ? { background: p.color, borderColor: p.color } : undefined}
                >
                  {p.name}
                </button>
              ))}
            </ChipRow>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label" htmlFor="ldate">
            Date
          </label>
          <input id="ldate" type="date" className="input" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="lnote">
            Note
          </label>
          <input
            id="lnote"
            className="input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="recharge, cash, UPI…"
            maxLength={500}
          />
        </div>
      </div>

      {error && (
        <p className="text-sm" style={{ color: 'var(--danger)' }} role="alert">
          {error}
        </p>
      )}

      <div
        className="sticky bottom-0 -mx-4 sm:-mx-5 -mb-4 sm:-mb-5 px-4 sm:px-5 pt-3 pb-4 sm:pb-5 flex sm:justify-end border-t"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <button type="submit" className="btn btn-primary flex-1 sm:flex-none" disabled={!valid || saving}>
          {saving ? 'Saving…' : existing ? 'Save changes' : 'Save entry'}
        </button>
      </div>
    </form>
  );
}
