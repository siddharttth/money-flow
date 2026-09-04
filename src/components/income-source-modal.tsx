'use client';

import { useEffect, useRef, useState } from 'react';
import { api, RequestError } from '@/lib/client';
import { todayISO } from '@/lib/dates';
import { formatINR } from '@/lib/money';
import { Modal } from './ui';
import { CategoryIcon } from './icons';
import { PALETTE } from '@/lib/defaults';

/**
 * Setting up where your money comes from.
 *
 * This used to be the generic category sheet with a different title on it,
 * which asked for a monthly budget on a salary, offered twenty icons for
 * groceries and cigarettes, and never once asked how much you earn. Someone
 * arriving from "Set up income" wants to type a name and a number.
 *
 * So it asks exactly that. The amount is optional only in the sense that a
 * source can exist before its first payment — but it is right there, first
 * class, and filling it in records the payment as well as creating the source.
 * One sheet, one trip.
 *
 * What it deliberately does not ask for: a budget (a cap on money arriving is
 * meaningless), an icon (there is one sensible answer), or a type (the title
 * already said it).
 */
export function IncomeSourceModal({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [color, setColor] = useState(PALETTE[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName('');
    setAmount('');
    setDate(todayISO());
    setColor(PALETTE[0]);
    setError(null);
    if (window.matchMedia('(pointer: fine)').matches) {
      setTimeout(() => nameRef.current?.focus(), 80);
    }
  }, [open]);

  const value = Number(amount);
  const hasAmount = amount.trim() !== '' && Number.isFinite(value) && value > 0;

  async function save() {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const category = await api.post<{ id: string }>('/api/categories', {
        name: name.trim(),
        kind: 'income',
        icon: 'cash',
        color,
      });

      // A source with a first payment already in it is the common case, and
      // making that two separate trips is what made this feel like paperwork.
      if (hasAmount) {
        await api.post('/api/expenses', {
          amount: Math.round(value * 100) / 100,
          categoryId: category.id,
          expenseDate: date,
          note: null,
          personIds: [],
        });
      }

      onDone(hasAmount ? `${formatINR(Math.round(value * 100))} recorded` : `${name.trim()} added`);
    } catch (err) {
      setError(err instanceof RequestError ? err.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Where money comes from">
      <div className="space-y-5">
        <div>
          <label className="label" htmlFor="incname">
            What is it called
          </label>
          <input
            id="incname"
            ref={nameRef}
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Salary, Freelance, Rent received…"
          />
        </div>

        <div>
          <label className="label" htmlFor="incamount">
            How much came in
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl muted">₹</span>
            <input
              id="incamount"
              className="input text-3xl font-semibold tabular"
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="0"
              style={{ paddingLeft: '2.6rem', paddingTop: '0.9rem', paddingBottom: '0.9rem' }}
            />
          </div>
          <p className="muted text-[12px] mt-2 leading-relaxed">
            Leave it blank to set the source up now and record payments later. Every payment is logged separately, so
            a month that pays differently just gets a different figure.
          </p>
        </div>

        {hasAmount && (
          <div>
            <label className="label" htmlFor="incdate">
              When
            </label>
            <input
              id="incdate"
              type="date"
              className="input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        )}

        <div>
          <span className="label">Colour</span>
          <div className="flex items-center gap-3">
            <CategoryIcon icon="cash" color={color} size={40} />
            <div className="flex flex-wrap gap-2">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={`Colour ${c}`}
                  className="w-7 h-7 rounded-full border-2"
                  style={{ background: c, borderColor: color === c ? 'var(--text)' : 'transparent' }}
                />
              ))}
            </div>
          </div>
        </div>

        {error && (
          <p className="text-sm" style={{ color: 'var(--danger)' }} role="alert">
            {error}
          </p>
        )}

        <div className="sheet-actions justify-end">
          <button className="btn btn-primary max-sm:flex-1" onClick={save} disabled={busy || !name.trim()}>
            {busy
              ? 'Saving…'
              : hasAmount
                ? `Save and record ${formatINR(Math.round(value * 100))}`
                : 'Save source'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
