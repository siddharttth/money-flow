'use client';

import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import useSWR, { useSWRConfig } from 'swr';
import { api, RequestError } from '@/lib/client';
import { currentMonth, monthLabel } from '@/lib/dates';
import { formatINR } from '@/lib/money';
import type { Person, PersonStat } from '@/lib/types';
import {
  Card,
  EmptyState,
  ErrorState,
  HeroFigure,
  ListSkeleton,
  Modal,
  Money,
  PageHeader,
  Segmented,
} from '@/components/ui';
import { MonthPicker } from '@/components/month-picker';
import { ShareBar } from '@/components/graph';
import { LedgerForm } from '@/components/ledger-form';
import { useShell } from '@/components/app-shell';
import { useInspector } from '@/components/inspector';
import { NavIcon, PersonMark } from '@/components/icons';
import { PALETTE } from '@/lib/defaults';
import { Badge, MetricCard } from '@/components/plan-cards';

/**
 * People and Peers were two screens for one entity — a contact you spend with
 * and a contact you lend to are the same person. This hub merges them: the
 * month's spending association and the running balance sit on one row, and the
 * row opens one inspector.
 *
 * The two figures are deliberately never added. Spend is "money that left, and
 * this person was there"; balance is "money that is owed". Different things.
 */

type PeerSummary = {
  balances: { personId: string; name: string; color: string; balanceMinor: number; entryCount: number }[];
  owedToMeMinor: number;
  owedByMeMinor: number;
  netMinor: number;
};

type Filter = 'all' | 'debt' | 'spend';

export default function PeoplePage() {
  return (
    <Suspense
      fallback={
        <Card>
          <ListSkeleton rows={6} />
        </Card>
      }
    >
      <PeopleHub />
    </Suspense>
  );
}

