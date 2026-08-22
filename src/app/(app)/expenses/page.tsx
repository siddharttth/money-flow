'use client';

import { useMemo, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { api, qs } from '@/lib/client';
import { currentMonth, fullDayLabel, monthRange } from '@/lib/dates';
import { formatINR } from '@/lib/money';
import type { Category, Expense, ExpenseList, Person } from '@/lib/types';
import { Card, EmptyState, ErrorState, ListSkeleton, Modal } from '@/components/ui';
import { MonthPicker } from '@/components/month-picker';
import { useShell } from '@/components/app-shell';
import { CategoryIcon, Icon, resolveIcon } from '@/components/icons';

type Sort = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc';

const SORTS: { value: Sort; label: string }[] = [
  { value: 'date_desc', label: 'Newest first' },
  { value: 'date_asc', label: 'Oldest first' },
  { value: 'amount_desc', label: 'Highest amount' },
  { value: 'amount_asc', label: 'Lowest amount' },
];

export default function ExpensesPage() {
  const { openAdd, toast } = useShell();
  const { mutate } = useSWRConfig();

  const [month, setMonth] = useState(currentMonth());
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [personIds, setPersonIds] = useState<string[]>([]);
  const [sort, setSort] = useState<Sort>('date_desc');
  const [search, setSearch] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [limit, setLimit] = useState(100);

  const { start, end } = monthRange(month);
  const cats = useSWR<{ items: Category[] }>('/api/categories');
  const people = useSWR<{ items: Person[] }>('/api/people');

  const key = `/api/expenses${qs({
    start,
    end,
    categoryIds,
    personIds,
    sort,
    search: search.trim(),
    minAmount,
    maxAmount,
    limit,
  })}`;
  const { data, error, isLoading, mutate: reload } = useSWR<ExpenseList>(key);

  // Grouped by day, mirroring how the spreadsheet read — but generated, not typed.
  const grouped = useMemo(() => {
    const map = new Map<string, Expense[]>();
    for (const e of data?.items ?? []) {
      const list = map.get(e.expenseDate) ?? [];
      list.push(e);
      map.set(e.expenseDate, list);
    }
    return [...map.entries()];
  }, [data]);

  const activeFilters = categoryIds.length + personIds.length + (search ? 1 : 0) + (minAmount ? 1 : 0) + (maxAmount ? 1 : 0);

  async function refreshAll() {
    await mutate((k) => typeof k === 'string' && k.startsWith('/api/'), undefined, { revalidate: true });
  }

  async function remove(e: Expense) {
    try {
      await api.del(`/api/expenses/${e.id}`);
      await refreshAll();
      // Soft delete means Undo is a real restore, not a re-create — so no
      // confirmation dialog is needed before deleting.
      toast(`Deleted ${formatINR(e.amountMinor)} · ${e.category.name}`, 'success', {
        label: 'Undo',
        onClick: async () => {
          try {
            await api.post(`/api/expenses/${e.id}/restore`);
            await refreshAll();
            toast('Expense restored');
          } catch {
            toast('Could not restore that expense', 'error');
          }
        },
      });
    } catch {
      toast('Could not delete that expense', 'error');
    }
  }

  async function duplicate(e: Expense) {
    try {
      await api.post(`/api/expenses/${e.id}/duplicate`);
      await refreshAll();
      toast('Expense duplicated');
    } catch {
      toast('Could not duplicate', 'error');
    }
  }

  function clearFilters() {
    setCategoryIds([]);
    setPersonIds([]);
    setSearch('');
    setMinAmount('');
    setMaxAmount('');
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold">Expenses</h1>
          <p className="muted text-sm">
            {data
              ? `${data.total} ${data.total === 1 ? 'transaction' : 'transactions'} · ${formatINR(data.totalMinor)}`
              : 'Loading…'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <MonthPicker month={month} onChange={setMonth} />
          <button className="btn btn-ghost relative" onClick={() => setFiltersOpen(true)}>
            Filters
            {activeFilters > 0 && (
              <span
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full text-[10px] flex items-center justify-center text-white"
                style={{ background: 'var(--accent)' }}
              >
                {activeFilters}
              </span>
            )}
          </button>
        </div>
      </div>

      {activeFilters > 0 && (
        <div className="flex items-center gap-2 text-sm">
          <span className="muted">Filtered</span>
          <button className="chip" onClick={clearFilters}>
            Clear all ×
          </button>
        </div>
      )}

      {error ? (
        <ErrorState message={error.message} onRetry={() => reload()} />
      ) : isLoading ? (
        <Card>
          <ListSkeleton rows={6} />
        </Card>
      ) : grouped.length === 0 ? (
        <Card>
          <EmptyState
            icon="🧾"
            title="Nothing here"
            hint={activeFilters ? 'No expenses match these filters.' : 'No expenses recorded for this month yet.'}
            action={
              activeFilters ? (
                <button className="btn btn-ghost" onClick={clearFilters}>
                  Clear filters
                </button>
              ) : (
                <button className="btn btn-primary" onClick={() => openAdd()}>
                  Add expense
                </button>
              )
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {grouped.map(([date, items]) => {
            const dayTotal = items.reduce((s, e) => s + e.amountMinor, 0);
            return (
              <Card key={date} className="!p-0 overflow-hidden">
                <div
                  className="flex items-center justify-between px-4 sm:px-5 py-3 border-b"
                  style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
                >
                  <span className="text-sm font-medium">{fullDayLabel(date)}</span>
                  <span className="text-sm font-semibold tabular">{formatINR(dayTotal)}</span>
                </div>
                <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                  {items.map((e) => (
                    <ExpenseRow
                      key={e.id}
                      expense={e}
                      onEdit={() => openAdd(e)}
                      onDuplicate={() => duplicate(e)}
                      onDelete={() => remove(e)}
                    />
                  ))}
                </div>
              </Card>
            );
          })}

          {data && data.items.length < data.total && (
            <button className="btn btn-ghost w-full" onClick={() => setLimit((l) => l + 100)}>
              Load more ({data.total - data.items.length} remaining)
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
            <label className="label">Sort</label>
            <select className="input" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Min ₹</label>
              <input className="input tabular" inputMode="decimal" value={minAmount} onChange={(e) => setMinAmount(e.target.value.replace(/[^0-9.]/g, ''))} />
            </div>
            <div>
              <label className="label">Max ₹</label>
              <input className="input tabular" inputMode="decimal" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value.replace(/[^0-9.]/g, ''))} />
            </div>
          </div>

          <div>
            <label className="label">Categories</label>
            <div className="flex flex-wrap gap-2">
              {cats.data?.items.map((c) => (
                <button
                  key={c.id}
                  className="chip"
                  data-selected={categoryIds.includes(c.id)}
                  onClick={() =>
                    setCategoryIds((p) => (p.includes(c.id) ? p.filter((x) => x !== c.id) : [...p, c.id]))
                  }
                >
                  <Icon name={resolveIcon(c.icon)} size={14} /> {c.name}
                </button>
              ))}
            </div>
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
                  {p.name}
                </button>
              ))}
              <button
                className="chip"
                data-selected={personIds.includes('none')}
                onClick={() => setPersonIds((x) => (x.includes('none') ? x.filter((y) => y !== 'none') : [...x, 'none']))}
              >
                — Nobody
              </button>
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

function ExpenseRow({
  expense: e,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  expense: Expense;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <div className="flex items-center gap-3 px-4 sm:px-5 py-3">
        <button onClick={onEdit} className="flex items-center gap-3 min-w-0 flex-1 text-left">
          <CategoryIcon icon={e.category.icon} color={e.category.color} size={36} />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{e.category.name}</p>
            <p className="muted text-xs truncate">
              {e.people.length ? e.people.map((p) => p.name).join(', ') : 'No person'}
              {e.note ? ` · ${e.note}` : ''}
            </p>
          </div>
        </button>
        <span className="tabular font-medium text-sm shrink-0">{formatINR(e.amountMinor)}</span>
        <button
          onClick={() => setOpen((o) => !o)}
          aria-label="Expense actions"
          aria-expanded={open}
          className="muted px-1.5 text-lg leading-none shrink-0"
        >
          ⋯
        </button>
      </div>
      {open && (
        <div className="flex gap-2 px-4 sm:px-5 pb-3 -mt-1 animate-in">
          {/* Edit is omitted — tapping the row itself already opens it. */}
          <button className="chip" onClick={onDuplicate}>
            Duplicate
          </button>
          <button
            className="chip"
            style={{ color: 'var(--danger)' }}
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
