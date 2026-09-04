'use client';

import { createContext, useCallback, useContext, useState, ReactNode } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import Link from 'next/link';
import { api } from '@/lib/client';
import { formatINR } from '@/lib/money';
import { dayLabel, monthLabel } from '@/lib/dates';
import type { Transaction } from '@/lib/transactions';
import type { PersonExpense } from '@/lib/analytics';
import { Drawer } from './drawer';
import { ListSkeleton, EmptyState, Money } from './ui';
import { CategoryIcon, PersonMark } from './icons';
import { useToast } from './toast';

/**
 * The app's connective tissue: a person or category name is clickable
 * everywhere, and opens the same inspector regardless of which screen you
 * were on. One provider owns the open entity so no screen has to wire it up.
 */

type Entity = { type: 'person'; id: string } | { type: 'category'; id: string } | null;

const Ctx = createContext<{
  openPerson: (id: string) => void;
  openCategory: (id: string) => void;
  close: () => void;
}>({ openPerson: () => {}, openCategory: () => {}, close: () => {} });

export const useInspector = () => useContext(Ctx);

export function InspectorProvider({ children }: { children: ReactNode }) {
  const [entity, setEntity] = useState<Entity>(null);

  const openPerson = useCallback((id: string) => setEntity({ type: 'person', id }), []);
  const openCategory = useCallback((id: string) => setEntity({ type: 'category', id }), []);
  const close = useCallback(() => setEntity(null), []);

  return (
    <Ctx.Provider value={{ openPerson, openCategory, close }}>
      {children}
      {entity?.type === 'person' && <PersonInspector id={entity.id} onClose={close} />}
      {entity?.type === 'category' && <CategoryInspector id={entity.id} onClose={close} />}
    </Ctx.Provider>
  );
}

/* ------------------------------- shared bits ------------------------------ */

function Kpi({ label, children, tone }: { label: string; children: ReactNode; tone?: string }) {
  return (
    <div className="rounded-lg px-3 py-2.5" style={{ background: 'var(--surface-2)' }}>
      <p className="micro mb-1">{label}</p>
      <p className="text-lg font-semibold num" style={{ color: tone }}>
        {children}
      </p>
    </div>
  );
}

