'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import useSWR, { useSWRConfig } from 'swr';
import { api } from '@/lib/client';
import { formatINR } from '@/lib/money';
import { dayLabel } from '@/lib/dates';
import { Card, EmptyState, ErrorState, ListSkeleton, Modal, SectionTitle } from '@/components/ui';
import { LedgerForm, type LedgerEntry } from '@/components/ledger-form';
import { useShell } from '@/components/app-shell';
import { PersonMark } from '@/components/icons';

type Detail = {
  person: { id: string; name: string; avatar: string; color: string; relationshipType: string };
  outMinor: number;
  inMinor: number;
  balanceMinor: number;
  entries: (LedgerEntry & { runningBalanceMinor: number })[];
};

export default function PeerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { toast } = useShell();
  const { mutate: globalMutate } = useSWRConfig();
  const { data, error, isLoading, mutate } = useSWR<Detail>(`/api/ledger/person/${id}`);
  const [adding, setAdding] = useState<null | 'out' | 'in'>(null);
  const [editing, setEditing] = useState<LedgerEntry | null>(null);
  const [settling, setSettling] = useState(false);

  async function refresh() {
    await globalMutate((k) => typeof k === 'string' && k.startsWith('/api/ledger'), undefined, { revalidate: true });
    await mutate();
  }

  async function remove(entry: LedgerEntry) {
    try {
      await api.del(`/api/ledger/${entry.id}`);
      await refresh();
      toast(`Deleted ${formatINR(entry.amountMinor)}`, 'success', {
        label: 'Undo',
        onClick: async () => {
          await api.post(`/api/ledger/${entry.id}/restore`);
          await refresh();
          toast('Entry restored');
        },
      });
    } catch {
      toast('Could not delete', 'error');
    }
  }

  if (error) return <ErrorState message={error.message} onRetry={() => mutate()} />;

  const balance = data?.balanceMinor ?? 0;
  const theyOwe = balance > 0;
  const settled = balance === 0;

  return (
    <div className="space-y-5">
      <Link href="/peers" className="muted text-sm inline-flex items-center gap-1">
        ‹ All peers
      </Link>

      {isLoading || !data ? (
        <Card>
          <ListSkeleton rows={5} />
        </Card>
      ) : (
        <>
          <Card>
            <div className="flex items-center gap-4">
              <PersonMark name={data.person.name} color={data.person.color} size={56} />
              <div className="min-w-0">
                <h1 className="text-xl font-semibold truncate">{data.person.name}</h1>
                <p className="muted text-sm capitalize">{data.person.relationshipType}</p>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
              <p className="label">{settled ? 'Settled up' : theyOwe ? 'They owe me' : 'I owe them'}</p>
              <p
                className="text-3xl font-semibold tabular"
                style={{ color: settled ? 'var(--text)' : theyOwe ? 'var(--success)' : 'var(--danger)' }}
              >
                {formatINR(Math.abs(balance))}
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs muted">
                <span>Gave {formatINR(data.outMinor)}</span>
                <span>Got {formatINR(data.inMinor)}</span>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-2">
            <button className="btn btn-ghost" onClick={() => setAdding('out')}>
              ↑ I gave
            </button>
            <button className="btn btn-ghost" onClick={() => setAdding('in')}>
              ↓ I got
            </button>
          </div>

          {!settled && (
            <button className="btn btn-primary w-full" onClick={() => setSettling(true)}>
              Settle up · {formatINR(Math.abs(balance))}
            </button>
          )}

          <Card className="!p-0 overflow-hidden">
            <div className="px-4 sm:px-5 pt-4 pb-3">
              <SectionTitle>History</SectionTitle>
            </div>
            {data.entries.length === 0 ? (
              <div className="pb-4">
                <EmptyState title="Nothing recorded yet" />
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {data.entries.map((e) => (
                  <EntryRow key={e.id} entry={e} onEdit={() => setEditing(e)} onDelete={() => remove(e)} />
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      <Modal
        open={!!adding}
        onClose={() => setAdding(null)}
        title={adding === 'in' ? `Money from ${data?.person.name ?? ''}` : `Money to ${data?.person.name ?? ''}`}
      >
        <LedgerForm
          key={adding ?? 'none'}
          lockedPersonId={id}
          defaultDirection={adding ?? 'out'}
          onSaved={() => {
            setAdding(null);
            refresh();
          }}
        />
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit entry">
        {editing && (
          <LedgerForm
            key={editing.id}
            existing={editing}
            onSaved={() => {
              setEditing(null);
              refresh();
            }}
          />
        )}
      </Modal>

      {/* Settling is just an entry in the opposite direction for the exact balance. */}
      <Modal open={settling} onClose={() => setSettling(false)} title="Settle up">
        <p className="muted text-sm mb-4">
          {theyOwe
            ? `Records ${formatINR(Math.abs(balance))} coming back from ${data?.person.name}, bringing the balance to zero.`
            : `Records ${formatINR(Math.abs(balance))} paid back to ${data?.person.name}, bringing the balance to zero.`}
        </p>
        <LedgerForm
          key={`settle-${balance}`}
          lockedPersonId={id}
          defaultDirection={theyOwe ? 'in' : 'out'}
          defaultAmount={Math.abs(balance) / 100}
          onSaved={() => {
            setSettling(false);
            refresh();
          }}
        />
      </Modal>
    </div>
  );
}

function EntryRow({
  entry: e,
  onEdit,
  onDelete,
}: {
  entry: LedgerEntry & { runningBalanceMinor: number };
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const out = e.direction === 'out';

  return (
    <div>
      <div className="flex items-center gap-3 px-4 sm:px-5 py-3">
        <button onClick={onEdit} className="flex items-center gap-3 min-w-0 flex-1 text-left">
          <span
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-sm font-semibold"
            style={{
              background: out ? 'color-mix(in srgb, var(--danger) 15%, transparent)' : 'color-mix(in srgb, var(--success) 15%, transparent)',
              color: out ? 'var(--danger)' : 'var(--success)',
            }}
            aria-hidden
          >
            {out ? '↑' : '↓'}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">
              {out ? 'I gave' : 'I got'}
              {e.note ? <span className="muted font-normal"> · {e.note}</span> : ''}
            </p>
            {/* Kept terse and non-wrapping — this line sat under a name on a phone. */}
            <p className="muted text-xs truncate">
              {dayLabel(e.entryDate)} ·{' '}
              {e.runningBalanceMinor === 0
                ? 'settled'
                : `bal ${formatINR(Math.abs(e.runningBalanceMinor))} ${e.runningBalanceMinor > 0 ? 'to me' : 'to them'}`}
            </p>
          </div>
        </button>
        <span
          className="tabular font-semibold text-sm shrink-0"
          style={{ color: out ? 'var(--danger)' : 'var(--success)' }}
        >
          {out ? '−' : '+'}
          {formatINR(e.amountMinor)}
        </span>
        <button
          onClick={() => setOpen((o) => !o)}
          aria-label="Entry actions"
          aria-expanded={open}
          className="muted px-1.5 text-lg leading-none shrink-0"
        >
          ⋯
        </button>
      </div>
      {open && (
        <div className="flex gap-2 px-4 sm:px-5 pb-3 -mt-1 animate-in">
          <button
            className="chip"
            style={{ color: 'var(--danger)' }}
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
