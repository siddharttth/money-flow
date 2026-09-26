'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import useSWR, { useSWRConfig } from 'swr';
import { api, RequestError } from '@/lib/client';
import { currentMonth, monthLabel } from '@/lib/dates';
import { formatINR } from '@/lib/money';
import type { Person, PersonStat } from '@/lib/types';
import {
  Card,
  CardStrip,
  EmptyState,
  ErrorState,
  HeroFigure,
  ListSkeleton,
  Modal,
  Money,
  PageHeader,
  Segmented,
  StatStrip,
} from '@/components/ui';
import { MonthPicker } from '@/components/month-picker';
import { ShareBar } from '@/components/graph';
import { LedgerForm } from '@/components/ledger-form';
import { useShell } from '@/components/app-shell';
import { useInspector } from '@/components/inspector';
import { NavIcon, PersonMark } from '@/components/icons';
import { PALETTE } from '@/lib/defaults';
import { CountDownToZero, CountMoney, useFreshKeys, useJustCleared, useMotionOk, usePulseOnChange } from '@/components/motion';

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

  /*
   * Motion for what you change (motion.tsx): the net card acknowledges a
   * lend, a borrow or a settle-up, and the person it moved washes once. Keyed
   * on balances alone — they are not month-scoped, so stepping the month
   * picker can never flash a row.
   */
  const netPulse = usePulseOnChange([net, owedToMe, owedByMe]);
  const moved = useFreshKeys(
    everyone.map((r) => `${r.person.id}:${r.balanceMinor}`),
    !!people.data && !!peers.data,
  );
  /* A balance that just reached zero gets its own moment — a green sweep and
     the amount counting off — instead of the ordinary edit wash. */
  const cleared = useJustCleared(
    everyone.map((r) => [r.person.id, r.balanceMinor]),
    !!people.data && !!peers.data && !peers.isValidating,
  );
  const movedPeople = new Set([...moved].map((k) => k.split(':')[0]).filter((id) => !cleared.has(id)));

  /* After every hook, so an error cannot change how many of them run. */
  if (people.error) return <ErrorState message={people.error.message} onRetry={() => people.mutate()} />;

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
      <Card className={`!p-5 sm:!p-6 glow-card bloom-lg ${net < 0 ? 'bloom-danger' : ''}`} {...netPulse}>
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
                <CountMoney minor={Math.abs(net)} />
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

          {peers.data && (
            <div className="min-w-0">
              <div className="flex items-baseline justify-between gap-4 mb-2">
                <span>
                  <span className="micro block">They owe me</span>
                  <span className="num text-[19px] font-bold" style={{ color: 'var(--credit)' }}>
                    <CountMoney minor={owedToMe} />
                  </span>
                </span>
                <span className="text-right">
                  <span className="micro block">I owe</span>
                  <span className="num text-[19px] font-bold" style={{ color: 'var(--rule-red)' }}>
                    <CountMoney minor={owedByMe} />
                  </span>
                </span>
              </div>
              <TugBar
                share={receivableShare}
                square={owedToMe === 0 && owedByMe === 0}
                ready={!peers.isValidating}
              />
              <div className="flex items-baseline justify-between gap-3 mt-2 text-[11px] muted">
                {owedToMe === 0 && owedByMe === 0 ? (
                  <span className="w-full text-center">All square, both ways</span>
                ) : (
                  <>
                    <span>
                      <span className="num">{formatINR(owedToMe)}</span> receivable (
                      {Math.round(receivableShare * 100)}%)
                    </span>
                    <span>
                      <span className="num">{formatINR(owedByMe)}</span> payable (
                      {Math.round((1 - receivableShare) * 100)}%)
                    </span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* One line each, even at a phone's half-width — "I borrowed money"
              wrapped to two and the pair came out different heights. */}
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-2 w-full lg:w-52 shrink-0">
            <button
              className="btn btn-ghost whitespace-nowrap max-sm:!px-3 max-sm:text-[13px]"
              onClick={() => setLedgerFor({ direction: 'out' })}
            >
              ↗ I lent money
            </button>
            <button
              className="btn btn-ghost whitespace-nowrap max-sm:!px-3 max-sm:text-[13px]"
              onClick={() => setLedgerFor({ direction: 'in' })}
            >
              ↙ I borrowed money
            </button>
          </div>
        </div>

        {/* Three facts about the ledger as a whole. These were three more
            cards at hero weight under the hero; they are its footer row, each
            badge and note kept as the line under its figure. */}
        <CardStrip pad="lg">
          <StatStrip
            bare
            cols={3}
            items={[
              {
                label: 'Active ledgers',
                /* The open ones, listed. */
                onClick: () => setFilter(filter === 'debt' ? 'all' : 'debt'),
                active: filter === 'debt',
                value: `${rows.length} ${rows.length === 1 ? 'contact' : 'contacts'}`,
                icon: <NavIcon name="people" size={16} />,
                sub: openCount > 0 ? `${openCount} outstanding` : 'all clear',
                extra: (
                  <p className="muted text-[11px] mt-0.5 truncate">
                    {settledCount} fully balanced{openCount ? '' : ' — nothing outstanding'}
                  </p>
                ),
              },
              {
                label: 'Most shared with',
                onClick: topSharer ? () => openPerson(topSharer.person.id) : undefined,
                minor: topSharer?.spendMinor ?? 0,
                icon: <NavIcon name="analytics" size={16} />,
                sub: topSharer
                  ? `${topSharer.person.name} · ${topSharer.count} ${
                      topSharer.count === 1 ? 'transaction' : 'transactions'
                    }`
                  : 'Tag someone on an expense to see this.',
                extra: topSharer ? (
                  <p className="muted text-[11px] mt-0.5 truncate">
                    {Math.round(topSharer.share * 100)}% of spend
                  </p>
                ) : undefined,
              },
              biggestDebt
                ? {
                    label: 'Next settlement',
                    /* The same sheet the row's Settle / Remind opens, with the
                       same direction and amount — its confirm step intact. */
                    onClick: () =>
                      setLedgerFor({
                        direction: biggestDebt.balanceMinor > 0 ? 'in' : 'out',
                        personId: biggestDebt.person.id,
                        settleMinor: Math.abs(biggestDebt.balanceMinor),
                        name: biggestDebt.person.name,
                      }),
                    minor: Math.abs(biggestDebt.balanceMinor),
                    tone: biggestDebt.balanceMinor < 0 ? 'var(--rule-red)' : 'var(--credit)',
                    icon: <NavIcon name="target" size={16} />,
                    sub: `${biggestDebt.person.name} · largest open`,
                    extra: (
                      <p className="muted text-[11px] mt-0.5 truncate">
                        {biggestDebt.balanceMinor < 0
                          ? 'You owe this one — settle to clear it.'
                          : 'Owed to you — a nudge is one tap away.'}
                      </p>
                    ),
                  }
                : {
                    label: 'Next settlement',
                    value: '—',
                    icon: <NavIcon name="target" size={16} />,
                    sub: 'nothing due',
                    extra: <p className="muted text-[11px] mt-0.5 truncate">Every balance is settled.</p>,
                  },
            ]}
          />
        </CardStrip>
      </Card>

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
                    className={`row px-3.5 sm:px-4 py-3 ${
                      cleared.has(person.id) ? 'cleared' : movedPeople.has(person.id) ? 'wash' : ''
                    }`}
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
                          {cleared.has(person.id) && (
                            <CountDownToZero from={cleared.get(person.id)!} className="text-[11px] font-semibold" />
                          )}
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
                        {cleared.has(person.id) ? (
                          <>
                            <CountDownToZero from={cleared.get(person.id)!} className="text-[14px] font-semibold block" />
                            <span className="micro">balance cleared</span>
                          </>
                        ) : balanceMinor === 0 ? (
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

/**
 * What you are owed and what you owe, as one bar with a knob where the two
 * meet.
 *
 * The knob is the balance. A lend or a borrow pulls it across with a small
 * overshoot and it settles — the same weight the goal bars carry when they
 * move — and when everything is paid off both ways it eases back to the
 * middle and lights once. Nothing moves on load or while nothing changes.
 * When there is nothing open, the bar stays, empty, with the knob centred:
 * "all square" is a position too.
 */
function TugBar({ share, square, ready }: { share: number; square: boolean; ready: boolean }) {
  const ok = useMotionOk();
  const at = square ? 0.5 : share;
  const tug = ok ? 'tug' : '';

  /* Coming back to the middle from anywhere else. */
  const wasOpen = useRef<boolean | null>(null);
  const [settledId, setSettledId] = useState(0);
  useEffect(() => {
    if (!ready) return;
    const before = wasOpen.current;
    wasOpen.current = !square;
    if (before && square) setSettledId((n) => n + 1);
  }, [square, ready]);

  const fill = (color: string) => ({
    background: `linear-gradient(90deg, color-mix(in oklab, ${color} 60%, var(--surface-2)), ${color})`,
    boxShadow: `0 0 10px -2px color-mix(in oklab, ${color} 55%, transparent)`,
    opacity: square ? 0 : 1,
  });

  return (
    <div className="relative h-2" role="presentation">
      {/* One bar, both sides — two separate bars invited the reader to
          compare their lengths against different scales. */}
      <div className="absolute inset-0 flex rounded-full overflow-hidden gap-px" style={{ background: 'var(--surface-2)' }}>
        <span className={tug} style={{ width: `${at * 100}%`, ...fill('var(--credit)') }} />
        <span className={tug} style={{ width: `${(1 - at) * 100}%`, ...fill('var(--rule-red)') }} />
      </div>
      {/* The midpoint, marked faintly, so the knob's distance from it reads. */}
      <span aria-hidden className="absolute left-1/2 -top-1 -bottom-1 w-px" style={{ background: 'var(--border-strong)' }} />
      {settledId > 0 && ok && (
        <span
          key={settledId}
          aria-hidden
          className="settle-glow absolute left-1/2 top-1/2 w-3.5 h-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
        />
      )}
      <span
        aria-hidden
        className={`absolute top-1/2 w-3.5 h-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${tug}`}
        style={{
          left: `${at * 100}%`,
          background: 'var(--text)',
          border: '2px solid var(--surface)',
          boxShadow: '0 1px 4px rgb(0 0 0 / 0.35)',
        }}
      />
    </div>
  );
}

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