function Tabs({ tabs, active, onChange }: { tabs: string[]; active: string; onChange: (t: string) => void }) {
  return (
    <div className="flex gap-1 p-1 rounded-lg mb-4" style={{ background: 'var(--surface-2)' }}>
      {tabs.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className="flex-1 h-9 rounded-md text-xs font-semibold transition-colors"
          style={{
            transitionDuration: '150ms',
            background: active === t ? 'var(--surface)' : 'transparent',
            color: active === t ? 'var(--text)' : 'var(--text-muted)',
          }}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

/**
 * One expense as it lands on one person: their share, with the whole bill and
 * the number of ways it went shown beside it.
 *
 * Printing "₹25" alone would be a figure with no provenance — the row it came
 * from says ₹75 everywhere else in the app. "₹75 ÷ 3" is the working, so the
 * two numbers can be reconciled at a glance instead of looking like a bug.
 */
function ShareRow({
  entry,
  onCategory,
}: {
  entry: PersonExpense;
  onCategory?: (id: string) => void;
}) {
  const split = entry.participants > 1;
  return (
    <div className="flex items-center gap-3 py-2.5">
      <CategoryIcon icon={entry.category.icon} color={entry.category.color} size={32} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">
          {onCategory ? (
            <button className="hover:underline py-1.5 -my-1.5" onClick={() => onCategory(entry.category.id)}>
              {entry.category.name}
            </button>
          ) : (
            entry.category.name
          )}
        </p>
        <p className="muted text-xs truncate">
          {dayLabel(entry.expenseDate)}
          {entry.note ? ` · ${entry.note}` : ''}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <Money minor={entry.shareMinor} className="text-sm font-semibold" />
        {split && (
          <p className="num text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {formatINR(entry.amountMinor)} ÷ {entry.participants}
          </p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ person drawer ----------------------------- */

type PersonInsight = {
  person: { id: string; name: string; relationshipType: string; color: string; isSelf: boolean };
  lifetimeMinor: number;
  monthMinor: number;
  month: string;
  balanceMinor: number;
  lentMinor: number;
  borrowedMinor: number;
  categories: { categoryId: string; name: string; icon: string; color: string; totalMinor: number }[];
  expenses: PersonExpense[];
  ledger: { id: string; direction: 'out' | 'in'; amountMinor: number; entryDate: string; note: string | null }[];
};

function PersonInspector({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading, mutate } = useSWR<PersonInsight>(`/api/insights/person/${id}`);
  const [tab, setTab] = useState('Expenses');
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const { openCategory } = useInspector();
  const toast = useToast();
  const { mutate: mutateAll } = useSWRConfig();

  /**
   * Soft-deletes every entry with this person and offers the way back.
   *
   * The undo is not decoration: this is one tap that erases years of history,
   * and the rows are only marked deleted, so restoring them is exact rather
   * than a re-entry job.
   */
  async function clearLedger() {
    setClearing(true);
    try {
      const { ids, cleared } = await api.post<{ ids: string[]; cleared: number }>(
        `/api/ledger/person/${id}/clear`,
      );
      await Promise.all([mutate(), mutateAll((k) => typeof k === 'string' && k.startsWith('/api/'))]);
      setConfirmClear(false);
      toast(`Cleared ${cleared} ${cleared === 1 ? 'entry' : 'entries'}`, 'success', {
        label: 'Undo',
        onClick: async () => {
          await api.post('/api/ledger/restore', { ids });
          await Promise.all([mutate(), mutateAll((k) => typeof k === 'string' && k.startsWith('/api/'))]);
          toast('History restored');
        },
      });
    } catch {
      toast('Could not clear the history', 'error');
    } finally {
      setClearing(false);
    }
  }

  const bal = data?.balanceMinor ?? 0;

  return (
    <Drawer
      open
      onClose={onClose}
      title={
        data ? (
          <div className="flex items-center gap-3 min-w-0">
            <PersonMark name={data.person.name} color={data.person.color} size={40} />
            <div className="min-w-0">
              <h2 className="text-base font-semibold truncate">{data.person.name}</h2>
              <span className="micro capitalize">{data.person.relationshipType}</span>
            </div>
          </div>
        ) : (
          <h2 className="text-base font-semibold">Loading…</h2>
        )
      }
      footer={
        data && !data.person.isSelf ? (
          <div className="flex gap-2">
            <Link href={`/people?settle=${id}`} onClick={onClose} className="btn btn-ghost flex-1 text-sm">
              Settle up
            </Link>
            <Link href={`/expenses?person=${id}`} onClick={onClose} className="btn btn-primary flex-1 text-sm">
              Log expense
            </Link>
          </div>
        ) : undefined
      }
    >
      {isLoading || !data ? (
        <ListSkeleton rows={6} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <Kpi label="Spent · lifetime">{formatINR(data.lifetimeMinor)}</Kpi>
            <Kpi label={`Spent · ${monthLabel(data.month).split(' ')[0]}`}>{formatINR(data.monthMinor)}</Kpi>
          </div>

          <div
            className="rounded-lg px-3 py-3 mb-5 border"
            style={{
              background: bal === 0 ? 'var(--surface-2)' : bal > 0 ? 'var(--credit-soft)' : 'var(--rule-red-soft)',
              borderColor: 'var(--border)',
            }}
          >
            <p className="micro mb-1">Net ledger balance</p>
            <p
              className="text-xl font-semibold num"
              style={{ color: bal === 0 ? 'var(--text)' : bal > 0 ? 'var(--credit)' : 'var(--rule-red)' }}
            >
              {bal === 0 ? 'Settled' : `${formatINR(Math.abs(bal))} ${bal > 0 ? 'owed to you' : 'you owe'}`}
            </p>
            {(data.lentMinor > 0 || data.borrowedMinor > 0) && (
              <p className="muted text-xs mt-1">
                Gave {formatINR(data.lentMinor)} · Got {formatINR(data.borrowedMinor)}
              </p>
            )}
          </div>

          <Tabs tabs={['Expenses', 'Lent & borrowed']} active={tab} onChange={setTab} />

          {tab === 'Expenses' ? (
            data.expenses.length ? (
              <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {data.expenses.map((e) => (
                  <ShareRow key={e.id} entry={e} onCategory={openCategory} />
                ))}
              </div>
            ) : (
              <EmptyState title="No shared expenses yet" hint="Tag them on an expense and it shows here." />
            )
          ) : data.ledger.length ? (
            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {data.ledger.map((e) => (
                <div key={e.id} className="flex items-center gap-3 py-2.5">
                  <span
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0"
                    style={{
                      background: e.direction === 'out' ? 'var(--rule-red-soft)' : 'var(--credit-soft)',
                      color: e.direction === 'out' ? 'var(--rule-red)' : 'var(--credit)',
                    }}
                  >
                    {e.direction === 'out' ? '↑' : '↓'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{e.direction === 'out' ? 'I lent' : 'I borrowed'}</p>
                    <p className="muted text-xs truncate">
                      {dayLabel(e.entryDate)}
                      {e.note ? ` · ${e.note}` : ''}
                    </p>
                  </div>
                  <Money minor={e.amountMinor} className="text-sm font-semibold shrink-0" />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Nothing lent or borrowed" hint="Record it from the People screen." />
          )}

          {/*
            Wiping the slate. Sits under the entries rather than in the footer:
            it belongs to this tab, and it should take a deliberate scroll to
            reach rather than sitting next to the buttons people press often.
          */}
          {tab !== 'Expenses' && data.ledger.length > 0 && (
            <div className="mt-6 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
              {confirmClear ? (
                <div className="well px-3.5 py-3">
                  <p className="text-[13px] leading-relaxed">
                    Clear all {data.ledger.length} entries with {data.person.name}? The balance goes to settled and
                    the history disappears from the app.
                  </p>
                  <div className="flex gap-2 mt-3">
                    <button className="btn btn-ghost flex-1" onClick={() => setConfirmClear(false)} disabled={clearing}>
                      Keep them
                    </button>
                    <button className="btn btn-danger flex-1" onClick={clearLedger} disabled={clearing}>
                      {clearing ? 'Clearing…' : 'Clear history'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="tag"
                  style={{ color: 'var(--rule-red)' }}
                  onClick={() => setConfirmClear(true)}
                >
                  Clear all lending history
                </button>
              )}
            </div>
          )}
        </>
      )}
    </Drawer>
  );
}

/* ----------------------------- category drawer ---------------------------- */

type CategoryInsight = {
  category: { id: string; name: string; icon: string; color: string; monthlyBudgetMinor: number | null };
  month: string;
  monthMinor: number;
  monthCount: number;
  lifetimeMinor: number;
  avgTransactionMinor: number;
  pacedBudgetMinor: number | null;
  projectedMinor: number;
  transactions: Transaction[];
};

function CategoryInspector({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading } = useSWR<CategoryInsight>(`/api/insights/category/${id}`);
  const { openPerson } = useInspector();

  const budget = data?.category.monthlyBudgetMinor ?? null;
  const pct = budget ? Math.min((data!.monthMinor / budget) * 100, 100) : 0;
  const overPace = budget && data?.pacedBudgetMinor ? data.monthMinor > data.pacedBudgetMinor : false;

  return (
    <Drawer
      open
      onClose={onClose}
      title={
        data ? (
          <div className="flex items-center gap-3 min-w-0">
            <CategoryIcon icon={data.category.icon} color={data.category.color} size={40} />
            <div className="min-w-0">
              <h2 className="text-base font-semibold truncate">{data.category.name}</h2>
              <span className="micro">{monthLabel(data.month)}</span>
            </div>
          </div>
        ) : (
          <h2 className="text-base font-semibold">Loading…</h2>
        )
      }
    >
      {isLoading || !data ? (
        <ListSkeleton rows={6} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <Kpi label="This month">{formatINR(data.monthMinor)}</Kpi>
            <Kpi label="Avg transaction">{formatINR(data.avgTransactionMinor)}</Kpi>
            <Kpi label="Transactions">{String(data.monthCount)}</Kpi>
            <Kpi label="Projected">{formatINR(data.projectedMinor)}</Kpi>
          </div>

          {budget ? (
            <div className="mb-5">
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="micro">Monthly budget</span>
                <span className="text-xs num">
                  {formatINR(data.monthMinor)} / {formatINR(budget)}
                </span>
              </div>
              <div className="h-2 rounded-full overflow-hidden relative" style={{ background: 'var(--surface-2)' }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${pct}%`,
                    background: data.monthMinor > budget ? 'var(--rule-red)' : 'var(--credit)',
                    transitionDuration: '150ms',
                  }}
                />
                {/* Where an even burn would have you today. */}
                {data.pacedBudgetMinor != null && (
                  <span
                    className="absolute top-0 bottom-0 w-px"
                    style={{
                      left: `${Math.min((data.pacedBudgetMinor / budget) * 100, 100)}%`,
                      background: 'var(--text)',
                      opacity: 0.55,
                    }}
                    aria-hidden
                  />
                )}
              </div>
              <p className="muted text-xs mt-1.5">
                {overPace
                  ? `Ahead of pace — the marker is where an even burn would put you today.`
                  : `On or under pace for ${monthLabel(data.month)}.`}
              </p>
            </div>
          ) : (
            <p className="muted text-xs mb-5">
              No monthly budget set. Add one in Settings → Categories &amp; Budgets to track pacing.
            </p>
          )}

          <p className="micro mb-2">Transactions</p>
          {data.transactions.length ? (
            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {data.transactions.map((t) => (
                <div key={t.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{t.note || data.category.name}</p>
                    <p className="muted text-xs truncate flex items-center gap-1.5">
                      {dayLabel(t.date)}
                      {t.people.map((p) => (
                        <button key={p.id} className="tag !py-0" onClick={() => openPerson(p.id)}>
                          {p.name}
                        </button>
                      ))}
                    </p>
                  </div>
                  <Money minor={t.amountMinor} className="text-sm font-semibold shrink-0" />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Nothing this month" />
          )}
        </>
      )}
    </Drawer>
  );
}
