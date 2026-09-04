'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { api, RequestError } from '@/lib/client';
import { currentMonth, dayLabel, monthLabel, shiftMonth } from '@/lib/dates';
import { formatINR } from '@/lib/money';
import type { Category, CategoryStat } from '@/lib/types';
import { Card, EmptyState, ListSkeleton, Modal, Money, PageHeader, SectionHead } from '@/components/ui';
import { ShareBar } from '@/components/graph';
import { useShell } from '@/components/app-shell';
import { useInspector } from '@/components/inspector';
import { CategoryIcon, Icon, ICON_KEYS, resolveIcon } from '@/components/icons';
import { PALETTE } from '@/lib/defaults';
import { IncomeSourceModal } from '@/components/income-source-modal';

type CategoryRow = Category & {
  monthlyBudgetMinor: number | null;
  targetMinor: number | null;
  targetDate: string | null;
};

type ThemeChoice = 'system' | 'light' | 'dark';

/**
 * Configuration, not a daily destination — which is why categories live here
 * rather than in the nav. The screen is a stack of labelled sections with one
 * card each, and every card is a full-width tap target list on a phone.
 */
export default function SettingsPage() {
  const { toast } = useShell();
  const { openCategory } = useInspector();
  const { mutate } = useSWRConfig();
  const [theme, setTheme] = useState<ThemeChoice>('system');
  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const [creating, setCreating] = useState<null | 'expense' | 'income' | 'investment'>(null);

  const me = useSWR<{ user: { name: string; email: string; currency: string } }>('/api/auth/me');
  const incomeThis = useSWR<{ items: CategoryStat[]; grandTotalMinor: number }>(
    `/api/analytics/categories?month=${currentMonth()}&include=income`,
  );
  const incomeLast = useSWR<{ grandTotalMinor: number }>(
    `/api/analytics/categories?month=${shiftMonth(currentMonth(), -1)}&include=income`,
  );
  const cats = useSWR<{ items: CategoryRow[] }>('/api/categories?includeInactive=true');
  const stats = useSWR<{ items: CategoryStat[] }>(`/api/analytics/categories?month=${currentMonth()}`);

  const spendById = new Map((stats.data?.items ?? []).map((s) => [s.categoryId, s.totalMinor]));
  const all = cats.data?.items ?? [];
  const active = all.filter((c) => c.isActive && c.kind !== 'income');
  const incomeCats = all.filter((c) => c.isActive && c.kind === 'income');
  const disabled = all.filter((c) => !c.isActive);

  // Only categories that actually carry a budget belong in the budget summary.
  const budgeted = active.filter((c) => c.monthlyBudgetMinor);
  const budgetTotal = budgeted.reduce((s, c) => s + (c.monthlyBudgetMinor ?? 0), 0);
  const budgetSpent = budgeted.reduce((s, c) => s + (spendById.get(c.id) ?? 0), 0);

  useEffect(() => {
    try {
      setTheme((localStorage.getItem('mf-theme') as ThemeChoice) ?? 'system');
    } catch {
      /* storage unavailable */
    }
  }, []);

  /*
   * "Set up income" on the dashboard sends people here, and landing on a
   * settings page with no obvious income control is the same dead end it was
   * trying to fix. The link carries ?add=income and opens the sheet ready.
   * Read from the URL directly rather than useSearchParams, which would need
   * this whole screen wrapped in a Suspense boundary for one query string.
   */
  useEffect(() => {
    const add = new URLSearchParams(window.location.search).get('add');
    if (add === 'income' || add === 'investment' || add === 'expense') {
      setCreating(add);
      // Consume it, so a refresh or a back-tap does not reopen the sheet.
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  function applyTheme(next: ThemeChoice) {
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
    <div className="space-y-7">
      <PageHeader eyebrow="Settings" title="Preferences" sub="Categories, budgets, appearance and data." />

      {/* ---------- Income ---------- */}
      <section>
        <SectionHead
          label="Income"
          action={
            <button className="tag" onClick={() => setCreating('income')}>
              + Source
            </button>
          }
        />
        {incomeCats.length ? (
          <div className="card overflow-clip">
            <div
              className="flex items-baseline justify-between gap-3 px-3.5 sm:px-4 py-3 border-b"
              style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
            >
              <span className="label mb-0">{monthLabel(currentMonth()).split(' ')[0]} so far</span>
              <span className="flex items-baseline gap-3">
                <Money
                  minor={incomeThis.data?.grandTotalMinor ?? 0}
                  className="text-[15px] font-semibold"
                  style={{ color: 'var(--credit)' }}
                />
                <span className="micro">
                  {monthLabel(shiftMonth(currentMonth(), -1)).split(' ')[0]}{' '}
                  {formatINR(incomeLast.data?.grandTotalMinor ?? 0)}
                </span>
              </span>
            </div>

            <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {incomeCats.map((c) => {
                const got = incomeThis.data?.items.find((i) => i.categoryId === c.id)?.totalMinor ?? 0;
                return (
                  <li
                    key={c.id}
                    className="row flex items-center gap-3 px-3.5 sm:px-4 py-3"
                    onClick={() => setEditing(c)}
                  >
                    <CategoryIcon icon={c.icon} color={c.color} size={34} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-semibold truncate">{c.name}</p>
                      <p className="muted text-[11px] mt-0.5">
                        {got > 0 ? 'received this month' : 'nothing yet this month'}
                      </p>
                    </div>
                    <Money
                      minor={got}
                      className="num text-[13px] font-semibold shrink-0"
                      style={got > 0 ? { color: 'var(--credit)' } : undefined}
                    />
                  </li>
                );
              })}
            </ul>

            <p className="muted text-[12px] leading-relaxed px-3.5 sm:px-4 py-3 border-t" style={{ borderColor: 'var(--border)' }}>
              Pay is logged like anything else — <strong>Add transaction → Income</strong> — so a month that pays
              differently just gets a different figure. Until this month&rsquo;s lands, the plan works from the median
              of the last three.
            </p>
          </div>
        ) : (
          <Card>
            <EmptyState
              title="No income recorded"
              hint="Add a source — Salary, Freelance, whatever pays you — then log each payment under it. Without one the app can only say what leaves, never what is safe to spend."
              action={
                <button className="btn btn-primary" onClick={() => setCreating('income')}>
                  Add an income source
                </button>
              }
            />
          </Card>
        )}
      </section>

      {/* ---------- Budgets ---------- */}
      {budgetTotal > 0 && (
        <section>
          <SectionHead label={`Budget · ${monthLabel(currentMonth()).split(' ')[0]}`} />
          <Card>
            <div className="flex items-baseline justify-between gap-3 mb-2.5">
              <Money minor={budgetSpent} className="text-2xl font-semibold" />
              <span className="num text-[13px] muted">of {formatINR(budgetTotal)}</span>
            </div>
            <ShareBar
              share={budgetSpent / budgetTotal}
              color={budgetSpent > budgetTotal ? 'var(--rule-red)' : 'var(--brass)'}
              height={6}
            />
            <p className="muted text-[12px] mt-2.5">
              Across {budgeted.length} budgeted {budgeted.length === 1 ? 'category' : 'categories'}
              {budgetSpent > budgetTotal
                ? ` — over by ${formatINR(budgetSpent - budgetTotal)}.`
                : ` — ${formatINR(budgetTotal - budgetSpent)} left.`}
            </p>
          </Card>
        </section>
      )}

      {/* ---------- Categories ---------- */}
      <section>
        <SectionHead
          label="Categories"
          action={
            <button className="tag" onClick={() => setCreating('expense')}>
              + New
            </button>
          }
        />
        <div className="card overflow-hidden">
          {!cats.data ? (
            <div className="p-4">
              <ListSkeleton rows={6} />
            </div>
          ) : active.length === 0 ? (
            <EmptyState title="No categories" hint="Add one to start tracking." />
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {active.map((c, i) => {
                const spent = spendById.get(c.id) ?? 0;
                // Only spending categories carry a budget bar — the analytics
                // this reads deliberately exclude income and investment.
                const budget = c.kind === 'expense' ? c.monthlyBudgetMinor : null;
                const over = budget ? spent > budget : false;
                return (
                  <li
                    key={c.id}
                    className="row flex items-center gap-3 px-3.5 sm:px-4 py-3"
                    onClick={() => openCategory(c.id)}
                  >
                    <CategoryIcon icon={c.icon} color={c.color} size={34} />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <p className="text-[13.5px] font-semibold truncate flex-1">{c.name}</p>
                        {budget ? (
                          <span className="num text-[12px] shrink-0" style={{ color: over ? 'var(--rule-red)' : 'var(--text-muted)' }}>
                            {formatINR(spent)} / {formatINR(budget)}
                          </span>
                        ) : (
                          <span className="num text-[12px] muted shrink-0">{formatINR(spent)}</span>
                        )}
                      </div>
                      {budget ? (
                        <div className="mt-1.5 max-w-sm">
                          <ShareBar share={spent / budget} color={over ? 'var(--rule-red)' : c.color} height={3} />
                        </div>
                      ) : (
                        <p className="muted text-[11px] mt-0.5">
                          {c.kind === 'income'
                            ? 'Income · kept out of spending'
                            : c.targetMinor
                              ? `Goal · ${formatINR(c.targetMinor)}${c.targetDate ? ` by ${dayLabel(c.targetDate)}` : ''}`
                              : c.kind === 'investment'
                                ? 'Investment · kept out of spending'
                                : 'No monthly budget'}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <div className="hidden sm:flex flex-col">
                        <button
                          className="muted text-[10px] leading-none py-1 px-1 disabled:opacity-30"
                          onClick={() => move(i, -1)}
                          aria-label={`Move ${c.name} up`}
                          disabled={i === 0}
                        >
                          ▲
                        </button>
                        <button
                          className="muted text-[10px] leading-none py-1 px-1 disabled:opacity-30"
                          onClick={() => move(i, 1)}
                          aria-label={`Move ${c.name} down`}
                          disabled={i === active.length - 1}
                        >
                          ▼
                        </button>
                      </div>
                      <button className="tag" onClick={() => setEditing(c)}>
                        Edit
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {disabled.length > 0 && (
          <p className="muted text-[12px] mt-2.5 leading-relaxed">
            {disabled.length} disabled {disabled.length === 1 ? 'category' : 'categories'} —{' '}
            {disabled.map((c) => c.name).join(', ')}. Their history still counts.
          </p>
        )}
      </section>

      {/* ---------- Account ---------- */}
      <section>
        <SectionHead label="Account" />
        <Card>
          <dl className="divide-y" style={{ borderColor: 'var(--border)' }}>
            <Field label="Name" value={me.data?.user.name} />
            <Field label="Email" value={me.data?.user.email} />
            <Field label="Currency" value={`₹ ${me.data?.user.currency ?? 'INR'}`} />
          </dl>
        </Card>
      </section>

      {/* ---------- Data ---------- */}
      <section>
        <SectionHead label="Data" />
        <Card>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <Link href="/settings/import" className="btn btn-ghost justify-start">
              Import a sheet
            </Link>
            <button
              className="btn btn-ghost justify-start"
              onClick={() => {
                window.location.href = '/api/export';
                toast('Building your workbook…');
              }}
            >
              Export to a spreadsheet
            </button>
          </div>
          <p className="muted text-[12px] mt-3 leading-relaxed">
            The export is a workbook, not a list: a tab per month laid out as day × category with its own totals,
            a PEERS tab for the lending ledger, and a TRANSACTIONS tab holding the flat rows with notes and people
            intact — which is what makes the file re-importable without losing anything. Opens in Google Sheets and
            Excel.{' '}
            <button
              className="underline"
              style={{ color: 'var(--accent)' }}
              onClick={() => {
                window.location.href = '/api/export?format=csv';
                toast('Preparing the CSV…');
              }}
            >
              Plain CSV instead
            </button>
          </p>
        </Card>
      </section>

      {/* ---------- Appearance ---------- */}
      <section>
        <SectionHead label="Appearance" />
        <Card>
          <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
            {THEMES.map((t) => (
              <button
                key={t.value}
                onClick={() => applyTheme(t.value)}
                aria-pressed={theme === t.value}
                className="text-left rounded-lg p-2 transition-colors"
                style={{
                  border: `1px solid ${theme === t.value ? 'var(--accent)' : 'var(--border)'}`,
                  background: theme === t.value ? 'var(--accent-soft)' : 'transparent',
                  transitionDuration: '150ms',
                }}
              >
                <ThemeSwatch kind={t.value} />
                <span
                  className="block text-[12.5px] font-semibold mt-2"
                  style={{ color: theme === t.value ? 'var(--accent)' : 'var(--text)' }}
                >
                  {t.label}
                </span>
                <span className="muted text-[11px] block leading-snug mt-0.5">{t.hint}</span>
              </button>
            ))}
          </div>
        </Card>
      </section>

      {/* ---------- Session ---------- */}
      <section>
        <SectionHead label="Session" />
        <Card>
          <button
            className="btn btn-danger w-full sm:w-auto"
            onClick={async () => {
              await api.post('/api/auth/logout');
              window.location.href = '/login';
            }}
          >
            Sign out
          </button>
        </Card>
      </section>

      <IncomeSourceModal
        open={creating === 'income'}
        onClose={() => setCreating(null)}
        onDone={async (msg) => {
          await refresh();
          toast(msg);
          setCreating(null);
        }}
      />

      <CategoryModal
        open={(!!creating && creating !== 'income') || !!editing}
        category={editing}
        defaultKind={creating === 'investment' ? 'investment' : 'expense'}
        onClose={() => {
          setCreating(null);
          setEditing(null);
        }}
        onDone={async (msg) => {
          await refresh();
          toast(msg);
          setCreating(null);
          setEditing(null);
        }}
      />
    </div>
  );
}

const THEMES: { value: ThemeChoice; label: string; hint: string }[] = [
  { value: 'system', label: 'System', hint: 'Follows your device' },
  { value: 'light', label: 'Paper', hint: 'Cream and forest' },
  { value: 'dark', label: 'Ink', hint: 'Near-black and gold' },
];

/**
 * A miniature of the theme rather than a word for it. The paper and ink
 * swatches are painted from the raw palette vars directly, so they show the
 * real thing even while the opposite theme is active.
 */
function ThemeSwatch({ kind }: { kind: ThemeChoice }) {
  const paper = { bg: 'var(--paper-0)', card: 'var(--paper-1)', ink: 'var(--forest)', line: 'var(--paper-line)' };
  const ink = { bg: 'var(--ink-0)', card: 'var(--ink-1)', ink: 'var(--gold)', line: 'var(--ink-line)' };

  if (kind === 'system') {
    return (
      <span className="flex h-12 rounded overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        <SwatchHalf tone={paper} />
        <SwatchHalf tone={ink} />
      </span>
    );
  }
  return (
    <span className="flex h-12 rounded overflow-hidden" style={{ border: '1px solid var(--border)' }}>
      <SwatchHalf tone={kind === 'light' ? paper : ink} full />
    </span>
  );
}

function SwatchHalf({
  tone,
  full = false,
}: {
  tone: { bg: string; card: string; ink: string; line: string };
  full?: boolean;
}) {
  return (
    <span className={`${full ? 'w-full' : 'w-1/2'} p-1.5 flex flex-col justify-end gap-1`} style={{ background: tone.bg }}>
      <span className="h-1 rounded-full" style={{ background: tone.ink, width: '55%' }} />
      <span className="h-1 rounded-full" style={{ background: tone.line, width: '85%' }} />
      <span className="h-1 rounded-full" style={{ background: tone.line, width: '70%' }} />
    </span>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
      <dt className="muted text-[13px]">{label}</dt>
      <dd className="text-[13px] font-medium truncate">{value ?? '—'}</dd>
    </div>
  );
}

function CategoryModal({
  open,
  category,
  defaultKind = 'expense',
  onClose,
  onDone,
}: {
  open: boolean;
  category: CategoryRow | null;
  /** What a NEW category starts as — an income source opens ready to be one. */
  defaultKind?: 'expense' | 'income' | 'investment';
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('cash');
  const [color, setColor] = useState(PALETTE[0]);
  const [kind, setKind] = useState('expense');
  const [budget, setBudget] = useState('');
  const [target, setTarget] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState('');

  const identity = category?.id ?? `new-${defaultKind}`;
  if (key !== identity && open) {
    setKey(identity);
    setName(category?.name ?? '');
    setIcon(resolveIcon(category?.icon));
    setColor(category?.color ?? PALETTE[0]);
    setKind(category?.kind ?? defaultKind);
    setBudget(category?.monthlyBudgetMinor ? String(category.monthlyBudgetMinor / 100) : '');
    setTarget(category?.targetMinor ? String(category.targetMinor / 100) : '');
    setTargetDate(category?.targetDate ?? '');
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
      // A target only means anything on money being set aside.
      target: kind === 'investment' && target.trim() !== '' ? Math.round(Number(target) * 100) / 100 : null,
      targetDate: kind === 'investment' && targetDate ? targetDate : null,
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
    <Modal
      open={open}
      onClose={onClose}
      title={category ? `Edit ${category.name}` : defaultKind === 'income' ? 'New income source' : 'New category'}
    >
      <div className="space-y-4">
        <div>
          <label className="label" htmlFor="cname">
            Name
          </label>
          <input id="cname" className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>

        <div>
          <span className="label">Type</span>
          <div className="flex flex-wrap gap-2">
            <button className="chip" data-selected={kind === 'expense'} onClick={() => setKind('expense')}>
              Spending
            </button>
            <button className="chip" data-selected={kind === 'investment'} onClick={() => setKind('investment')}>
              Investment
            </button>
            <button className="chip" data-selected={kind === 'income'} onClick={() => setKind('income')}>
              Income
            </button>
          </div>
          <p className="muted text-[12px] mt-2 leading-relaxed">
            {kind === 'income'
              ? 'Money arriving. Kept out of every spending figure, and what makes safe-to-spend and your savings rate possible.'
              : kind === 'investment'
                ? 'Money set aside rather than gone. Kept out of spending, and shown on the Investments screen.'
                : 'Ordinary spending. Counts towards the month.'}
          </p>
        </div>

        {/*
          A target is what turns an investment category into a fund. It lives
          here rather than on a screen of its own because a fund IS a category
          — giving one a number is the whole act of creating a goal.
        */}
        {kind === 'investment' && (
          <div className="well px-3.5 py-3.5">
            <p className="label mb-1">Make it a goal</p>
            <p className="muted text-[12px] mb-3 leading-relaxed">
              Give it a target and everything logged here becomes progress towards it — on the dashboard, with the
              monthly pace worked out for you.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="ctarget">
                  Target
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 muted">₹</span>
                  <input
                    id="ctarget"
                    className="input num"
                    inputMode="decimal"
                    value={target}
                    onChange={(e) => setTarget(e.target.value.replace(/[^0-9.]/g, ''))}
                    placeholder="80,000"
                    style={{ paddingLeft: '1.9rem' }}
                  />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="ctargetdate">
                  By when
                </label>
                <input
                  id="ctargetdate"
                  type="date"
                  className="input"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  disabled={!target.trim()}
                />
              </div>
            </div>
            {/* A target with no date is a wish. The date is what turns it into
                "₹10,286 a month", which is the only part you can act on. */}
            <p className="muted text-[11px] mt-2.5 leading-relaxed">
              {!target.trim()
                ? 'A target turns this category into a goal.'
                : targetDate
                  ? 'Pace and progress will show on your dashboard.'
                  : 'Add a date and the app works out what it needs each month. Without one you get progress, but no pace.'}
            </p>
          </div>
        )}

        {/* A budget caps spending. On money arriving, or money being set
            aside, there is nothing to cap — asking was just noise. */}
        {kind === 'expense' && (
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
            <p className="muted text-xs mt-1.5">
              Draws a pacing bar against this category so you can see it filling up.
            </p>
          </div>
        )}

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