function PeopleHub() {
  const params = useSearchParams();
  const { toast } = useShell();
  const { openPerson } = useInspector();
  const { mutate } = useSWRConfig();

  const [month, setMonth] = useState(currentMonth());
  const [filter, setFilter] = useState<Filter>('all');
  const [ledgerFor, setLedgerFor] = useState<null | {
    direction: 'out' | 'in';
    personId?: string;
    /** Settling carries the outstanding balance in, and different wording. */
    settleMinor?: number;
    name?: string;
  }>(params.get('settle') ? { direction: 'in', personId: params.get('settle')!, settleMinor: 0 } : null);
  const [addingPerson, setAddingPerson] = useState(false);

  const people = useSWR<{ items: Person[] }>('/api/people');
  const stats = useSWR<{ people: PersonStat[]; grandTotalMinor: number }>(`/api/analytics/people?month=${month}`);
  const peers = useSWR<PeerSummary>('/api/ledger');

  const rows = useMemo(() => {
    const spendById = new Map((stats.data?.people ?? []).map((s) => [s.personId, s]));
    const balById = new Map((peers.data?.balances ?? []).map((b) => [b.personId, b]));
    const all = (people.data?.items ?? []).map((p) => ({
      person: p,
      spendMinor: spendById.get(p.id)?.totalMinor ?? 0,
      count: spendById.get(p.id)?.count ?? 0,
      balanceMinor: balById.get(p.id)?.balanceMinor ?? 0,
    }));
    const filtered =
      filter === 'debt'
        ? all.filter((r) => r.balanceMinor !== 0)
        : filter === 'spend'
          ? all.filter((r) => r.spendMinor > 0)
          : all;
    return filtered.sort((a, b) =>
      filter === 'debt' ? Math.abs(b.balanceMinor) - Math.abs(a.balanceMinor) : b.spendMinor - a.spendMinor,
    );
  }, [people.data, stats.data, peers.data, filter]);

  const maxSpend = Math.max(1, ...rows.map((r) => r.spendMinor));

  async function refresh() {
    await mutate((k) => typeof k === 'string' && k.startsWith('/api/'), undefined, { revalidate: true });
  }

  if (people.error) return <ErrorState message={people.error.message} onRetry={() => people.mutate()} />;

  const net = peers.data?.netMinor ?? 0;
  const owedToMe = peers.data?.owedToMeMinor ?? 0;
  const owedByMe = peers.data?.owedByMeMinor ?? 0;
  /* Both sides of one bar, so the two are compared against the same scale. */
  const receivableShare = owedToMe + owedByMe > 0 ? owedToMe / (owedToMe + owedByMe) : 0;

  /* Counts run over EVERY person, not the filtered view — a tab reading
     "Owing (2)" has to keep saying 2 while you are looking at Spending. */
  const everyone = useMemo(() => {
    const spendById = new Map((stats.data?.people ?? []).map((x) => [x.personId, x]));
    const balById = new Map((peers.data?.balances ?? []).map((b) => [b.personId, b]));
    return (people.data?.items ?? []).map((p) => ({
      person: p,
      spendMinor: spendById.get(p.id)?.totalMinor ?? 0,
      count: spendById.get(p.id)?.count ?? 0,
      balanceMinor: balById.get(p.id)?.balanceMinor ?? 0,
    }));
  }, [people.data, stats.data, peers.data]);

  const counts = {
    all: everyone.length,
    debt: everyone.filter((r) => r.balanceMinor !== 0).length,
    spend: everyone.filter((r) => r.spendMinor > 0).length,
  };
  const openCount = counts.debt;
  const settledCount = everyone.length - openCount;

  const grandSpend = stats.data?.grandTotalMinor ?? 0;
  const topSharer = everyone
    .filter((r) => !r.person.isSelf && r.spendMinor > 0)
    .map((r) => ({ ...r, share: grandSpend > 0 ? r.spendMinor / grandSpend : 0 }))
    .sort((a, b) => b.spendMinor - a.spendMinor)[0];

  /** The balance most worth acting on — largest in absolute terms. */
  const biggestDebt = everyone
    .filter((r) => r.balanceMinor !== 0)
    .sort((a, b) => Math.abs(b.balanceMinor) - Math.abs(a.balanceMinor))[0];

  return (
    <div className="space-y-5">
      {/* Header. The subtitle names what the screen actually reconciles —
          "Who it was with" alone reads as a contact list. */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="micro">People &amp; ledger</span>
            <span className="w-1 h-1 rounded-full" style={{ background: 'var(--accent)' }} aria-hidden />
            <span className="micro" style={{ color: 'var(--accent)' }}>
              Peer settlements
            </span>
          </div>
          <h1 className="text-[28px] font-bold tracking-tight leading-tight">Who it was with</h1>
          <p className="muted text-[13px] mt-1 max-w-xl">
            Shared spending splits, lending exposure, and what is still owed either way.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start lg:self-auto">
          <MonthPicker month={month} onChange={setMonth} />
          <button className="btn btn-primary shrink-0" onClick={() => setAddingPerson(true)}>
            <NavIcon name="plus" size={15} />
            Add person
          </button>
        </div>
      </div>

      {/* NET EXPOSURE. One figure, the two sides it is made of, and the two
          actions that change it. */}
      <Card className={`!p-5 sm:!p-6 glow-card bloom-lg ${net < 0 ? 'bloom-danger' : ''}`}>
        <div className="relative grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_auto] gap-6 lg:gap-8 items-center">
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <span className="label mb-0">Net exposure</span>
              {net !== 0 && (
                <span className={`badge ${net > 0 ? 'badge-good' : 'badge-up'}`}>
                  {net > 0 ? 'Net receivable' : 'Net payable'}
                </span>
              )}
            </div>
            <p className="flex items-baseline gap-2 flex-wrap">
              <span
                className="num text-[2.4rem] sm:text-[2.6rem] font-bold leading-none tracking-tight"
                style={net === 0 ? undefined : { color: net > 0 ? 'var(--credit)' : 'var(--rule-red)' }}
              >
                {formatINR(Math.abs(net))}
              </span>
              <span className="muted text-[13px]">
                {net === 0 ? 'everything is settled' : net > 0 ? 'owed to you, on balance' : 'you owe, on balance'}
              </span>
            </p>
            <p className="muted text-[12px] mt-2 leading-relaxed">
              {openCount === 0
                ? 'No open obligations either way.'
                : `Across ${openCount} open ${openCount === 1 ? 'counterparty' : 'counterparties'}.`}
            </p>
          </div>

          {(owedToMe > 0 || owedByMe > 0) && (
            <div className="min-w-0">
              <div className="flex items-baseline justify-between gap-4 mb-2">
                <span>
                  <span className="micro block">They owe me</span>
                  <span className="num text-[19px] font-bold" style={{ color: 'var(--credit)' }}>
                    {formatINR(owedToMe)}
                  </span>
                </span>
                <span className="text-right">
                  <span className="micro block">I owe</span>
                  <span className="num text-[19px] font-bold" style={{ color: 'var(--rule-red)' }}>
                    {formatINR(owedByMe)}
                  </span>
                </span>
              </div>
              {/* One bar, both sides — two separate bars invited the reader to
                  compare their lengths against different scales. */}
              <div className="flex h-2 rounded-full overflow-hidden gap-px" style={{ background: 'var(--surface-2)' }}>
                <span
                  style={{
                    width: `${receivableShare * 100}%`,
                    background: 'linear-gradient(90deg, color-mix(in oklab, var(--credit) 60%, var(--surface-2)), var(--credit))',
                    boxShadow: '0 0 10px -2px color-mix(in oklab, var(--credit) 55%, transparent)',
                  }}
                />
                <span
                  style={{
                    width: `${(1 - receivableShare) * 100}%`,
                    background: 'linear-gradient(90deg, color-mix(in oklab, var(--rule-red) 60%, var(--surface-2)), var(--rule-red))',
                    boxShadow: '0 0 10px -2px color-mix(in oklab, var(--rule-red) 55%, transparent)',
                  }}
                />
              </div>
              <div className="flex items-baseline justify-between gap-3 mt-2 text-[11px] muted">
                <span>
                  <span className="num">{formatINR(owedToMe)}</span> receivable (
                  {Math.round(receivableShare * 100)}%)
                </span>
                <span>
                  <span className="num">{formatINR(owedByMe)}</span> payable (
                  {Math.round((1 - receivableShare) * 100)}%)
                </span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-1 gap-2 w-full lg:w-52 shrink-0">
            <button className="btn btn-ghost" onClick={() => setLedgerFor({ direction: 'out' })}>
              ↗ I lent money
            </button>
            <button className="btn btn-ghost" onClick={() => setLedgerFor({ direction: 'in' })}>
              ↙ I borrowed money
            </button>
          </div>
        </div>
      </Card>

      {/* Three facts about the ledger as a whole, each a card. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          bloom="quiet"
          icon={<NavIcon name="people" size={20} />}
          label="Active ledgers"
          badge={
            openCount > 0 ? (
              <Badge tone="up">{openCount} outstanding</Badge>
            ) : (
              <Badge tone="good">all clear</Badge>
            )
          }
          note={`${settledCount} fully balanced${openCount ? '' : ' — nothing outstanding'}`}
        >
          <span className="num text-[1.9rem] font-bold leading-none tracking-tight">
            {rows.length} {rows.length === 1 ? 'contact' : 'contacts'}
          </span>
        </MetricCard>

        <MetricCard
          bloom="credit"
          icon={<NavIcon name="analytics" size={20} />}
          label="Most shared with"
          badge={topSharer ? <Badge tone="neutral">{Math.round(topSharer.share * 100)}% of spend</Badge> : undefined}
          note={
            topSharer
              ? `${topSharer.person.name} · ${topSharer.count} ${topSharer.count === 1 ? 'transaction' : 'transactions'}`
              : 'Tag someone on an expense to see this.'
          }
        >
          <span className="num text-[1.9rem] font-bold leading-none tracking-tight">
            {formatINR(topSharer?.spendMinor ?? 0)}
          </span>
        </MetricCard>

        <MetricCard
          bloom={biggestDebt ? 'danger' : 'quiet'}
          icon={<NavIcon name="target" size={20} />}
          label="Next settlement"
          badge={biggestDebt ? <Badge tone="up">largest open</Badge> : <Badge tone="good">nothing due</Badge>}
          note={
            biggestDebt
              ? biggestDebt.balanceMinor < 0
                ? 'You owe this one — settle to clear it.'
                : 'Owed to you — a nudge is one tap away.'
              : 'Every balance is settled.'
          }
        >
          {biggestDebt ? (
            <span className="min-w-0">
              <span className="text-[15px] font-semibold truncate block">{biggestDebt.person.name}</span>
              <span
                className="num text-[1.5rem] font-bold leading-none"
                style={{ color: biggestDebt.balanceMinor < 0 ? 'var(--rule-red)' : 'var(--credit)' }}
              >
                {formatINR(Math.abs(biggestDebt.balanceMinor))}
              </span>
            </span>
          ) : (
            <span className="num text-[1.9rem] font-bold leading-none tracking-tight">—</span>
          )}
        </MetricCard>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: `All (${counts.all})` },
            { value: 'debt', label: `Owing (${counts.debt})` },
            { value: 'spend', label: `Spending (${counts.spend})` },
          ]}
        />
      </div>

      <div className="card overflow-hidden">
        {!people.data ? (
          <div className="p-4">
            <ListSkeleton rows={6} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            title={filter === 'all' ? 'No people yet' : 'Nothing matches this filter'}
            hint={
              filter === 'all'
                ? 'Add the people you spend with, and the ones who owe you, to see both on one row.'
                : 'Try “All”.'
            }
            action={
              filter === 'all' ? (
                <button className="btn btn-primary" onClick={() => setAddingPerson(true)}>
                  Add a person
                </button>
              ) : undefined
            }
          />
        ) : (
          <>
            {/* Column headings earn their place only once there is a table. */}
            <div
              className="hidden sm:grid grid-cols-[minmax(0,1fr)_11rem_8rem_6rem] gap-4 px-4 py-2.5 border-b"
              style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
            >
              <span className="micro">Contact</span>
              <span className="micro">{monthLabel(month).split(' ')[0]} spend</span>
              <span className="micro text-right">Balance</span>
              <span className="micro text-right">Action</span>
            </div>

            <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {rows.map(({ person, spendMinor, count, balanceMinor }) => {
                const owed = balanceMinor > 0;
                const owing = balanceMinor < 0;
                const state = owed ? 'credit' : owing ? 'debit' : undefined;
                const share = maxSpend > 0 ? spendMinor / maxSpend : 0;
                const shareOfMonth = grandSpend > 0 ? spendMinor / grandSpend : 0;

                return (
                  <li
                    key={person.id}
                    className="row px-3.5 sm:px-4 py-3"
                    onClick={() => openPerson(person.id)}
                    /* A row with an open balance is tinted, so the two that
                       need action are findable in a list of eight without
                       reading a single figure. */
                    style={
                      state
                        ? {
                            background: `color-mix(in oklab, ${
                              owed ? 'var(--credit)' : 'var(--rule-red)'
                            } 6%, transparent)`,
                          }
                        : undefined
                    }
                  >
                    <div className="sm:grid sm:grid-cols-[minmax(0,1fr)_11rem_8rem_6rem] sm:gap-4 sm:items-center">
                      <div className="flex items-center gap-3 min-w-0">
                        <PersonMark name={person.name} color={person.color} size={38} state={state} />
                        <div className="min-w-0 flex-1">
                          <p className="text-[13.5px] font-semibold truncate flex items-center gap-2">
                            <span className="truncate">{person.name}</span>
                            {person.isSelf && <span className="badge badge-neutral">you</span>}
                            {owing && <span className="badge badge-up">unsettled</span>}
                            {owed && <span className="badge badge-good">receivable</span>}
                          </p>
                          <p className="muted text-[11px] capitalize mt-0.5 truncate">
                            {person.relationshipType}
                            {count > 0 && ` · ${count} ${count === 1 ? 'transaction' : 'transactions'}`}
                          </p>
                        </div>

                        {/* On a phone the balance rides up next to the name. */}
                        <span className="sm:hidden shrink-0 text-right">
                          <Money minor={spendMinor} className="text-[13.5px] font-semibold block" />
                          {balanceMinor !== 0 && (
                            <span
                              className="num text-[11px] font-semibold"
                              style={{ color: owed ? 'var(--credit)' : 'var(--rule-red)' }}
                            >
                              {owed ? '+' : '−'}
                              {formatINR(Math.abs(balanceMinor))}
                            </span>
                          )}
                        </span>
                      </div>

                      <div className="hidden sm:block">
                        <div className="flex items-baseline justify-between gap-2">
                          <Money minor={spendMinor} className="text-[13px] font-semibold" />
                          <span className="num text-[11px] muted">
                            {shareOfMonth > 0 ? `${(shareOfMonth * 100).toFixed(1)}%` : '0%'}
                          </span>
                        </div>
                        <div className="mt-1.5">
                          <ShareBar
                            share={share}
                            color={person.isSelf ? 'var(--accent)' : 'var(--text-muted)'}
                            height={4}
                          />
                        </div>
                      </div>

                      <div className="hidden sm:block text-right">
                        {balanceMinor === 0 ? (
                          <span className="num text-[13px] muted">—</span>
                        ) : (
                          <>
                            <span
                              className="num text-[14px] font-semibold block"
                              style={{ color: owed ? 'var(--credit)' : 'var(--rule-red)' }}
                            >
                              {owed ? '+' : '−'}
                              {formatINR(Math.abs(balanceMinor))}
                            </span>
                            <span className="micro">{owed ? 'owes you' : 'you owe'}</span>
                          </>
                        )}
                      </div>

                      <div className="hidden sm:flex justify-end">
                        {balanceMinor !== 0 && !person.isSelf ? (
                          <button
                            className="btn-pill"
                            style={{
                              background: owed ? 'var(--brass)' : 'var(--rule-red)',
                              color: owed ? 'var(--on-brass)' : 'var(--bg)',
                              boxShadow: `0 0 12px -3px color-mix(in oklab, ${
                                owed ? 'var(--brass)' : 'var(--rule-red)'
                              } 55%, transparent)`,
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setLedgerFor({
                                direction: owed ? 'in' : 'out',
                                personId: person.id,
                                settleMinor: Math.abs(balanceMinor),
                                name: person.name,
                              });
                            }}
                          >
                            {/* Owed TO you is a nudge, not a payment — you
                                cannot settle someone else's debt for them. */}
                            {owed ? 'Remind ▷' : 'Settle'}
                          </button>
                        ) : (
                          <span aria-hidden className="micro">
                            —
                          </span>
                        )}
                      </div>
                    </div>

                    {balanceMinor !== 0 && !person.isSelf && (
                      <div className="sm:hidden mt-2.5 pl-[3.125rem]">
                        <button
                          className="tag"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLedgerFor({
                              direction: owed ? 'in' : 'out',
                              personId: person.id,
                              settleMinor: Math.abs(balanceMinor),
                              name: person.name,
                            });
                          }}
                        >
                          {owed ? 'Remind about' : 'Settle'} {formatINR(Math.abs(balanceMinor))}
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      <Card className="!p-4">
        <p className="muted text-[12px] leading-relaxed">
          <strong style={{ color: 'var(--text)' }}>Ledger isolation.</strong> Shared spend is your own share — an
          ₹800 dinner split two ways records ₹400 against each, so the column adds up to the month rather than
          multiplying it. Lending never mixes with it: a loan is money that is still yours.
        </p>
      </Card>

      <p className="hidden muted text-[12px] leading-relaxed max-w-2xl">
        Spend is this person's <em>share</em>. An ₹800 dinner with two people puts ₹400 against each, so the column
        adds up to the month rather than multiplying it — open anyone to see the working, row by row. Balance is
        separate money entirely: what is actually owed, either way.
      </p>

      <Modal
        open={!!ledgerFor}
        onClose={() => setLedgerFor(null)}
        title={
          ledgerFor?.settleMinor !== undefined
            ? `Settle up${ledgerFor.name ? ` with ${ledgerFor.name}` : ''}`
            : ledgerFor?.direction === 'in'
              ? 'I borrowed'
              : 'I lent'
        }
      >
        {ledgerFor && (
          <LedgerForm
            key={`${ledgerFor.direction}-${ledgerFor.personId ?? 'any'}`}
            defaultDirection={ledgerFor.direction}
            lockedPersonId={ledgerFor.personId}
            /* Settling means paying the balance off, so the balance is the
               amount — pre-filled, and still editable for a part payment. */
            defaultAmount={ledgerFor.settleMinor ? ledgerFor.settleMinor / 100 : undefined}
            intent={ledgerFor.settleMinor !== undefined ? 'settle' : 'record'}
            onSaved={() => {
              setLedgerFor(null);
              refresh();
              toast(ledgerFor.settleMinor !== undefined ? 'Settled up' : 'Ledger updated');
            }}
          />
        )}
      </Modal>

      <PersonModal
        open={addingPerson}
        onClose={() => setAddingPerson(false)}
        onDone={async (msg) => {
          await refresh();
          toast(msg);
          setAddingPerson(false);
        }}
      />
    </div>
  );
}

const RELATIONSHIPS = ['family', 'friend', 'other'] as const;

function PersonModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (m: string) => void }) {
  const [name, setName] = useState('');
  const [relationshipType, setRelationshipType] = useState<string>('friend');
  const [color, setColor] = useState(PALETTE[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/people', { name, relationshipType, color });
      setName('');
      onDone('Person added');
    } catch (err) {
      setError(err instanceof RequestError ? err.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add person">
      <div className="space-y-4">
        <div>
          <label className="label" htmlFor="pname">
            Name
          </label>
          <input id="pname" className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div>
          <span className="label">Relationship</span>
          <div className="flex flex-wrap gap-2">
            {RELATIONSHIPS.map((r) => (
              <button
                key={r}
                className="chip capitalize"
                data-selected={relationshipType === r}
                onClick={() => setRelationshipType(r)}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="label">Colour</span>
          <div className="flex items-center gap-3">
            <PersonMark name={name || '?'} color={color} size={40} />
            <div className="flex flex-wrap gap-2">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  aria-label={`Colour ${c}`}
                  className="w-7 h-7 rounded-full border-2"
                  style={{ background: c, borderColor: color === c ? 'var(--text)' : 'transparent' }}
                />
              ))}
            </div>
          </div>
        </div>
        {error && (
          <p className="text-sm" style={{ color: 'var(--danger)' }}>
            {error}
          </p>
        )}
        <div className="flex justify-end">
          <button className="btn btn-primary" onClick={save} disabled={busy || !name.trim()}>
            {busy ? 'Saving…' : 'Add person'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
