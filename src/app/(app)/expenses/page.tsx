'use client';

import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import useSWR, { useSWRConfig } from 'swr';
import { api, qs } from '@/lib/client';
import { currentMonth, fullDayLabel, monthRange, todayISO } from '@/lib/dates';
import { formatINR } from '@/lib/money';
import type { Category, Person } from '@/lib/types';
import type { Transaction, TxKind } from '@/lib/transactions';
import { Card, EmptyState, ErrorState, ListSkeleton, Modal, Money } from '@/components/ui';
import { MonthPicker } from '@/components/month-picker';
import { useShell } from '@/components/app-shell';
import { useInspector } from '@/components/inspector';
import { CategoryIcon, PersonMark } from '@/components/icons';

const KINDS: { key: TxKind; label: string }[] = [
  { key: 'expense', label: 'Expenses' },
  { key: 'lent', label: 'Lent' },
  { key: 'borrowed', label: 'Borrowed' },
];

export default function TransactionsPage() {
  return (
    <Suspense fallback={<Card><ListSkeleton rows={6} /></Card>}>
      <Transactions />
    </Suspense>
  );
}

function Transactions() {
  const params = useSearchParams();
  const { openAdd, toast } = useShell();
  const { openPerson, openCategory } = useInspector();
  const { mutate } = useSWRConfig();

  const [month, setMonth] = useState(currentMonth());
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [personIds, setPersonIds] = useState<string[]>(params.get('person') ? [params.get('person')!] : []);
  const [kinds, setKinds] = useState<TxKind[]>([]);
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [limit, setLimit] = useState(150);

  const { start, end } = monthRange(month);
  const cats = useSWR<{ items: Category[] }>('/api/categories');
  const people = useSWR<{ items: Person[] }>('/api/people');

  const key = `/api/transactions${qs({ start, end, categoryIds, personIds, kinds, search: search.trim(), limit })}`;
  const { data, error, isLoading } = useSWR<{ items: Transaction[]; hasMore: boolean }>(key);

  // Grouped by day, with a subtotal of actual spending per day.
  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of data?.items ?? []) {
      const list = map.get(t.date) ?? [];
      list.push(t);
      map.set(t.date, list);
    }
    return [...map.entries()];
  }, [data]);

  const activeFilters = categoryIds.length + personIds.length + kinds.length + (search ? 1 : 0);
  const today = todayISO();

  function clearFilters() {
    setCategoryIds([]);
    setPersonIds([]);
    setKinds([]);
    setSearch('');
  }

  async function refreshAll() {
    await mutate((k) => typeof k === 'string' && k.startsWith('/api/'), undefined, { revalidate: true });
  }

  async function remove(t: Transaction) {
    const url = t.kind === 'expense' ? `/api/expenses/${t.id}` : `/api/ledger/${t.id}`;
    const restore = t.kind === 'expense' ? `/api/expenses/${t.id}/restore` : `/api/ledger/${t.id}/restore`;
    try {
      await api.del(url);
      await refreshAll();
      toast(`Deleted ${formatINR(t.amountMinor)}`, 'success', {
        label: 'Undo',
        onClick: async () => {
          await api.post(restore);
          await refreshAll();
          toast('Restored');
        },
      });
    } catch {
      toast('Could not delete', 'error');
    }
  }

  const dayLabelFor = (d: string) => (d === today ? 'Today' : fullDayLabel(d));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold">Transactions</h1>
          <p className="muted text-sm">
            {data ? `${data.items.length} shown` : 'Loading…'}
            {activeFilters > 0 && ' · filtered'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <MonthPicker month={month} onChange={setMonth} />
          <button className="btn btn-ghost relative" onClick={() => setFiltersOpen(true)}>
            Filters
            {activeFilters > 0 && (
              <span
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full text-[10px] flex items-center justify-center"
                style={{ background: 'var(--brass)', color: 'var(--on-brass)' }}
              >
                {activeFilters}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Type filter is one tap — it is the filter people reach for most. */}
      <div className="flex flex-wrap items-center gap-2">
        <button className="chip" data-selected={kinds.length === 0} onClick={() => setKinds([])}>
          Everything
        </button>
        {KINDS.map((k) => (
          <button
            key={k.key}
            className="chip"
            data-selected={kinds.includes(k.key)}
            onClick={() => setKinds((v) => (v.includes(k.key) ? v.filter((x) => x !== k.key) : [...v, k.key]))}
          >
            {k.label}
          </button>
        ))}
        {activeFilters > 0 && (
          <button className="tag ml-auto" onClick={clearFilters}>
            Clear all ×
          </button>
        )}
      </div>

      {error ? (
        <ErrorState message={error.message} />
      ) : isLoading ? (
        <Card>
          <ListSkeleton rows={8} />
        </Card>
      ) : groups.length === 0 ? (
        <Card>
          <EmptyState
            icon="🧾"
            title="Nothing here"
            hint={activeFilters ? 'No transactions match these filters.' : 'No activity recorded this month yet.'}
            action={
              activeFilters ? (
                <button className="btn btn-ghost" onClick={clearFilters}>
                  Clear filters
                </button>
              ) : (
                <button className="btn btn-primary" onClick={() => openAdd()}>
                  Add transaction
                </button>
              )
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map(([date, items]) => {
            const spent = items.filter((i) => i.kind === 'expense').reduce((s, i) => s + i.amountMinor, 0);
            return (
              <Card key={date} className="!p-0 overflow-hidden">
                <div
                  className="flex items-center justify-between px-4 py-2.5 border-b"
                  style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
                >
                  <span className="text-sm font-semibold">{dayLabelFor(date)}</span>
                  {spent > 0 && <Money minor={spent} className="text-sm font-semibold" />}
                </div>
                <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                  {items.map((t) => (
                    <TxRow
                      key={`${t.kind}-${t.id}`}
                      tx={t}
                      onCategory={openCategory}
                      onPerson={openPerson}
                      onFilterCategory={(id) => setCategoryIds([id])}
                      onFilterPerson={(id) => setPersonIds([id])}
                      onDelete={() => remove(t)}
                    />
                  ))}
                </div>
              </Card>
            );
          })}

          {data?.hasMore && (
            <button className="btn btn-ghost w-full" onClick={() => setLimit((l) => l + 150)}>
              Load more
            </button>
          )}
        </div>
      )}

      <Modal open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filters">
        <div className="space-y-5">
          <div>
            <label className="label">Search notes</label>
            <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="dinner, cab…" />
          </div>

          <div>
            <label className="label">Categories</label>
            <div className="flex flex-wrap gap-2">
              {cats.data?.items.map((c) => (
                <button
                  key={c.id}
                  className="chip"
                  data-selected={categoryIds.includes(c.id)}
                  onClick={() => setCategoryIds((p) => (p.includes(c.id) ? p.filter((x) => x !== c.id) : [...p, c.id]))}
                >
                  <CategoryIcon icon={c.icon} color={c.color} size={18} />
                  {c.name}
                </button>
              ))}
            </div>
            {categoryIds.length > 0 && kinds.some((k) => k !== 'expense') && (
              <p className="muted text-xs mt-2">Lent and borrowed entries have no category, so they are hidden.</p>
            )}
          </div>

          <div>
            <label className="label">People</label>
            <div className="flex flex-wrap gap-2">
              {people.data?.items.map((p) => (
                <button
                  key={p.id}
                  className="chip"
                  data-selected={personIds.includes(p.id)}
                  onClick={() => setPersonIds((x) => (x.includes(p.id) ? x.filter((y) => y !== p.id) : [...x, p.id]))}
                >
                  <PersonMark name={p.name} color={p.color} size={18} />
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <button className="btn btn-ghost" onClick={clearFilters}>
              Clear
            </button>
            <button className="btn btn-primary" onClick={() => setFiltersOpen(false)}>
              Show results
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function TxRow({
  tx,
  onCategory,
  onPerson,
  onFilterCategory,
  onFilterPerson,
  onDelete,
}: {
  tx: Transaction;
  onCategory: (id: string) => void;
  onPerson: (id: string) => void;
  onFilterCategory: (id: string) => void;
  onFilterPerson: (id: string) => void;
  onDelete: () => void;
}) {
  const { openAdd } = useShell();
  const isLedger = tx.kind !== 'expense';

  return (
    <div className="row group flex items-center gap-3 px-4 py-3">
      {tx.category ? (
        <CategoryIcon icon={tx.category.icon} color={tx.category.color} size={34} />
      ) : (
        <span
          className="w-[34px] h-[34px] rounded-lg flex items-center justify-center text-sm font-bold shrink-0"
          style={{
            background: tx.kind === 'borrowed' ? 'var(--credit-soft)' : 'var(--rule-red-soft)',
            color: tx.kind === 'borrowed' ? 'var(--credit)' : 'var(--rule-red)',
          }}
        >
          {tx.kind === 'borrowed' ? '↓' : '↑'}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">
          {tx.note || tx.category?.name || (tx.kind === 'lent' ? 'Money given' : 'Money received')}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          {tx.category && (
            <button
              className="tag"
              title="Open category · shift-click to filter"
              onClick={(e) => (e.shiftKey ? onFilterCategory(tx.category!.id) : onCategory(tx.category!.id))}
            >
              {tx.category.name}
            </button>
          )}
          {tx.people.map((p) => (
            <button
              key={p.id}
              className="tag"
              title="Open person · shift-click to filter"
              onClick={(e) => (e.shiftKey ? onFilterPerson(p.id) : onPerson(p.id))}
            >
              <PersonMark name={p.name} color={p.color} size={14} />
              {p.name}
            </button>
          ))}
          {isLedger && <span className="micro">{tx.kind}</span>}
        </div>
      </div>

      {/* Actions appear on hover; always present for touch. */}
      <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity" style={{ transitionDuration: '150ms' }}>
        {tx.kind === 'expense' && (
          <button
            className="tag"
            onClick={async () => {
              const full = await api.get<never>(`/api/expenses/${tx.id}`);
              openAdd(full);
            }}
          >
            Edit
          </button>
        )}
        <button className="tag" style={{ color: 'var(--rule-red)' }} onClick={onDelete}>
          Delete
        </button>
      </div>

      <Money minor={tx.amountMinor} className="text-sm font-semibold shrink-0 w-20 text-right" />
    </div>
  );
}
