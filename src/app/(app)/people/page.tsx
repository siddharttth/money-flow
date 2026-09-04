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
import { PersonMark } from '@/components/icons';
import { PALETTE } from '@/lib/defaults';

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

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="People"
        title="Who it was with"
        actions={<MonthPicker month={month} onChange={setMonth} />}
      />

      {/* The net position, and the only two actions that change it. */}
      <Card className="!p-5 sm:!p-6">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_auto] gap-6 items-end">
          <div>
            <HeroFigure
              label="Net position"
              minor={Math.abs(net)}
              note={
                net === 0
                  ? 'Everything is settled.'
                  : net > 0
                    ? 'owed to you, on balance'
                    : 'you owe, on balance'
              }
            />
            {(owedToMe > 0 || owedByMe > 0) && (
              <div className="grid grid-cols-2 gap-4 mt-5 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                <div>
                  <p className="label mb-1.5">They owe me</p>
                  <Money minor={owedToMe} className="text-lg font-semibold" style={{ color: 'var(--credit)' }} />
                  <div className="mt-2">
                    <ShareBar
                      share={owedToMe / Math.max(owedToMe, owedByMe)}
                      color="var(--credit)"
                    />
                  </div>
                </div>
                <div>
                  <p className="label mb-1.5">I owe</p>
                  <Money minor={owedByMe} className="text-lg font-semibold" style={{ color: 'var(--rule-red)' }} />
                  <div className="mt-2">
                    <ShareBar
                      share={owedByMe / Math.max(owedToMe, owedByMe)}
                      color="var(--rule-red)"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-1 gap-2 w-full lg:w-52">
            {/* The same two words the Add sheet uses. One vocabulary for one
                concept, everywhere it appears. */}
            <button className="btn btn-ghost" onClick={() => setLedgerFor({ direction: 'out' })}>
              I lent
            </button>
            <button className="btn btn-ghost" onClick={() => setLedgerFor({ direction: 'in' })}>
              I borrowed
            </button>
          </div>
        </div>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'debt', label: 'Owing' },
            { value: 'spend', label: 'Spending' },
          ]}
        />
        <button className="chip shrink-0" onClick={() => setAddingPerson(true)}>
          + Person
        </button>
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
              className="hidden sm:grid grid-cols-[minmax(0,1fr)_7rem_7rem_4.5rem] gap-4 px-4 py-2 border-b"
              style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
            >
              <span className="micro">Contact</span>
              <span className="micro text-right">{monthLabel(month).split(' ')[0]} spend</span>
              <span className="micro text-right">Balance</span>
              <span className="micro text-right">Settle</span>
            </div>

            <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {rows.map(({ person, spendMinor, count, balanceMinor }) => (
                <li
                  key={person.id}
                  className="row px-3.5 sm:px-4 py-3"
                  onClick={() => openPerson(person.id)}
                >
                  <div className="sm:grid sm:grid-cols-[minmax(0,1fr)_7rem_7rem_4.5rem] sm:gap-4 sm:items-center">
                    <div className="flex items-center gap-3 min-w-0">
                      <PersonMark name={person.name} color={person.color} size={34} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13.5px] font-semibold truncate">
                          {person.name}
                          {person.isSelf && <span className="muted font-normal text-[11px]"> · you</span>}
                        </p>
                        <p className="muted text-[11px] capitalize mt-0.5">
                          {person.relationshipType}
                          {count > 0 && ` · ${count} ${count === 1 ? 'transaction' : 'transactions'}`}
                        </p>
                      </div>
                      {/* On a phone the balance rides up next to the name,
                          where the eye already is. */}
                      <span className="sm:hidden shrink-0 text-right">
                        <Money minor={spendMinor} className="text-[13.5px] font-semibold block" />
                        {balanceMinor !== 0 && (
                          <span
                            className="num text-[11px] font-semibold"
                            style={{ color: balanceMinor > 0 ? 'var(--credit)' : 'var(--rule-red)' }}
                          >
                            {balanceMinor > 0 ? '+' : '−'}
                            {formatINR(Math.abs(balanceMinor))}
                          </span>
                        )}
                      </span>
                    </div>

                    <div className="hidden sm:block text-right">
                      <Money minor={spendMinor} className="text-[13px] font-semibold" />
                      {spendMinor > 0 && (
                        <div className="mt-1.5">
                          <ShareBar share={spendMinor / maxSpend} color={person.color} height={3} />
                        </div>
                      )}
                    </div>

                    <span
                      className="num hidden sm:block text-right text-[13px] font-semibold"
                      style={{
                        color:
                          balanceMinor === 0
                            ? 'var(--text-muted)'
                            : balanceMinor > 0
                              ? 'var(--credit)'
                              : 'var(--rule-red)',
                      }}
                    >
                      {balanceMinor === 0 ? '—' : `${balanceMinor > 0 ? '+' : '−'}${formatINR(Math.abs(balanceMinor))}`}
                    </span>

                    <div className="hidden sm:flex justify-end">
                      {balanceMinor !== 0 && !person.isSelf ? (
                        <button
                          className="tag"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLedgerFor({
                              direction: balanceMinor > 0 ? 'in' : 'out',
                              personId: person.id,
                              settleMinor: Math.abs(balanceMinor),
                              name: person.name,
                            });
                          }}
                        >
                          Settle
                        </button>
                      ) : (
                        <span aria-hidden className="micro">
                          —
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Settling is a real action on a phone too, just not one
                      that gets a column. */}
                  {balanceMinor !== 0 && !person.isSelf && (
                    <div className="sm:hidden mt-2.5 pl-[2.875rem]">
                      <button
                        className="tag"
                        onClick={(e) => {
                          e.stopPropagation();
                          setLedgerFor({
                            direction: balanceMinor > 0 ? 'in' : 'out',
                            personId: person.id,
                            settleMinor: Math.abs(balanceMinor),
                            name: person.name,
                          });
                        }}
                      >
                        Settle {formatINR(Math.abs(balanceMinor))}
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <p className="muted text-[12px] leading-relaxed max-w-2xl">
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
