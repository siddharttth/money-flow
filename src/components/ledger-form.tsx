'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { api, RequestError } from '@/lib/client';
import { todayISO } from '@/lib/dates';
import { formatINR } from '@/lib/money';
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

type PeerSummary = { balances: { personId: string; balanceMinor: number }[] };

/**
 * Recording a loan.
 *
 * There is no direction control here. Every way into this form has already
 * said which way the money went — the Add sheet's tabs, or the two buttons on
 * People — so asking again ("I lent" at the top, then "I gave / I got" below)
 * was the same question twice, in two different vocabularies. The direction is
 * now stated as a sentence and shown as its effect on the balance, which is
 * the thing the user is actually trying to change.
 *
 * Editing an existing entry is the one exception: a mis-recorded loan has to be
 * flippable without deleting and re-adding it.
 *
 * `intent` exists because direction and meaning are not the same thing. Money
 * coming in is direction 'in' whether it is a fresh borrowing or a repayment of
 * something already lent — identical arithmetic, opposite sentences. Settling
 * says "they paid back", not "I borrowed".
 */
export function LedgerForm({
  existing,
  lockedPersonId,
  defaultDirection = 'out',
  defaultAmount,
  intent = 'record',
  onSaved,
}: {
  existing?: LedgerEntry;
  /** Set when adding from a specific person — the person is already known. */
  lockedPersonId?: string;
  defaultDirection?: 'out' | 'in';
  defaultAmount?: number;
  /** 'settle' reworries the wording for paying an existing balance down. */
  intent?: 'record' | 'settle';
  onSaved: () => void;
}) {
  const { mutate } = useSWRConfig();
  const { data } = useSWR<{ items: Person[] }>('/api/people');
  const { data: peerData } = useSWR<PeerSummary>('/api/ledger');

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
    /*
     * Only where a keyboard is already present. iOS will not raise the software
     * keyboard for a programmatic focus — it needs a real gesture — so on a
     * phone this bought nothing and cost a scroll jump as the sheet opened.
     */
    if (window.matchMedia('(pointer: fine)').matches) amountRef.current?.focus();
  }, []);

  // "Me" is excluded — you cannot lend to yourself.
  const peers = (data?.items ?? []).filter((p) => !p.isSelf);

  // With exactly one other person there is nothing to choose. Picking for them
  // removes a required tap from every single entry.
  useEffect(() => {
    if (personId || peers.length !== 1) return;
    setPersonId(peers[0].id);
  }, [peers, personId]);

  const value = Number(amount);
  const amountValid = amount !== '' && Number.isFinite(value) && value > 0;
  const valid = amountValid && !!personId;

  const person = peers.find((p) => p.id === personId) ?? (existing ? existing.person : undefined);

  const amountLabel =
    intent === 'settle'
      ? direction === 'in'
        ? 'How much they paid back'
        : 'How much you paid back'
      : direction === 'out'
        ? 'How much you lent'
        : 'How much you borrowed';
  const currentMinor = peerData?.balances.find((b) => b.personId === personId)?.balanceMinor ?? 0;
  // Lending pushes the balance towards "they owe me"; borrowing pulls it back.
  const deltaMinor = Math.round((amountValid ? value : 0) * 100) * (direction === 'out' ? 1 : -1);
  const afterMinor = currentMinor + deltaMinor;

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
      {/* Only when editing: a saved entry recorded the wrong way round has to
          be fixable in place. */}
      {existing && (
        <div>
          <span className="label">Direction</span>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['out', 'I lent'],
                ['in', 'I borrowed'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className="btn"
                onClick={() => setDirection(key)}
                style={
                  direction === key
                    ? { background: 'var(--brass)', color: 'var(--on-brass)' }
                    : { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="label" htmlFor="lamount">
          {amountLabel}
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
          <span className="label">{direction === 'out' ? 'Who you lent it to' : 'Who you borrowed from'}</span>
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
                  style={personId === p.id ? { background: p.color, borderColor: p.color, color: '#fff' } : undefined}
                >
                  {/* Name only. An initials disc tinted from the person's own
                      colour disappears once the chip fills with that colour. */}
                  {p.name}
                </button>
              ))}
            </ChipRow>
          )}
        </div>
      )}

      {/* What this entry will do, in one line. This replaced the direction
          toggle: the balance is the thing the user is actually changing. */}
      {person && (
        <div className="well px-3.5 py-3">
          <p className="text-[13px] leading-relaxed">
            {amountValid ? (
              <>
                <span className="num font-semibold">{formatINR(Math.round(value * 100))}</span>{' '}
                {direction === 'out' ? 'goes to' : 'comes from'}{' '}
                <strong className="font-semibold">{person.name}</strong>.{' '}
                {afterMinor === 0 ? (
                  <>That settles you up.</>
                ) : afterMinor > 0 ? (
                  <>
                    They will owe you <span className="num font-semibold">{formatINR(afterMinor)}</span>.
                  </>
                ) : (
                  <>
                    You will owe them <span className="num font-semibold">{formatINR(Math.abs(afterMinor))}</span>.
                  </>
                )}
              </>
            ) : currentMinor === 0 ? (
              <span className="muted">You and {person.name} are settled up.</span>
            ) : currentMinor > 0 ? (
              <span className="muted">
                {person.name} owes you <span className="num">{formatINR(currentMinor)}</span> right now.
              </span>
            ) : (
              <span className="muted">
                You owe {person.name} <span className="num">{formatINR(Math.abs(currentMinor))}</span> right now.
              </span>
            )}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label" htmlFor="ldate">
            Date
          </label>
          <input
            id="ldate"
            type="date"
            className="input"
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
          />
          {/* Parity with the expense form — most entries are today or yesterday. */}
          <div className="flex gap-2 mt-2">
            <button type="button" className="chip" onClick={() => setEntryDate(todayISO())}>
              Today
            </button>
            <button
              type="button"
              className="chip"
              onClick={() => {
                const d = new Date();
                d.setDate(d.getDate() - 1);
                setEntryDate(d.toISOString().slice(0, 10));
              }}
            >
              Yesterday
            </button>
          </div>
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
            placeholder="cash, UPI, trip advance…"
            maxLength={500}
          />
        </div>
      </div>

      {error && (
        <p className="text-sm" style={{ color: 'var(--danger)' }} role="alert">
          {error}
        </p>
      )}

      <div className="sheet-actions">
        {/* Says what is missing rather than leaving a dead grey button. */}
        <p className="muted text-xs flex-1 sm:text-right">
          {!amountValid ? 'Enter an amount' : !personId ? 'Pick a person' : ''}
        </p>
        <button type="submit" className="btn btn-primary shrink-0 max-sm:flex-1" disabled={!valid || saving}>
          {saving ? 'Saving…' : existing ? 'Save changes' : 'Save'}
        </button>
      </div>
    </form>
  );
}
