'use client';

import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import useSWR, { useSWRConfig } from 'swr';
import { api, RequestError } from '@/lib/client';
import { currentMonth, monthLabel } from '@/lib/dates';
import { formatINR } from '@/lib/money';
import type { Person, PersonStat } from '@/lib/types';
import { Card, EmptyState, ErrorState, ListSkeleton, Modal, Money } from '@/components/ui';
import { MonthPicker } from '@/components/month-picker';
import { LedgerForm } from '@/components/ledger-form';
import { useShell } from '@/components/app-shell';
import { useInspector } from '@/components/inspector';
import { PersonMark } from '@/components/icons';
import { PALETTE } from '@/lib/defaults';

/**
 * People and Peers were two screens for one entity — a contact you spend with
 * and a contact you lend to are the same person. This hub merges them: spend
 * and debt sit on the same row, and the row opens the same inspector.
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
    <Suspense fallback={<Card><ListSkeleton rows={6} /></Card>}>
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
  const [ledgerFor, setLedgerFor] = useState<null | { direction: 'out' | 'in'; personId?: string }>(
    params.get('settle') ? { direction: 'in', personId: params.get('settle')! } : null,
  );
  const [addingPerson, setAddingPerson] = useState(false);

  const people = useSWR<{ items: Person[] }>('/api/people');
  const stats = useSWR<{ people: PersonStat[]; grandTotalMinor: number }>(`/api/analytics/people?month=${month}`);
  const peers = useSWR<PeerSummary>('/api/ledger');

  const spendById = new Map((stats.data?.people ?? []).map((s) => [s.personId, s]));
  const balById = new Map((peers.data?.balances ?? []).map((b) => [b.personId, b]));

  const rows = useMemo(() => {
    const all = (people.data?.items ?? []).map((p) => ({
      person: p,
      spendMinor: spendById.get(p.id)?.totalMinor ?? 0,
      count: spendById.get(p.id)?.count ?? 0,
      balanceMinor: balById.get(p.id)?.balanceMinor ?? 0,
    }));
    const filtered =
      filter === 'debt' ? all.filter((r) => r.balanceMinor !== 0) : filter === 'spend' ? all.filter((r) => r.spendMinor > 0) : all;
    return filtered.sort((a, b) =>
      filter === 'debt' ? Math.abs(b.balanceMinor) - Math.abs(a.balanceMinor) : b.spendMinor - a.spendMinor,
    );
  }, [people.data, stats.data, peers.data, filter]);

  async function refresh() {
    await mutate((k) => typeof k === 'string' && k.startsWith('/api/'), undefined, { revalidate: true });
  }

  if (people.error) return <ErrorState message={people.error.message} onRetry={() => people.mutate()} />;

  const net = peers.data?.netMinor ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold">People &amp; Ledger</h1>
          <p className="muted text-sm">Spending associations and money owed, in one place</p>
        </div>
        <MonthPicker month={month} onChange={setMonth} />
      </div>

      {/* Net position, with the two actions that change it. */}
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="micro mb-1.5">Net position</p>
            <Money
              minor={Math.abs(net)}
              className="block text-3xl font-semibold"
              style={{ color: net === 0 ? 'var(--text)' : net > 0 ? 'var(--credit)' : 'var(--rule-red)' }}
            />
            <p className="muted text-sm mt-1.5">
              {net === 0
                ? 'Everything is settled.'
                : net > 0
                  ? 'owed to you, on balance'
                  : 'you owe, on balance'}
            </p>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-ghost text-sm" onClick={() => setLedgerFor({ direction: 'out' })}>
              + Lend / give
            </button>
            <button className="btn btn-ghost text-sm" onClick={() => setLedgerFor({ direction: 'in' })}>
              − Borrow / receive
            </button>
          </div>
        </div>

        {peers.data && (peers.data.owedToMeMinor > 0 || peers.data.owedByMeMinor > 0) && (
          <div className="grid grid-cols-2 gap-3 mt-5 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
            <div>
              <p className="micro mb-1">They owe me</p>
              <Money minor={peers.data.owedToMeMinor} className="text-lg font-semibold" style={{ color: 'var(--credit)' }} />
            </div>
            <div>
              <p className="micro mb-1">I owe</p>
              <Money minor={peers.data.owedByMeMinor} className="text-lg font-semibold" style={{ color: 'var(--rule-red)' }} />
            </div>
          </div>
        )}
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        {([
          ['all', 'All contacts'],
          ['debt', 'Active debt only'],
          ['spend', 'Top spending'],
        ] as const).map(([k, label]) => (
          <button key={k} className="chip" data-selected={filter === k} onClick={() => setFilter(k)}>
            {label}
          </button>
        ))}
        <button className="chip ml-auto" onClick={() => setAddingPerson(true)}>
          + Person
        </button>
      </div>

      <Card className="!p-0 overflow-hidden">
        {people.isLoading ? (
          <div className="p-4">
            <ListSkeleton rows={6} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon="👥"
            title={filter === 'all' ? 'No people yet' : 'Nothing matches this filter'}
            hint={
              filter === 'all'
                ? 'Add family and friends to track who your spending is with, and who owes what.'
                : 'Try “All contacts”.'
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
            {/* Column headers only make sense once there is a table to read. */}
            <div
              className="hidden sm:grid grid-cols-[1fr_auto_auto_auto] gap-4 px-4 py-2.5 border-b"
              style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
            >
              <span className="micro">Contact</span>
              <span className="micro w-28 text-right">{monthLabel(month).split(' ')[0]} spend</span>
              <span className="micro w-28 text-right">Balance</span>
              <span className="micro w-16 text-right">Action</span>
            </div>

            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {rows.map(({ person, spendMinor, count, balanceMinor }) => (
                <div
                  key={person.id}
                  className="row grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_auto_auto_auto] gap-x-4 gap-y-1 items-center px-4 py-3"
                  onClick={() => openPerson(person.id)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <PersonMark name={person.name} color={person.color} size={36} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {person.name}
                        {person.isSelf && <span className="muted font-normal text-xs"> · you</span>}
                      </p>
                      <p className="muted text-xs capitalize">
                        {person.relationshipType} · {count} {count === 1 ? 'transaction' : 'transactions'}
                      </p>
                    </div>
                  </div>

                  <Money minor={spendMinor} className="text-sm font-semibold sm:w-28 text-right" />

                  <span className="col-span-2 sm:col-span-1 sm:w-28 text-right text-sm font-semibold num" style={{
                    color: balanceMinor === 0 ? 'var(--text-muted)' : balanceMinor > 0 ? 'var(--credit)' : 'var(--rule-red)',
                  }}>
                    {balanceMinor === 0 ? '—' : `${balanceMinor > 0 ? '+' : '−'}${formatINR(Math.abs(balanceMinor))}`}
                  </span>

                  <div className="hidden sm:flex justify-end w-16">
                    {balanceMinor !== 0 && !person.isSelf ? (
                      <button
                        className="tag"
                        onClick={(e) => {
                          e.stopPropagation();
                          setLedgerFor({ direction: balanceMinor > 0 ? 'in' : 'out', personId: person.id });
                        }}
                      >
                        Settle
                      </button>
                    ) : (
                      <span className="tag opacity-0 pointer-events-none">—</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      <Modal
        open={!!ledgerFor}
        onClose={() => setLedgerFor(null)}
        title={ledgerFor?.direction === 'in' ? 'Money I got' : 'Money I gave'}
      >
        {ledgerFor && (
          <LedgerForm
            key={`${ledgerFor.direction}-${ledgerFor.personId ?? 'any'}`}
            defaultDirection={ledgerFor.direction}
            lockedPersonId={ledgerFor.personId}
            onSaved={() => {
              setLedgerFor(null);
              refresh();
              toast('Ledger updated');
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
          <label className="label">Relationship</label>
          <div className="flex flex-wrap gap-2">
            {RELATIONSHIPS.map((r) => (
              <button key={r} className="chip capitalize" data-selected={relationshipType === r} onClick={() => setRelationshipType(r)}>
                {r}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label">Colour</label>
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
