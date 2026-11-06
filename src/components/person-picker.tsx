'use client';

import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useSWRConfig } from 'swr';
import { api, RequestError } from '@/lib/client';
import type { Person } from '@/lib/types';
import { ChipRow } from './ui';

/** How many people are shown before "Show all". */
const TOP = 5;

/**
 * Who an entry was with — the five you use most, the rest one tap away, and a
 * way to add someone without leaving the sheet.
 *
 * Fifteen chips of people, ten of whom you log twice a year, pushed the date
 * and note off the screen. Ranked by how often each person is actually on an
 * entry, the common case stays a single tap and the long tail stays hidden
 * until asked for. A person who is selected is always shown, even from the
 * hidden part — otherwise picking someone and then collapsing the list would
 * make the choice vanish.
 *
 * Creating a person here saves a trip to People and back, which used to throw
 * away whatever had been typed into the sheet.
 */
export function PersonPicker({
  people,
  selectedIds,
  onSelect,
  onCreated,
  extra,
}: {
  /** Already filtered to who may be picked here (e.g. without "Me"). */
  people: Person[];
  selectedIds: string[];
  onSelect: (id: string) => void;
  /** Called with the new person once saved, so the form can select them. */
  onCreated: (person: Person) => void;
  /** Rendered at the end of the chip row — the expense form's "Multiple". */
  extra?: ReactNode;
}) {
  const { mutate } = useSWRConfig();
  const [showAll, setShowAll] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const ranked = useMemo(
    () =>
      [...people].sort(
        (a, b) =>
          Number(b.isSelf) - Number(a.isSelf) ||
          (b.usageCount ?? 0) - (a.usageCount ?? 0) ||
          a.sortOrder - b.sortOrder,
      ),
    [people],
  );

  const top = ranked.slice(0, TOP);
  const topIds = new Set(top.map((p) => p.id));
  // Anyone selected from the hidden part stays visible.
  const pinned = ranked.filter((p) => !topIds.has(p.id) && selectedIds.includes(p.id));
  const visible = showAll ? ranked : [...top, ...pinned];
  const hiddenCount = ranked.length - visible.length;

  async function create() {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const person = await api.post<Person>('/api/people', { name: trimmed });
      await mutate('/api/people');
      onCreated(person);
      setName('');
      setAdding(false);
    } catch (e) {
      setError(e instanceof RequestError ? e.message : 'Could not add that person');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <ChipRow>
        {visible.map((p) => {
          const on = selectedIds.includes(p.id);
          return (
            <button
              key={p.id}
              type="button"
              className="chip"
              data-selected={on}
              onClick={() => onSelect(p.id)}
              style={on ? { background: p.color, borderColor: p.color, color: '#fff' } : undefined}
            >
              {p.name}
            </button>
          );
        })}

        {(hiddenCount > 0 || showAll) && ranked.length > TOP && (
          <button type="button" className="chip" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Show less' : `Show all (${hiddenCount} more)`}
          </button>
        )}

        {extra}

        {!adding && (
          <button
            type="button"
            className="chip"
            onClick={() => {
              setAdding(true);
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
          >
            ＋ New person
          </button>
        )}
      </ChipRow>

      {adding && (
        <div className="mt-3">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                // Enter adds the person; it must not submit the whole sheet.
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.stopPropagation();
                  create();
                } else if (e.key === 'Escape') {
                  e.stopPropagation();
                  setAdding(false);
                  setName('');
                  setError(null);
                }
              }}
              placeholder="Name"
              maxLength={60}
              autoComplete="off"
              aria-label="New person's name"
              className="input flex-1"
            />
            <button type="button" className="btn btn-primary" disabled={!name.trim() || busy} onClick={create}>
              {busy ? 'Adding…' : 'Add'}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setAdding(false);
                setName('');
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
          {error && (
            <p className="text-[12px] mt-1.5" style={{ color: 'var(--rule-red)' }} role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
