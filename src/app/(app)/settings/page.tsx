'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { api, RequestError } from '@/lib/client';
import { currentMonth } from '@/lib/dates';
import { formatINR } from '@/lib/money';
import type { Category, CategoryStat } from '@/lib/types';
import { Card, EmptyState, ListSkeleton, Modal, SectionHead } from '@/components/ui';
import { useShell } from '@/components/app-shell';
import { useInspector } from '@/components/inspector';
import { CategoryIcon, Icon, ICON_KEYS, resolveIcon } from '@/components/icons';
import { PALETTE } from '@/lib/defaults';

type CategoryRow = Category & { monthlyBudgetMinor: number | null };

/** Categories moved in here — they are configuration, not a daily destination. */
export default function SettingsPage() {
  const { toast } = useShell();
  const { openCategory } = useInspector();
  const { mutate } = useSWRConfig();
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>('system');
  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const [creating, setCreating] = useState(false);

  const me = useSWR<{ user: { name: string; email: string; currency: string } }>('/api/auth/me');
  const cats = useSWR<{ items: CategoryRow[] }>('/api/categories?includeInactive=true');
  const stats = useSWR<{ items: CategoryStat[] }>(`/api/analytics/categories?month=${currentMonth()}`);

  const spendById = new Map((stats.data?.items ?? []).map((s) => [s.categoryId, s.totalMinor]));
  const active = (cats.data?.items ?? []).filter((c) => c.isActive);
  const disabled = (cats.data?.items ?? []).filter((c) => !c.isActive);

  useEffect(() => {
    try {
      setTheme((localStorage.getItem('mf-theme') as 'light' | 'dark') ?? 'system');
    } catch {
      /* storage unavailable */
    }
  }, []);

  function applyTheme(next: 'system' | 'light' | 'dark') {
    setTheme(next);
    try {
      if (next === 'system') {
        localStorage.removeItem('mf-theme');
        document.documentElement.removeAttribute('data-theme');
      } else {
        localStorage.setItem('mf-theme', next);
        document.documentElement.setAttribute('data-theme', next);
      }
    } catch {
      /* ignore */
    }
  }

  async function refresh() {
    await mutate((k) => typeof k === 'string' && k.startsWith('/api/'), undefined, { revalidate: true });
  }

  async function move(index: number, delta: number) {
    const next = [...active];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    await api.post('/api/categories/reorder', { ids: next.map((c) => c.id) });
    await refresh();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold">Settings</h1>
        <p className="muted text-sm">Account, categories and data</p>
      </div>

      <div>
        <SectionHead
          label="Categories & budgets"
          action={
            <button className="tag" onClick={() => setCreating(true)}>
              + New
            </button>
          }
        />
        <Card className="!p-0 overflow-hidden">
          {cats.isLoading ? (
            <div className="p-4">
              <ListSkeleton rows={6} />
            </div>
          ) : active.length === 0 ? (
            <EmptyState icon="◈" title="No categories" hint="Add one to start tracking." />
          ) : (
            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {active.map((c, i) => {
                const spent = spendById.get(c.id) ?? 0;
                const budget = c.monthlyBudgetMinor;
                const pct = budget ? Math.min((spent / budget) * 100, 100) : 0;
                return (
                  <div key={c.id} className="row flex items-center gap-3 px-4 py-3" onClick={() => openCategory(c.id)}>
                    <CategoryIcon icon={c.icon} color={c.color} size={34} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {c.name}
                        {c.kind === 'investment' && <span className="micro ml-2">Investment</span>}
                      </p>
                      {budget ? (
                        <>
                          <div className="h-1 rounded-full overflow-hidden mt-1.5 max-w-[13rem]" style={{ background: 'var(--surface-2)' }}>
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${pct}%`, background: spent > budget ? 'var(--rule-red)' : c.color }}
                            />
                          </div>
                          <p className="muted text-xs mt-1 num">
                            {formatINR(spent)} of {formatINR(budget)}
                          </p>
                        </>
                      ) : (
                        <p className="muted text-xs mt-0.5">No monthly budget</p>
                      )}
                    </div>

                    <div className="flex flex-col shrink-0" onClick={(e) => e.stopPropagation()}>
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
                    <button
                      className="tag shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditing(c);
                      }}
                    >
                      Edit
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {disabled.length > 0 && (
          <p className="muted text-xs mt-2">
            {disabled.length} disabled {disabled.length === 1 ? 'category' : 'categories'} —{' '}
            {disabled.map((c) => c.name).join(', ')}. Their history still counts.
          </p>
        )}
      </div>

      <div>
        <SectionHead label="Account" />
        <Card>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="muted">Name</dt>
              <dd className="font-medium truncate">{me.data?.user.name ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="muted">Email</dt>
              <dd className="font-medium truncate">{me.data?.user.email ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="muted">Currency</dt>
              <dd className="font-medium">₹ {me.data?.user.currency ?? 'INR'}</dd>
            </div>
          </dl>
        </Card>
      </div>

      <div>
        <SectionHead label="Appearance" />
        <Card>
          <div className="flex gap-2">
            {(['system', 'light', 'dark'] as const).map((t) => (
              <button key={t} className="chip capitalize" data-selected={theme === t} onClick={() => applyTheme(t)}>
                {t}
              </button>
            ))}
          </div>
        </Card>
      </div>

      <div>
        <SectionHead label="Data" />
        <Card>
          <div className="grid sm:grid-cols-2 gap-3">
            <Link href="/settings/import" className="btn btn-ghost justify-start">
              ↥ Import from Google Sheet
            </Link>
            <button
              className="btn btn-ghost justify-start"
              onClick={() => {
                window.location.href = '/api/export';
                toast('Preparing your export…');
              }}
            >
              ↧ Export all expenses (CSV)
            </button>
          </div>
          <p className="muted text-xs mt-3">One row per real transaction — date, amount, category, people and note.</p>
        </Card>
      </div>

      <div>
        <SectionHead label="Session" />
        <Card>
          <button
            className="btn btn-danger"
            onClick={async () => {
              await api.post('/api/auth/logout');
              window.location.href = '/login';
            }}
          >
            Sign out
          </button>
        </Card>
      </div>

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
  category: CategoryRow | null;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('cash');
  const [color, setColor] = useState(PALETTE[0]);
  const [kind, setKind] = useState('expense');
  const [budget, setBudget] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState('');

  const identity = category?.id ?? 'new';
  if (key !== identity && open) {
    setKey(identity);
    setName(category?.name ?? '');
    setIcon(resolveIcon(category?.icon));
    setColor(category?.color ?? PALETTE[0]);
    setKind(category?.kind ?? 'expense');
    setBudget(category?.monthlyBudgetMinor ? String(category.monthlyBudgetMinor / 100) : '');
    setError(null);
  }

  async function save() {
    setBusy(true);
    setError(null);
    const payload = {
      name,
      icon,
      color,
      kind,
      monthlyBudget: budget.trim() === '' ? null : Math.round(Number(budget) * 100) / 100,
    };
    try {
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
    <Modal open={open} onClose={onClose} title={category ? `Edit ${category.name}` : 'New category'}>
      <div className="space-y-4">
        <div>
          <label className="label" htmlFor="cname">
            Name
          </label>
          <input id="cname" className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>

        <div>
          <label className="label" htmlFor="cbudget">
            Monthly budget <span className="normal-case font-normal">— optional</span>
          </label>
          <input
            id="cbudget"
            className="input num"
            inputMode="decimal"
            value={budget}
            onChange={(e) => setBudget(e.target.value.replace(/[^0-9.]/g, ''))}
            placeholder="No limit"
          />
          <p className="muted text-xs mt-1.5">Sets the pacing bar on the category inspector.</p>
        </div>

        <div>
          <label className="label">Icon</label>
          <div className="flex flex-wrap gap-2">
            {ICON_KEYS.map((k) => (
              <button
                key={k}
                className="chip px-2.5"
                data-selected={icon === k}
                onClick={() => setIcon(k)}
                aria-label={k}
                style={icon === k ? undefined : { color }}
              >
                <Icon name={k} size={18} />
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
