'use client';

import { useEffect, useRef, useState } from 'react';
import { api, RequestError } from '@/lib/client';
import { formatINR } from '@/lib/money';
import { monthsBetween, todayISO } from '@/lib/dates';
import { Modal } from './ui';
import { Icon, ICON_KEYS } from './icons';
import { PALETTE } from '@/lib/defaults';

/**
 * Setting up something you are saving for.
 *
 * "Set a target" used to open the generic New Category sheet, which asked the
 * one question the button had already answered — Spending, Investment or
 * Income — and offered a monthly budget on a bike fund. A goal is always an
 * investment category with a target on it; making someone say so is asking
 * them to know the data model.
 *
 * So this asks what you are saving for, how much, and by when. Nothing else.
 * The kind is set for you, and the target is required rather than optional,
 * because a goal without a number is a category.
 */
export function GoalModal({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [icon, setIcon] = useState<string>('invest');
  const [color, setColor] = useState(PALETTE[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName('');
    setTarget('');
    setTargetDate('');
    setIcon('invest');
    setColor(PALETTE[0]);
    setError(null);
    if (window.matchMedia('(pointer: fine)').matches) {
      setTimeout(() => nameRef.current?.focus(), 80);
    }
  }, [open]);

  const value = Number(target);
  const hasTarget = target.trim() !== '' && Number.isFinite(value) && value > 0;
  const valid = name.trim() !== '' && hasTarget;

  /*
   * The whole reason to ask for a date: it turns a number into a monthly
   * figure you can act on. Shown live, so the trade-off between "by March"
   * and "by December" is visible while you are choosing.
   *
   * Uses the same `monthsBetween` the saved goal is measured with. A local
   * copy of the arithmetic here quoted ₹9,091 a month for a goal the
   * Investments screen then asked ₹8,333 for.
   */
  const perMonth = (() => {
    if (!hasTarget || !targetDate) return null;
    const months = Math.max(1, monthsBetween(todayISO(), targetDate));
    return { minor: Math.ceil((value * 100) / months), months };
  })();

  async function save() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/categories', {
        name: name.trim(),
        kind: 'investment',
        icon,
        color,
        target: Math.round(value * 100) / 100,
        targetDate: targetDate || null,
      });
      onDone(`${name.trim()} added`);
    } catch (err) {
      setError(err instanceof RequestError ? err.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New goal">
      <div className="space-y-5">
        <div>
          <label className="label" htmlFor="gname">
            What are you saving for
          </label>
          <input
            id="gname"
            ref={nameRef}
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Yezdi Adventure, emergency buffer, Japan…"
          />
        </div>

        <div>
          <label className="label" htmlFor="gtarget">
            How much do you need
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl muted">₹</span>
            <input
              id="gtarget"
              className="input text-3xl font-semibold tabular"
              inputMode="decimal"
              autoComplete="off"
              value={target}
              onChange={(e) => setTarget(e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="0"
              style={{ paddingLeft: '2.6rem', paddingTop: '0.9rem', paddingBottom: '0.9rem' }}
            />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="gdate">
            By when <span className="normal-case font-normal">— optional</span>
          </label>
          <input
            id="gdate"
            type="date"
            className="input"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
          />
          <p className="muted text-[12px] mt-2 leading-relaxed">
            {perMonth ? (
              <>
                That is <strong className="num">{formatINR(perMonth.minor)}</strong> a month over{' '}
                {perMonth.months} {perMonth.months === 1 ? 'month' : 'months'} — the pace your dashboard will
                hold you to.
              </>
            ) : (
              'A date is what turns the target into a monthly figure. Without one you get progress, but no pace.'
            )}
          </p>
        </div>

        <div>
          <label className="label">Icon</label>
          <div className="flex flex-wrap gap-2">
            {ICON_KEYS.map((k) => (
              <button
                key={k}
                type="button"
                className="chip px-2.5"
                data-selected={icon === k}
                onClick={() => setIcon(k)}
                aria-label={k}
                style={icon === k ? undefined : { color }}
              >
                <Icon name={k} size={18} />
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Colour</label>
          <div className="flex flex-wrap gap-2">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`Colour ${c}`}
                className="w-8 h-8 rounded-full border-2"
                style={{ background: c, borderColor: color === c ? 'var(--text)' : 'transparent' }}
              />
            ))}
          </div>
        </div>

        {error && (
          <p className="text-sm" style={{ color: 'var(--danger)' }} role="alert">
            {error}
          </p>
        )}

        <div className="sheet-actions justify-end">
          <button className="btn btn-primary max-sm:flex-1" onClick={save} disabled={busy || !valid}>
            {busy ? 'Saving…' : hasTarget ? `Save goal of ${formatINR(Math.round(value * 100))}` : 'Save goal'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
