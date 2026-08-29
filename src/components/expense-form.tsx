'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { api, RequestError } from '@/lib/client';
import { todayISO } from '@/lib/dates';
import type { Category, Expense, Person } from '@/lib/types';
import { ChipRow } from './ui';
import { Icon, resolveIcon } from '@/components/icons';

/** Categories and people the user picked most recently, surfaced first so the
 *  common case is a single tap. Stored locally — no server round trip. */
const RECENT_KEY = 'mf-recent';

type Recents = { categories: string[]; people: string[] };

function readRecents(): Recents {
  try {
    return { categories: [], people: [], ...JSON.parse(localStorage.getItem(RECENT_KEY) || '{}') };
  } catch {
    return { categories: [], people: [] };
  }
}

function pushRecent(kind: keyof Recents, id: string) {
  try {
    const r = readRecents();
    r[kind] = [id, ...r[kind].filter((x) => x !== id)].slice(0, 5);
    localStorage.setItem(RECENT_KEY, JSON.stringify(r));
  } catch {
    /* private mode / storage disabled — recents are a nicety, not a requirement */
  }
}

/** Orders a list so recently-used entries float to the front. */
function byRecency<T extends { id: string }>(items: T[], recent: string[]): T[] {
  const rank = new Map(recent.map((id, i) => [id, i]));
  return [...items].sort((a, b) => (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99));
}

