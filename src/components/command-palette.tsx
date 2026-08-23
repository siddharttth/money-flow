'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import type { Category, Person } from '@/lib/types';
import { useInspector } from './inspector';
import { CategoryIcon, PersonMark } from './icons';

type Item = { id: string; label: string; hint: string; run: () => void; icon?: React.ReactNode };

/** ⌘K / Ctrl+K. Jump to a screen, or open any person or category inspector. */
export function CommandPalette({ onAdd }: { onAdd: () => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const { openPerson, openCategory } = useInspector();

  // Only fetched once the palette has been opened.
  const { data: people } = useSWR<{ items: Person[] }>(open ? '/api/people' : null);
  const { data: cats } = useSWR<{ items: Category[] }>(open ? '/api/categories' : null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
        setQ('');
        setCursor(0);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 40);
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const nav: Item[] = [
      { id: 'n-add', label: 'Add transaction', hint: 'N', run: onAdd },
      { id: 'n-dash', label: 'Dashboard', hint: 'Go', run: () => router.push('/dashboard') },
      { id: 'n-tx', label: 'Transactions', hint: 'Go', run: () => router.push('/expenses') },
      { id: 'n-people', label: 'People & Ledger', hint: 'Go', run: () => router.push('/people') },
      { id: 'n-analytics', label: 'Analytics', hint: 'Go', run: () => router.push('/analytics') },
      { id: 'n-settings', label: 'Settings', hint: 'Go', run: () => router.push('/settings') },
    ];
    const p: Item[] = (people?.items ?? []).map((x) => ({
      id: `p-${x.id}`,
      label: x.name,
      hint: 'Person',
      run: () => openPerson(x.id),
      icon: <PersonMark name={x.name} color={x.color} size={22} />,
    }));
    const c: Item[] = (cats?.items ?? []).map((x) => ({
      id: `c-${x.id}`,
      label: x.name,
      hint: 'Category',
      run: () => openCategory(x.id),
      icon: <CategoryIcon icon={x.icon} color={x.color} size={22} />,
    }));
    const all = [...nav, ...p, ...c];
    const needle = q.trim().toLowerCase();
    return needle ? all.filter((i) => i.label.toLowerCase().includes(needle)).slice(0, 12) : all.slice(0, 12);
  }, [people, cats, q, router, onAdd, openPerson, openCategory]);

  if (!open) return null;

  const choose = (i: Item) => {
    setOpen(false);
    i.run();
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center pt-[12vh] px-4 bg-black/55 backdrop-blur-[2px] animate-fade"
      onClick={() => setOpen(false)}
    >
      <div
        className="card w-full max-w-lg overflow-hidden animate-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setCursor(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setCursor((c) => Math.min(c + 1, items.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setCursor((c) => Math.max(c - 1, 0));
            } else if (e.key === 'Enter' && items[cursor]) {
              e.preventDefault();
              choose(items[cursor]);
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
          placeholder="Search people, categories, screens…"
          className="w-full px-4 py-3.5 bg-transparent outline-none text-[15px] border-b"
          style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
        />
        <div className="max-h-[52vh] overflow-y-auto py-1">
          {items.length === 0 && <p className="muted text-sm px-4 py-6 text-center">No matches</p>}
          {items.map((i, idx) => (
            <button
              key={i.id}
              onMouseEnter={() => setCursor(idx)}
              onClick={() => choose(i)}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-left"
              style={{ background: idx === cursor ? 'var(--surface-2)' : 'transparent' }}
            >
              {i.icon ?? <span className="w-[22px]" />}
              <span className="text-sm flex-1 truncate">{i.label}</span>
              <span className="micro shrink-0">{i.hint}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
