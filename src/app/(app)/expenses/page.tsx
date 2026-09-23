'use client';

import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import useSWR, { useSWRConfig } from 'swr';
import { api, qs } from '@/lib/client';
import { currentMonth, dayLabel, fullDayLabel, monthLabel, monthRange, todayISO } from '@/lib/dates';
import { formatINR } from '@/lib/money';
import type { Category, Person } from '@/lib/types';
import type { FeedTotals, Transaction, TxKind } from '@/lib/transactions';
import { clusterTransactions, type TxCluster } from '@/lib/cluster';
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
import { CategoryIcon, NavIcon, PersonMark } from '@/components/icons';
import { LedgerForm, type LedgerEntry } from '@/components/ledger-form';

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
  const [openCluster, setOpenCluster] = useState<{ cluster: TxCluster; date: string } | null>(null);
  const [editingLedger, setEditingLedger] = useState<string | null>(null);

  const { start, end } = monthRange(month);
  const cats = useSWR<{ items: Category[] }>('/api/categories');
  const people = useSWR<{ items: Person[] }>('/api/people');

  const key = `/api/transactions${qs({ start, end, categoryIds, personIds, kinds, search: search.trim(), limit })}`;
  const { data, error, isLoading } = useSWR<{ items: Transaction[]; hasMore: boolean; totals: FeedTotals }>(key);

  /*
   * Grouped by day, then folded within the day: three identical cigarette runs
   * become one ₹45 row with the entries a tap away. Clustering is display only
   * — the day's subtotal below still adds the individual amounts.
   */
  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of data?.items ?? []) {
      const list = map.get(t.date) ?? [];
      list.push(t);
      map.set(t.date, list);
    }
    return [...map.entries()].map(([date, items]) => ({
      date,
      items,
      clusters: clusterTransactions(items),
    }));
  }, [data]);

  /*
   * Four figures that never mix. Spending, lending, borrowing — and investing,
   * which looks like an expense in this list because it is one row in the same
   * table, but is not money spent. See the note at the top of analytics.ts.
   *
   * These come from the server, aggregated over the WHOLE filter. They used to
   * be summed from `data.items`, which is capped at 150 rows — so a month with
   * 200 transactions showed a total missing fifty of them that quietly
   * corrected itself when you pressed Load more.
   */
  const totals: FeedTotals = data?.totals ?? {
    spentMinor: 0,
    investedMinor: 0,
    incomeMinor: 0,
    lentMinor: 0,
    borrowedMinor: 0,
    count: 0,
    spentCount: 0,
    lentCount: 0,
    borrowedCount: 0,
    lentPeople: 0,
    borrowedPeople: 0,
  };

  /* Over the days of the month that have happened, not the days that had
     spending — the same denominator rule the weekday chart follows. */
  const dailyAverageMinor = useMemo(() => {
    const isCurrent = month === todayISO().slice(0, 7);
    const days = isCurrent
      ? Number(todayISO().slice(8, 10))
      : Number(monthRange(month).end.slice(8, 10));
    return days > 0 ? Math.round(totals.spentMinor / days) : 0;
  }, [totals.spentMinor, month]);

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
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-2 h-2 rounded-full pulse-dot" style={{ background: 'var(--accent)' }} aria-hidden />
            <span className="micro">Master ledger</span>
          </div>
          <h1 className="text-[28px] font-bold tracking-tight leading-tight">
            Ledger <span className="muted font-normal">·</span> {monthLabel(month)}
          </h1>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <MonthPicker month={month} onChange={setMonth} />
          <button className="btn btn-ghost relative" onClick={() => setFiltersOpen(true)}>
            Filters
            {activeFilters > 0 && (
              <span
                className="num min-w-[1.25rem] h-5 px-1 rounded-full text-[10px] font-semibold flex items-center justify-center"
                style={{ background: 'var(--brass)', color: 'var(--on-brass)' }}
              >
                {activeFilters}
              </span>
            )}
          </button>
        </div>
      </div>

      {/*
        ONE STRIP, FOUR FIGURES.
        These were four cards, each with an icon tile, a badge and a line of
        context — at full height even when two of them read ₹0. The context
        stays, as the sub-lines under each figure; the four boxes become one
        surface split by hairlines, because they are four readings of one
        month's filter rather than four separate things.
      */}
      <StatStrip
        glow=""
        items={[
          {
            label: 'Total spent',
            minor: totals.spentMinor,
            icon: <NavIcon name="ledger" size={16} />,
            sub: `${totals.spentCount} ${totals.spentCount === 1 ? 'entry' : 'entries'}`,
            extra:
              dailyAverageMinor > 0 ? (
                <p className="muted text-[11px] mt-0.5 truncate">
                  Daily average <span className="num">{formatINR(dailyAverageMinor)}</span>
                </p>
              ) : undefined,
          },
          {
            label: totals.incomeMinor > 0 ? 'Income received' : 'Invested',
            minor: totals.incomeMinor > 0 ? totals.incomeMinor : totals.investedMinor,
            tone: totals.incomeMinor > 0 ? 'var(--hi)' : undefined,
            icon: <NavIcon name="cash" size={16} />,
            sub: totals.incomeMinor > 0 ? 'came in' : 'not spending',
            extra:
              totals.incomeMinor > 0 && totals.investedMinor > 0 ? (
                <p className="muted text-[11px] mt-0.5 truncate">
                  <span className="num">{formatINR(totals.investedMinor)}</span> also went into investments
                </p>
              ) : undefined,
          },
          {
            label: 'Lent out',
            minor: totals.lentMinor,
            tone: totals.lentMinor ? 'var(--rule-red)' : undefined,
            icon: <span className="text-[13px] font-bold">↑</span>,
            sub:
              totals.lentPeople > 0
                ? `receivable · ${totals.lentPeople} ${totals.lentPeople === 1 ? 'person' : 'people'}`
                : 'receivable',
          },
          {
            label: 'Borrowed',
            minor: totals.borrowedMinor,
            tone: totals.borrowedMinor ? 'var(--credit)' : undefined,
            icon: <span className="text-[13px] font-bold">↓</span>,
            sub:
              totals.borrowedPeople > 0
                ? `payable · ${totals.borrowedPeople} ${totals.borrowedPeople === 1 ? 'person' : 'people'}`
                : 'payable',
          },
        ]}
      />

      {/* The filter people reach for most is one tap, not one sheet. */}
      <div className="scroll-x flex items-center gap-2 -mx-1 px-1 pb-1">
        {/* Each chip says how much it would show. A filter you cannot
            predict the result of is a filter you press twice. */}
        <button className="chip shrink-0" data-selected={kinds.length === 0} onClick={() => setKinds([])}>
          Everything
          <span className="micro ml-1">{totals.spentCount + totals.lentCount + totals.borrowedCount}</span>
        </button>
        {KINDS.map((k) => (
          <button
            key={k.key}
            className="chip shrink-0"
            data-selected={kinds.includes(k.key)}
            onClick={() => setKinds((v) => (v.includes(k.key) ? v.filter((x) => x !== k.key) : [...v, k.key]))}
          >
            {k.label}
            <span className="micro ml-1">
              {k.key === 'expense' ? totals.spentCount : k.key === 'lent' ? totals.lentCount : totals.borrowedCount}
            </span>
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
        /*
         * `overflow-clip`, not `overflow-hidden`. Both round off the corners of
         * the list, but `hidden` makes this div a scroll container — and a
         * sticky child then pins relative to THAT box, so every day heading sat
         * 56px down inside the card, permanently covering its own first row.
         */
        <div className="card overflow-clip">
          {groups.map(({ date, items, clusters }, groupIndex) => {
            const spent = items
              .filter((i) => i.kind === 'expense' && i.category?.kind === 'expense')
              .reduce((s, i) => s + i.amountMinor, 0);
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
                  <span className="flex items-center gap-2.5">
                    <span className="micro">
                      {items.length} {items.length === 1 ? 'entry' : 'entries'}
                    </span>
                    {spent > 0 && (
                      <span
                        className="num text-[11px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: 'var(--surface-2)' }}
                      >
                        Subtotal {formatINR(spent)}
                      </span>
                    )}
                  </span>
                </h2>
                <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                  {clusters.map((c) => (
                    <TransactionRow
                      key={c.key}
                      tx={c.lead}
                      amountMinor={c.totalMinor}
                      count={c.items.length}
                      onOpen={() => setOpenCluster({ cluster: c, date })}
                      onDelete={c.items.length === 1 ? () => remove(c.lead) : undefined}
                      /* Lent and borrowed rows had a Delete and no Edit, so a
                         wrong amount meant delete-and-retype. Expenses open
                         the add sheet themselves; these need the ledger form. */
                      onEdit={
                        c.items.length === 1 && c.lead.kind !== 'expense'
                          ? () => setEditingLedger(c.lead.id)
                          : undefined
                      }
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

      <EditLedgerModal id={editingLedger} onClose={() => setEditingLedger(null)} onSaved={refreshAll} />

      <ClusterModal
        open={openCluster}
        onClose={() => setOpenCluster(null)}
        onDelete={async (t) => {
          await remove(t);
          setOpenCluster(null);
        }}
      />

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

/**
 * The entries behind a clustered row. Nothing here is new information — it is
 * the same rows the ledger would have printed, which is the point: folding them
 * up must never make one unreachable.
 */
function ClusterModal({
  open,
  onClose,
  onDelete,
}: {
  open: { cluster: TxCluster; date: string } | null;
  onClose: () => void;
  onDelete: (t: Transaction) => void;
}) {
  const { openAdd } = useShell();
  const lead = open?.cluster.lead;
  const title = lead
    ? lead.note || lead.category?.name || (lead.kind === 'lent' ? 'Money given' : 'Money received')
    : '';

  return (
    <Modal open={!!open} onClose={onClose} title={title}>
      {open && lead && (
        <>
          <div className="flex items-baseline justify-between gap-3 mb-1">
            <Money minor={open.cluster.totalMinor} className="text-3xl font-semibold" />
            <span className="micro">{dayLabel(open.date)}</span>
          </div>
          <p className="muted text-[13px] mb-5">
            {open.cluster.items.length} entries
            {lead.category ? ` · ${lead.category.name}` : ''}
            {lead.people.length ? ` · ${lead.people.map((p) => p.name).join(', ')}` : ''}
          </p>

          <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {open.cluster.items.map((t) => (
              <li key={`${t.kind}-${t.id}`} className="flex items-center gap-3 py-2.5">
                <Money minor={t.amountMinor} className="text-[14px] font-semibold flex-1" />
                {t.kind === 'expense' && (
                  <button
                    className="tag"
                    onClick={async () => {
                      const full = await api.get<never>(`/api/expenses/${t.id}`);
                      onClose();
                      openAdd(full);
                    }}
                  >
                    Edit
                  </button>
                )}
                <button className="tag" style={{ color: 'var(--rule-red)' }} onClick={() => onDelete(t)}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}

/**
 * Editing one lent/borrowed entry.
 *
 * Fetched by id rather than passed down: the row in the feed is a `Transaction`
 * — the merged shape — and `LedgerForm` wants the ledger entry itself, with its
 * person and its major-unit amount. Asking the API is cheaper than widening the
 * feed for one sheet.
 */
function EditLedgerModal({
  id,
  onClose,
  onSaved,
}: {
  id: string | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { toast } = useShell();
  const { data } = useSWR<LedgerEntry>(id ? `/api/ledger/${id}` : null);

  return (
    <Modal open={!!id} onClose={onClose} title="Edit entry">
      {data ? (
        <LedgerForm
          key={data.id}
          existing={data}
          onSaved={async () => {
            onClose();
            await onSaved();
            toast('Entry updated');
          }}
        />
      ) : (
        <ListSkeleton rows={4} />
      )}
    </Modal>
  );
}