export function ExpenseForm({
  existing,
  onSaved,
  keepOpenAfterSave = false,
}: {
  existing?: Expense;
  onSaved: (e: Expense, again: boolean) => void;
  keepOpenAfterSave?: boolean;
}) {
  const { mutate } = useSWRConfig();
  const { data: catData } = useSWR<{ items: Category[] }>('/api/categories');
  const { data: personData } = useSWR<{ items: Person[] }>('/api/people');

  const [amount, setAmount] = useState(existing ? String(existing.amount) : '');
  const [categoryId, setCategoryId] = useState(existing?.category.id ?? '');
  const [personIds, setPersonIds] = useState<string[]>(existing?.people.map((p) => p.id) ?? []);
  // "Me" is applied automatically, so the first explicit tap should REPLACE it
  // rather than add to it — otherwise every expense for someone else costs an
  // extra tap to uncheck yourself.
  const [personTouched, setPersonTouched] = useState(!!existing);
  // Multi-select is opt-in. Tapping a chip normally just switches person,
  // which is what almost every entry needs and requires no unchecking.
  const [multi, setMulti] = useState((existing?.people.length ?? 0) > 1);
  const [expenseDate, setExpenseDate] = useState(existing?.expenseDate ?? todayISO());
  const [note, setNote] = useState(existing?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recents, setRecents] = useState<Recents>({ categories: [], people: [] });
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRecents(readRecents());
    // Autofocus the amount field — it is always the first thing typed.
    amountRef.current?.focus();
  }, []);

  const categories = useMemo(
    () => byRecency(catData?.items ?? [], recents.categories),
    [catData, recents.categories],
  );

  // Default a new expense to "Me" — spending on yourself is the common case,
  // and it stays provisional until the user picks someone else.
  useEffect(() => {
    if (existing || personTouched || personIds.length) return;
    const me = personData?.items.find((p) => p.isSelf);
    if (me) setPersonIds([me.id]);
  }, [personData, existing, personTouched, personIds.length]);
  const people = useMemo(() => byRecency(personData?.items ?? [], recents.people), [personData, recents.people]);

  const amountValue = Number(amount);
  const valid = amount !== '' && Number.isFinite(amountValue) && amountValue > 0 && !!categoryId;

  async function submit(addAnother: boolean) {
    if (!valid || saving) return;
    setSaving(true);
    setError(null);

    const payload = {
      amount: Math.round(amountValue * 100) / 100,
      categoryId,
      expenseDate,
      note: note.trim() || null,
      personIds,
    };

    try {
      const saved = existing
        ? await api.patch<Expense>(`/api/expenses/${existing.id}`, payload)
        : await api.post<Expense>('/api/expenses', payload);

      pushRecent('categories', categoryId);
      personIds.forEach((id) => pushRecent('people', id));
      setRecents(readRecents());

      // Every view derives from these endpoints, so revalidating the whole
      // namespace is what keeps dashboards/analytics from showing stale totals.
      await mutate((key) => typeof key === 'string' && key.startsWith('/api/'), undefined, { revalidate: true });

      if (addAnother) {
        setAmount('');
        setNote('');
        amountRef.current?.focus();
      }
      onSaved(saved, addAnother);
    } catch (err) {
      setError(err instanceof RequestError ? err.message : 'Could not save this expense');
    } finally {
      setSaving(false);
    }
  }

  function selectPerson(id: string) {
    setPersonTouched(true);
    setPersonIds((prev) => {
      // Multi mode (or a deliberate long-press) toggles; otherwise a tap simply
      // switches to that person, so switching never needs an uncheck first.
      if (multi) return prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id];
      return [id];
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(false);
      }}
      onKeyDown={(e) => {
        // Cmd/Ctrl+Enter saves and immediately queues another entry.
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault();
          submit(!existing && keepOpenAfterSave);
        }
      }}
      className="space-y-5"
    >
      <div>
        <label className="label" htmlFor="amount">
          Amount
        </label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl muted">₹</span>
          <input
            id="amount"
            ref={amountRef}
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            /* decimal keypad on phones, no spinner arrows */
            inputMode="decimal"
            placeholder="0"
            autoComplete="off"
            className="input text-3xl font-semibold tabular"
            style={{ paddingLeft: '2.6rem', paddingTop: '0.9rem', paddingBottom: '0.9rem' }}
          />
        </div>
      </div>

      <div>
        <label className="label">Category</label>
        {categories.length === 0 ? (
          <p className="muted text-sm">Loading categories…</p>
        ) : (
          <ChipRow>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                className="chip"
                data-selected={categoryId === c.id}
                onClick={() => setCategoryId(c.id)}
                style={
                  categoryId === c.id
                    ? { background: c.color, borderColor: c.color, color: '#fff' }
                    : undefined
                }
              >
                {/* Carries its own colour when unselected, so the grid is
                    scannable by hue before it is readable by name. */}
                <span
                  className="inline-flex"
                  style={{ color: categoryId === c.id ? 'inherit' : c.color }}
                  aria-hidden
                >
                  <Icon name={resolveIcon(c.icon)} size={15} />
                </span>
                {c.name}
              </button>
            ))}
          </ChipRow>
        )}
      </div>

      <div>
        <label className="label">
          Person
          <span className="normal-case font-normal tracking-normal">
            {multi ? ' — tap to add or remove' : ' — tap to switch'}
          </span>
        </label>
        <ChipRow>
          {people.map((p) => (
            <button
              key={p.id}
              type="button"
              className="chip"
              data-selected={personIds.includes(p.id)}
              onClick={() => selectPerson(p.id)}
              style={personIds.includes(p.id) ? { background: p.color, borderColor: p.color } : undefined}
            >
              {multi && personIds.includes(p.id) && <span aria-hidden>✓</span>}
              {p.name}
            </button>
          ))}

          {/* Splitting across people is rare, so it is opt-in rather than the
              default behaviour every single-person entry has to work around. */}
          <button
            type="button"
            className="chip"
            data-selected={multi}
            onClick={() => setMulti((m) => !m)}
            title="Tag several people on this one expense"
          >
            {multi ? '✓ Multiple' : '＋ Multiple'}
          </button>
        </ChipRow>

        {personIds.length > 1 && (
          <p className="muted text-xs mt-2">
            Still one ₹{amount || '0'} expense. Each person shows the full amount in their own view — totals are
            never multiplied.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label" htmlFor="date">
            Date
          </label>
          <input
            id="date"
            type="date"
            value={expenseDate}
            onChange={(e) => setExpenseDate(e.target.value)}
            className="input"
          />
          <div className="flex gap-2 mt-2">
            <button type="button" className="chip" onClick={() => setExpenseDate(todayISO())}>
              Today
            </button>
            <button
              type="button"
              className="chip"
              onClick={() => {
                const d = new Date();
                d.setDate(d.getDate() - 1);
                setExpenseDate(d.toISOString().slice(0, 10));
              }}
            >
              Yesterday
            </button>
          </div>
        </div>

        <div>
          <label className="label" htmlFor="note">
            Note
          </label>
          <input
            id="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Dinner, cab, groceries…"
            className="input"
            maxLength={500}
          />
        </div>
      </div>

      {error && (
        <p className="text-sm" style={{ color: 'var(--danger)' }} role="alert">
          {error}
        </p>
      )}

      <p className="muted text-xs hidden sm:block text-right">Tip: ⌘/Ctrl + Enter saves instantly</p>

      {/* Sticky so Save stays reachable without scrolling back down the sheet.
          One row only — three stacked buttons ate half a phone screen. Cancel is
          omitted because the sheet's × and Esc already close it. */}
      <div
        className="sticky bottom-0 -mx-4 sm:-mx-5 -mb-4 sm:-mb-5 px-4 sm:px-5 pt-3 pb-4 sm:pb-5 flex gap-2 sm:justify-end border-t"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        {!existing && keepOpenAfterSave && (
          <button
            type="button"
            className="btn btn-ghost shrink-0"
            disabled={!valid || saving}
            onClick={() => submit(true)}
            title="Save and keep this sheet open for the next one"
          >
            ＋ Another
          </button>
        )}
        <button type="submit" className="btn btn-primary flex-1 sm:flex-none" disabled={!valid || saving}>
          {saving ? 'Saving…' : existing ? 'Save changes' : 'Save expense'}
        </button>
      </div>

    </form>
  );
}
