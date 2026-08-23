'use client';

import { createContext, useCallback, useContext, useState, ReactNode } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { formatINR } from '@/lib/money';
import { dayLabel, monthLabel } from '@/lib/dates';
import type { Transaction } from '@/lib/transactions';
import { Drawer } from './drawer';
import { ListSkeleton, EmptyState, Money } from './ui';
import { CategoryIcon, PersonMark } from './icons';

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
          className="flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors"
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

function TxRow({ tx, onCategory }: { tx: Transaction; onCategory?: (id: string) => void }) {
  const signed = tx.kind === 'borrowed';
  return (
    <div className="flex items-center gap-3 py-2.5">
      {tx.category ? (
        <CategoryIcon icon={tx.category.icon} color={tx.category.color} size={32} />
      ) : (
        <span
          className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0"
          style={{
            background: signed ? 'var(--credit-soft)' : 'var(--rule-red-soft)',
            color: signed ? 'var(--credit)' : 'var(--rule-red)',
          }}
        >
          {signed ? '↓' : '↑'}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">
          {tx.category ? (
            onCategory ? (
              <button className="hover:underline" onClick={() => onCategory(tx.category!.id)}>
                {tx.category.name}
              </button>
            ) : (
              tx.category.name
            )
          ) : tx.kind === 'lent' ? (
            'I gave'
          ) : (
            'I got'
          )}
        </p>
        <p className="muted text-xs truncate">
          {dayLabel(tx.date)}
          {tx.note ? ` · ${tx.note}` : ''}
        </p>
      </div>
      <Money minor={tx.amountMinor} className="text-sm font-semibold shrink-0" />
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
  expenses: Transaction[];
  ledger: { id: string; direction: 'out' | 'in'; amountMinor: number; entryDate: string; note: string | null }[];
};

function PersonInspector({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading } = useSWR<PersonInsight>(`/api/insights/person/${id}`);
  const [tab, setTab] = useState('Expenses');
  const { openCategory } = useInspector();

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
                {data.expenses.map((t) => (
                  <TxRow key={t.id} tx={t} onCategory={openCategory} />
                ))}
              </div>
            ) : (
              <EmptyState icon="🧾" title="No shared expenses yet" hint="Tag them on an expense and it shows here." />
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
                    <p className="text-sm font-medium">{e.direction === 'out' ? 'I gave' : 'I got'}</p>
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
            <EmptyState icon="🤝" title="Nothing lent or borrowed" hint="Record it from the People screen." />
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
            <EmptyState icon="📭" title="Nothing this month" />
          )}
        </>
      )}
    </Drawer>
  );
}
