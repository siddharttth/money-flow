'use client';

import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import useSWR, { useSWRConfig } from 'swr';
import { api, qs } from '@/lib/client';
import { currentMonth, fullDayLabel, monthLabel, monthRange, todayISO } from '@/lib/dates';
import { formatINR } from '@/lib/money';
import type { Category, Person } from '@/lib/types';
import type { Transaction, TxKind } from '@/lib/transactions';
import {
  Card,
  EmptyState,
  ErrorState,
  ListSkeleton,
  Modal,
  Money,
  PageHeader,
  StatStrip,
} from '@/components/ui';
import { MonthPicker } from '@/components/month-picker';
import { TransactionRow } from '@/components/tx-row';
import { useShell } from '@/components/app-shell';
import { CategoryIcon, PersonMark } from '@/components/icons';

const KINDS: { key: TxKind; label: string }[] = [
  { key: 'expense', label: 'Spent' },
  { key: 'lent', label: 'Lent' },
  { key: 'borrowed', label: 'Borrowed' },
];

export default function TransactionsPage() {
  return (
    <Suspense
      fallback={
        <Card>
          <ListSkeleton rows={6} />
        </Card>
      }
    >
      <Transactions />
    </Suspense>
  );
}

/**
 * The ledger. One row per transaction, grouped by day, with the day's own
 * subtotal in a heading that stays put while its rows scroll under it — the
 * thing a paper ledger does for free and most apps drop.
 */
function Transactions() {
  const params = useSearchParams();
  const { openAdd, toast } = useShell();
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

  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of data?.items ?? []) {
      const list = map.get(t.date) ?? [];
      list.push(t);
      map.set(t.date, list);
    }
    return [...map.entries()];
  }, [data]);

  /** Spending, lending and borrowing never mix into one figure. */
  const totals = useMemo(() => {
    const items = data?.items ?? [];
    const of = (kind: TxKind) =>
      items.filter((t) => t.kind === kind).reduce((sum, t) => sum + t.amountMinor, 0);
    const spends = items.filter((t) => t.kind === 'expense');
    const biggest = spends.reduce<Transaction | null>(
      (best, t) => (!best || t.amountMinor > best.amountMinor ? t : best),
      null,
    );
    return {
      spent: of('expense'),
      lent: of('lent'),
      borrowed: of('borrowed'),
      count: items.length,
      biggest,
    };
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
      <PageHeader
        eyebrow="Ledger"
        title={monthLabel(month)}
        actions={
          <>
            <MonthPicker month={month} onChange={setMonth} />
            <button className="btn btn-ghost relative max-sm:flex-1" onClick={() => setFiltersOpen(true)}>
              Filters
              {activeFilters > 0 && (
                <span
                  className="num absolute -top-1.5 -right-1.5 min-w-[1.25rem] h-5 px-1 rounded-full text-[10px] font-semibold flex items-center justify-center"
                  style={{ background: 'var(--brass)', color: 'var(--on-brass)' }}
                >
                  {activeFilters}
                </span>
              )}
            </button>
          </>
        }
      />

      <StatStrip
        cols={4}
        items={[
          { label: 'Spent', minor: totals.spent, sub: `${totals.count} shown` },
          { label: 'Lent out', minor: totals.lent, tone: totals.lent ? 'var(--rule-red)' : undefined },
          { label: 'Borrowed', minor: totals.borrowed, tone: totals.borrowed ? 'var(--credit)' : undefined },
          {
            label: 'Biggest entry',
            minor: totals.biggest?.amountMinor ?? 0,
            sub: totals.biggest
              ? totals.biggest.note || totals.biggest.category?.name || undefined
              : undefined,
          },
        ]}
      />

      {/* The filter people reach for most is one tap, not one sheet. */}
      <div className="scroll-x flex items-center gap-2 -mx-1 px-1 pb-1">
        <button className="chip shrink-0" data-selected={kinds.length === 0} onClick={() => setKinds([])}>
          Everything
        </button>
        {KINDS.map((k) => (
          <button
            key={k.key}
            className="chip shrink-0"
            data-selected={kinds.includes(k.key)}
            onClick={() => setKinds((v) => (v.includes(k.key) ? v.filter((x) => x !== k.key) : [...v, k.key]))}
          >
            {k.label}
          </button>
        ))}
        {activeFilters > 0 && (
          <button className="tag shrink-0 ml-auto" onClick={clearFilters}>
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
            title="Nothing here"
            hint={
              activeFilters
                ? 'No transactions match these filters.'
                : `Nothing recorded for ${monthLabel(month)} yet.`
            }
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
        <div className="card overflow-hidden">
          {groups.map(([date, items], groupIndex) => {
            const spent = items.filter((i) => i.kind === 'expense').reduce((s, i) => s + i.amountMinor, 0);
            return (
              <section key={date}>
                <h2
                  /* Sticks below the mobile header; on desktop there is no
                     header, so it sticks to the top of the viewport. */
                  className="stick flex items-baseline justify-between gap-3 px-3.5 sm:px-4 py-2 border-y"
                  style={{
                    borderColor: 'var(--border)',
                    background: 'var(--surface-2)',
                    borderTopWidth: groupIndex === 0 ? 0 : 1,
                    top: 'var(--stick-top, 0px)',
                  }}
                >
                  <span className="text-[12px] font-semibold tracking-wide">{dayLabelFor(date)}</span>
                  <span className="flex items-baseline gap-2">
                    <span className="micro">{items.length}</span>
                    {spent > 0 && <Money minor={spent} className="text-[12px] font-semibold" />}
                  </span>
                </h2>
                <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                  {items.map((t) => (
                    <TransactionRow
                      key={`${t.kind}-${t.id}`}
                      tx={t}
                      onDelete={() => remove(t)}
                      onFilterCategory={(id) => setCategoryIds([id])}
                      onFilterPerson={(id) => setPersonIds([id])}
                    />
                  ))}
                </div>
              </section>
            );
          })}

          {data?.hasMore && (
            <button
              className="w-full py-3 text-[13px] font-semibold border-t"
              style={{ borderColor: 'var(--border)', color: 'var(--accent)' }}
              onClick={() => setLimit((l) => l + 150)}
            >
              Load more
            </button>
          )}
        </div>
      )}

      <Modal open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filters">
        <div className="space-y-5">
          <div>
            <label className="label" htmlFor="tx-search">
              Search notes
            </label>
            <input
              id="tx-search"
              className="input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="dinner, cab…"
            />
          </div>

          <div>
            <span className="label">Categories</span>
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
            <span className="label">People</span>
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
