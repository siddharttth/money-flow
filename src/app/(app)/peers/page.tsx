'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { formatINR } from '@/lib/money';
import { dayLabel } from '@/lib/dates';
import { Card, EmptyState, ErrorState, ListSkeleton, Modal, Money } from '@/components/ui';
import { LedgerForm } from '@/components/ledger-form';
import { PersonMark } from '@/components/icons';

type Balance = {
  personId: string;
  name: string;
  avatar: string;
  color: string;
  outMinor: number;
  inMinor: number;
  balanceMinor: number;
  entryCount: number;
  lastEntryDate: string | null;
};

type Summary = {
  balances: Balance[];
  owedToMeMinor: number;
  owedByMeMinor: number;
  netMinor: number;
  theyOwe: Balance[];
  iOwe: Balance[];
  settled: Balance[];
};

export default function PeersPage() {
  const { data, error, isLoading, mutate } = useSWR<Summary>('/api/ledger');
  const [adding, setAdding] = useState<null | 'out' | 'in'>(null);

  if (error) return <ErrorState message={error.message} onRetry={() => mutate()} />;

  const net = data?.netMinor ?? 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold">Peers</h1>
        <p className="muted text-sm">Money you&apos;ve given and taken — kept out of your spending totals</p>
      </div>

      {/* Headline: the sheet's GIVEN and TAKEN totals. */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="!p-4 rule-credit">
          <p className="label mb-1">They owe me</p>
          {data ? (
            <Money minor={data.owedToMeMinor} className="text-xl sm:text-2xl font-semibold" style={{ color: 'var(--credit)' }} />
          ) : (
            <p className="text-xl sm:text-2xl font-semibold">—</p>
          )}
          <p className="muted text-xs mt-1">
            {data ? `${data.theyOwe.length} ${data.theyOwe.length === 1 ? 'person' : 'people'}` : ''}
          </p>
        </Card>
        <Card className="!p-4 rule-red">
          <p className="label mb-1">I owe</p>
          {data ? (
            <Money minor={data.owedByMeMinor} className="text-xl sm:text-2xl font-semibold" style={{ color: 'var(--rule-red)' }} />
          ) : (
            <p className="text-xl sm:text-2xl font-semibold">—</p>
          )}
          <p className="muted text-xs mt-1">
            {data ? `${data.iOwe.length} ${data.iOwe.length === 1 ? 'person' : 'people'}` : ''}
          </p>
        </Card>
      </div>

      {data && (data.owedToMeMinor > 0 || data.owedByMeMinor > 0) && (
        <Card className="!p-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="label mb-0">Net position</span>
            <span
              className="text-lg font-semibold tabular"
              style={{ color: net >= 0 ? 'var(--success)' : 'var(--danger)' }}
            >
              {net >= 0 ? '+' : '−'}
              {formatINR(Math.abs(net))}
            </span>
          </div>
          <p className="muted text-xs mt-1">
            {net >= 0 ? 'You are owed more than you owe.' : 'You owe more than you are owed.'}
          </p>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button className="btn btn-ghost" onClick={() => setAdding('out')}>
          ↑ I gave
        </button>
        <button className="btn btn-ghost" onClick={() => setAdding('in')}>
          ↓ I got
        </button>
      </div>

      {isLoading ? (
        <Card>
          <ListSkeleton rows={4} />
        </Card>
      ) : !data?.balances.length ? (
        <Card>
          <EmptyState
            icon="🤝"
            title="No lending or borrowing yet"
            hint="Track money you've lent to friends or borrowed from family. It never counts as spending."
            action={
              <button className="btn btn-primary" onClick={() => setAdding('out')}>
                Record the first one
              </button>
            }
          />
        </Card>
      ) : (
        <>
          {data.theyOwe.length > 0 && <PeerGroup title="They owe me" items={data.theyOwe} tone="success" />}
          {data.iOwe.length > 0 && <PeerGroup title="I owe them" items={data.iOwe} tone="danger" />}
          {data.settled.length > 0 && <PeerGroup title="Settled" items={data.settled} tone="muted" />}
        </>
      )}

      <Modal open={!!adding} onClose={() => setAdding(null)} title={adding === 'in' ? 'Money I got' : 'Money I gave'}>
        <LedgerForm
          key={adding ?? 'none'}
          defaultDirection={adding ?? 'out'}
          onSaved={() => {
            setAdding(null);
            mutate();
          }}
        />
      </Modal>
    </div>
  );
}

function PeerGroup({
  title,
  items,
  tone,
}: {
  title: string;
  items: Balance[];
  tone: 'success' | 'danger' | 'muted';
}) {
  const color = tone === 'success' ? 'var(--success)' : tone === 'danger' ? 'var(--danger)' : 'var(--text-muted)';
  return (
    <Card className="!p-0 overflow-hidden">
      <div
        className="px-4 sm:px-5 py-2.5 border-b flex items-center justify-between"
        style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
      >
        <span className="text-sm font-medium">{title}</span>
        <span className="text-sm font-semibold tabular" style={{ color }}>
          {formatINR(items.reduce((s, b) => s + Math.abs(b.balanceMinor), 0))}
        </span>
      </div>
      <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
        {items.map((b) => (
          <Link key={b.personId} href={`/peers/${b.personId}`} className="flex items-center gap-3 px-4 sm:px-5 py-3">
            <PersonMark name={b.name} color={b.color} size={40} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{b.name}</p>
              <p className="muted text-xs truncate">
                {b.entryCount} {b.entryCount === 1 ? 'entry' : 'entries'}
                {b.lastEntryDate ? ` · last ${dayLabel(b.lastEntryDate)}` : ''}
              </p>
            </div>
            <span className="tabular font-semibold text-sm shrink-0" style={{ color }}>
              {formatINR(Math.abs(b.balanceMinor))}
            </span>
          </Link>
        ))}
      </div>
    </Card>
  );
}
