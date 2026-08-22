'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR, { useSWRConfig } from 'swr';
import { api, RequestError } from '@/lib/client';
import { currentMonth, monthLabel } from '@/lib/dates';
import { formatINR } from '@/lib/money';
import type { Group, Person, PersonStat } from '@/lib/types';
import { Card, EmptyState, ListSkeleton, Modal, SectionTitle } from '@/components/ui';
import { MonthPicker } from '@/components/month-picker';
import { useShell } from '@/components/app-shell';

const RELATIONSHIPS = ['self', 'family', 'friend', 'other'] as const;
const AVATARS = ['🙂', '🙋', '👩', '👨', '🧑', '👧', '🧒', '👵', '👴', '🤝', '🎓', '🏢'];

export default function PeoplePage() {
  const { toast } = useShell();
  const { mutate } = useSWRConfig();
  const [month, setMonth] = useState(currentMonth());
  const [editing, setEditing] = useState<Person | null>(null);
  const [creating, setCreating] = useState(false);
  const [groupModal, setGroupModal] = useState(false);

  const people = useSWR<{ items: Person[] }>('/api/people?includeInactive=true');
  const stats = useSWR<{
    people: PersonStat[];
    unassignedMinor: number;
    grandTotalMinor: number;
    associationTotalMinor: number;
  }>(`/api/analytics/people?month=${month}`);
  const groups = useSWR<{ items: Group[] }>('/api/groups');

  const statsById = new Map((stats.data?.people ?? []).map((s) => [s.personId, s]));
  const active = (people.data?.items ?? []).filter((p) => p.isActive);
  const hidden = (people.data?.items ?? []).filter((p) => !p.isActive);

  async function refresh() {
    await mutate((k) => typeof k === 'string' && k.startsWith('/api/'), undefined, { revalidate: true });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold">People</h1>
          <p className="muted text-sm">Spending associated with each person · {monthLabel(month)}</p>
        </div>
        <div className="flex items-center gap-2">
          <MonthPicker month={month} onChange={setMonth} />
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            + Person
          </button>
        </div>
      </div>

      <Card>
        {people.isLoading ? (
          <ListSkeleton rows={5} />
        ) : active.length === 0 ? (
          <EmptyState icon="👥" title="No people yet" hint="Add family and friends to track who your spending is with." />
        ) : (
          <>
            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {active
                .slice()
                .sort((a, b) => (statsById.get(b.id)?.totalMinor ?? 0) - (statsById.get(a.id)?.totalMinor ?? 0))
                .map((p) => {
                  const stat = statsById.get(p.id);
                  return (
                    <div key={p.id} className="flex items-center gap-3 py-3">
                      <Link href={`/people/${p.id}?month=${month}`} className="flex items-center gap-3 flex-1 min-w-0">
                        <span
                          className="w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0"
                          style={{ background: `${p.color}22` }}
                          aria-hidden
                        >
                          {p.avatar}
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">
                            {p.name}
                            {p.isSelf && <span className="muted font-normal text-xs"> · you</span>}
                          </p>
                          <p className="muted text-xs">
                            <span className="capitalize">{p.relationshipType}</span> · {stat?.count ?? 0}{' '}
                            {stat?.count === 1 ? 'transaction' : 'transactions'}
                          </p>
                        </div>
                      </Link>
                      <span className="tabular font-semibold text-sm">{formatINR(stat?.totalMinor ?? 0)}</span>
                      <button className="muted px-1.5 text-lg leading-none" onClick={() => setEditing(p)} aria-label={`Edit ${p.name}`}>
                        ⋯
                      </button>
                    </div>
                  );
                })}
            </div>

            {stats.data && (
              <div className="mt-4 pt-4 border-t space-y-1.5" style={{ borderColor: 'var(--border)' }}>
                {stats.data.unassignedMinor > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="muted">Not linked to anyone</span>
                    <span className="tabular muted">{formatINR(stats.data.unassignedMinor)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-semibold">
                  <span>Actual spending this month</span>
                  <span className="tabular">{formatINR(stats.data.grandTotalMinor)}</span>
                </div>
                <p className="muted text-xs leading-relaxed pt-1">
                  The per-person figures above are an association view of that same total. When one expense involves
                  several people it appears in full under each of them, so those rows can add up to more than the
                  month total — that is by design and never inflates what you actually spent.
                </p>
              </div>
            )}
          </>
        )}
      </Card>

      {hidden.length > 0 && (
        <Card>
          <SectionTitle>Hidden people</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {hidden.map((p) => (
              <button key={p.id} className="chip" onClick={() => setEditing(p)}>
                {p.avatar} {p.name}
              </button>
            ))}
          </div>
          <p className="muted text-xs mt-3">Their past expenses still count — they&apos;re just hidden from pickers.</p>
        </Card>
      )}

      <Card>
        <SectionTitle
          action={
            <button className="btn btn-ghost text-sm" onClick={() => setGroupModal(true)}>
              + Group
            </button>
          }
        >
          Groups
        </SectionTitle>
        {groups.data?.items.length ? (
          <div className="space-y-3">
            {groups.data.items.map((g) => (
              <div key={g.id} className="flex items-center gap-3">
                <span className="text-lg" aria-hidden>
                  {g.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{g.name}</p>
                  <p className="muted text-xs truncate">
                    {g.members.map((m) => m.name).join(', ') || 'No members yet'}
                  </p>
                </div>
                <button
                  className="muted text-xs hover:underline"
                  onClick={async () => {
                    await api.del(`/api/groups/${g.id}`);
                    await refresh();
                    toast('Group deleted');
                  }}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted text-sm">No groups yet — group people into a family or circle to organise them.</p>
        )}
      </Card>

      <PersonModal
        open={creating || !!editing}
        person={editing}
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

      <GroupModal
        open={groupModal}
        people={active}
        onClose={() => setGroupModal(false)}
        onDone={async () => {
          await refresh();
          toast('Group created');
          setGroupModal(false);
        }}
      />
    </div>
  );
}

function PersonModal({
  open,
  person,
  onClose,
  onDone,
}: {
  open: boolean;
  person: Person | null;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [name, setName] = useState('');
  const [relationshipType, setRelationshipType] = useState<string>('friend');
  const [avatar, setAvatar] = useState('🙂');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState('');

  // Re-seed the fields whenever a different person is opened.
  const identity = person?.id ?? 'new';
  if (key !== identity && open) {
    setKey(identity);
    setName(person?.name ?? '');
    setRelationshipType(person?.relationshipType ?? 'friend');
    setAvatar(person?.avatar ?? '🙂');
    setError(null);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      if (person) {
        await api.patch(`/api/people/${person.id}`, { name, relationshipType, avatar });
        onDone('Person updated');
      } else {
        await api.post('/api/people', { name, relationshipType, avatar });
        onDone('Person added');
      }
    } catch (err) {
      setError(err instanceof RequestError ? err.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!person) return;
    setBusy(true);
    try {
      const res = await api.del<{ mode: string; message?: string }>(`/api/people/${person.id}`);
      onDone(res.message ?? (res.mode === 'disabled' ? 'Person hidden' : 'Person removed'));
    } catch (err) {
      setError(err instanceof RequestError ? err.message : 'Could not remove');
      setBusy(false);
    }
  }

  async function toggleActive() {
    if (!person) return;
    setBusy(true);
    await api.patch(`/api/people/${person.id}`, { isActive: !person.isActive });
    onDone(person.isActive ? 'Person hidden' : 'Person restored');
    setBusy(false);
  }

  return (
    <Modal open={open} onClose={onClose} title={person ? `Edit ${person.name}` : 'Add person'}>
      <div className="space-y-4">
        <div>
          <label className="label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>

        <div>
          <label className="label">Relationship</label>
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
          <label className="label">Avatar</label>
          <div className="flex flex-wrap gap-2">
            {AVATARS.map((a) => (
              <button key={a} className="chip text-lg px-3" data-selected={avatar === a} onClick={() => setAvatar(a)}>
                {a}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="text-sm" style={{ color: 'var(--danger)' }}>
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-2 justify-end pt-1">
          {person && !person.isSelf && (
            <>
              <button className="btn btn-ghost" onClick={toggleActive} disabled={busy}>
                {person.isActive ? 'Hide' : 'Restore'}
              </button>
              <button className="btn btn-danger" onClick={remove} disabled={busy}>
                Delete
              </button>
            </>
          )}
          <button className="btn btn-primary" onClick={save} disabled={busy || !name.trim()}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function GroupModal({
  open,
  people,
  onClose,
  onDone,
}: {
  open: boolean;
  people: Person[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('👥');
  const [personIds, setPersonIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  return (
    <Modal open={open} onClose={onClose} title="New group">
      <div className="space-y-4">
        <div>
          <label className="label">Group name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Circle" autoFocus />
        </div>
        <div>
          <label className="label">Icon</label>
          <div className="flex flex-wrap gap-2">
            {['👥', '🏠', '🎓', '🏢', '✈️', '🎉'].map((i) => (
              <button key={i} className="chip text-lg px-3" data-selected={icon === i} onClick={() => setIcon(i)}>
                {i}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label">Members</label>
          <div className="flex flex-wrap gap-2">
            {people.map((p) => (
              <button
                key={p.id}
                className="chip"
                data-selected={personIds.includes(p.id)}
                onClick={() => setPersonIds((x) => (x.includes(p.id) ? x.filter((y) => y !== p.id) : [...x, p.id]))}
              >
                {p.avatar} {p.name}
              </button>
            ))}
          </div>
        </div>
        <div className="flex justify-end pt-1">
          <button
            className="btn btn-primary"
            disabled={busy || !name.trim()}
            onClick={async () => {
              setBusy(true);
              await api.post('/api/groups', { name, icon, personIds });
              setName('');
              setPersonIds([]);
              setBusy(false);
              onDone();
            }}
          >
            Create group
          </button>
        </div>
      </div>
    </Modal>
  );
}
