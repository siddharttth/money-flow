'use client';

import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { api, RequestError } from '@/lib/client';
import { currentMonth, monthLabel } from '@/lib/dates';
import { formatINR } from '@/lib/money';
import type { Category, CategoryStat } from '@/lib/types';
import { Card, EmptyState, ListSkeleton, Modal, SectionTitle } from '@/components/ui';
import { MonthPicker } from '@/components/month-picker';
import { ShareBar } from '@/components/charts';
import { useShell } from '@/components/app-shell';
import { PALETTE } from '@/lib/defaults';

const ICONS = ['💸', '🧾', '🚬', '🍔', '🥦', '🛍️', '🚕', '✨', '📈', '🏠', '💊', '🎬', '📚', '⛽', '🎁', '💇'];

export default function CategoriesPage() {
  const { toast } = useShell();
  const { mutate } = useSWRConfig();
  const [month, setMonth] = useState(currentMonth());
  const [editing, setEditing] = useState<Category | null>(null);
  const [creating, setCreating] = useState(false);

  const cats = useSWR<{ items: Category[] }>('/api/categories?includeInactive=true');
  const stats = useSWR<{ items: CategoryStat[]; grandTotalMinor: number }>(`/api/analytics/categories?month=${month}`);

  const statsById = new Map((stats.data?.items ?? []).map((s) => [s.categoryId, s]));
  const active = (cats.data?.items ?? []).filter((c) => c.isActive);
  const disabled = (cats.data?.items ?? []).filter((c) => !c.isActive);

  async function refresh() {
    await mutate((k) => typeof k === 'string' && k.startsWith('/api/'), undefined, { revalidate: true });
  }

  /** Moves a category up/down and persists the whole order in one call. */
  async function move(index: number, delta: number) {
    const next = [...active];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    await api.post('/api/categories/reorder', { ids: next.map((c) => c.id) });
    await refresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold">Categories</h1>
          <p className="muted text-sm">What you spent on · {monthLabel(month)}</p>
        </div>
        <div className="flex items-center gap-2">
          <MonthPicker month={month} onChange={setMonth} />
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            + Category
          </button>
        </div>
      </div>

      <Card>
        {cats.isLoading ? (
          <ListSkeleton rows={6} />
        ) : active.length === 0 ? (
          <EmptyState icon="◈" title="No categories" hint="Add one to start tracking." />
        ) : (
          <>
            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {active.map((c, i) => {
                const stat = statsById.get(c.id);
                return (
                  <div key={c.id} className="py-3">
                    <div className="flex items-center gap-3">
                      <span
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
                        style={{ background: `${c.color}22` }}
                        aria-hidden
                      >
                        {c.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">
                          {c.name}
                          {c.kind === 'investment' && (
                            <span
                              className="ml-2 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded"
                              style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}
                            >
                              Investment
                            </span>
                          )}
                        </p>
                        <p className="muted text-xs">
                          {stat?.count ?? 0} {stat?.count === 1 ? 'transaction' : 'transactions'} this month
                        </p>
                      </div>
                      <span className="tabular font-semibold text-sm">{formatINR(stat?.totalMinor ?? 0)}</span>
                      <div className="flex flex-col shrink-0">
                        <button className="muted text-xs leading-none py-0.5" onClick={() => move(i, -1)} aria-label="Move up" disabled={i === 0}>
                          ▲
                        </button>
                        <button
                          className="muted text-xs leading-none py-0.5"
                          onClick={() => move(i, 1)}
                          aria-label="Move down"
                          disabled={i === active.length - 1}
                        >
                          ▼
                        </button>
                      </div>
                      <button className="muted px-1.5 text-lg leading-none shrink-0" onClick={() => setEditing(c)} aria-label={`Edit ${c.name}`}>
                        ⋯
                      </button>
                    </div>
                    {stat && stat.totalMinor > 0 && <ShareBar share={stat.share} color={c.color} />}
                  </div>
                );
              })}
            </div>

            {stats.data && (
              <div className="flex justify-between mt-4 pt-3 border-t text-sm font-semibold" style={{ borderColor: 'var(--border)' }}>
                <span>Total</span>
                <span className="tabular">{formatINR(stats.data.grandTotalMinor)}</span>
              </div>
            )}
          </>
        )}
      </Card>

      {disabled.length > 0 && (
        <Card>
          <SectionTitle>Disabled</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {disabled.map((c) => (
              <button key={c.id} className="chip" onClick={() => setEditing(c)}>
                {c.icon} {c.name}
              </button>
            ))}
          </div>
          <p className="muted text-xs mt-3">
            Disabled categories don&apos;t show when adding an expense, but their history stays intact.
          </p>
        </Card>
      )}

      <CategoryModal
        open={creating || !!editing}
        category={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onDone={async (msg) => {
          await refresh();
          toast(msg);
          setCreating(false);
          setEditing(null);
        }}
      />
    </div>
  );
}

function CategoryModal({
  open,
  category,
  onClose,
  onDone,
}: {
  open: boolean;
  category: Category | null;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('💸');
  const [color, setColor] = useState(PALETTE[0]);
  const [kind, setKind] = useState('expense');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState('');

  const identity = category?.id ?? 'new';
  if (key !== identity && open) {
    setKey(identity);
    setName(category?.name ?? '');
    setIcon(category?.icon ?? '💸');
    setColor(category?.color ?? PALETTE[0]);
    setKind(category?.kind ?? 'expense');
    setError(null);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const payload = { name, icon, color, kind };
      if (category) {
        await api.patch(`/api/categories/${category.id}`, payload);
        onDone('Category updated');
      } else {
        await api.post('/api/categories', payload);
        onDone('Category added');
      }
    } catch (err) {
      setError(err instanceof RequestError ? err.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={category ? `Edit ${category.name}` : 'Add category'}>
      <div className="space-y-4">
        <div>
          <label className="label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>

        <div>
          <label className="label">Icon</label>
          <div className="flex flex-wrap gap-2">
            {ICONS.map((i) => (
              <button key={i} className="chip text-lg px-3" data-selected={icon === i} onClick={() => setIcon(i)}>
                {i}
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
                onClick={() => setColor(c)}
                aria-label={`Colour ${c}`}
                className="w-8 h-8 rounded-full border-2"
                style={{ background: c, borderColor: color === c ? 'var(--text)' : 'transparent' }}
              />
            ))}
          </div>
        </div>

        <div>
          <label className="label">Type</label>
          <div className="flex gap-2">
            <button className="chip" data-selected={kind === 'expense'} onClick={() => setKind('expense')}>
              Consumption
            </button>
            <button className="chip" data-selected={kind === 'investment'} onClick={() => setKind('investment')}>
              Investment
            </button>
          </div>
          <p className="muted text-xs mt-2">
            Investment still counts in your totals — it&apos;s just labelled so you can tell it apart from consumption.
          </p>
        </div>

        {error && (
          <p className="text-sm" style={{ color: 'var(--danger)' }}>
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-2 justify-end pt-1">
          {category && (
            <button
              className="btn btn-ghost"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await api.patch(`/api/categories/${category.id}`, { isActive: !category.isActive });
                onDone(category.isActive ? 'Category disabled' : 'Category enabled');
                setBusy(false);
              }}
            >
              {category.isActive ? 'Disable' : 'Enable'}
            </button>
          )}
          <button className="btn btn-primary" onClick={save} disabled={busy || !name.trim()}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
