'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { currentMonth, dayLabel, monthLabel, monthRange } from '@/lib/dates';
import { formatINR } from '@/lib/money';
import type { Expense, Person } from '@/lib/types';
import { Card, EmptyState, ErrorState, ListSkeleton, SectionTitle } from '@/components/ui';
import { MonthPicker } from '@/components/month-picker';
import { ShareBar } from '@/components/charts';
import { useShell } from '@/components/app-shell';
import { CategoryIcon, Icon, PersonMark, resolveIcon } from '@/components/icons';

type Detail = {
  person: Person;
  totalMinor: number;
  transactionCount: number;
  categories: { categoryId: string; name: string; icon: string; color: string; totalMinor: number; count: number }[];
  expenses: Expense[];
};

export default function PersonDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const search = useSearchParams();
  const { openAdd } = useShell();
  const [month, setMonth] = useState(search.get('month') ?? currentMonth());
  const [allTime, setAllTime] = useState(false);

  const { start, end } = monthRange(month);
  const range = allTime ? '' : `?start=${start}&end=${end}`;
  const { data, error, isLoading, mutate } = useSWR<Detail>(`/api/people/${id}/detail${range}`);

  if (error) return <ErrorState message={error.message} onRetry={() => mutate()} />;

  const maxCat = Math.max(1, ...(data?.categories ?? []).map((c) => c.totalMinor));

  return (
    <div className="space-y-5">
      <Link href="/people" className="muted text-sm inline-flex items-center gap-1">
        ‹ All people
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
              <p className="label">Associated spending</p>
              <p className="text-3xl font-semibold tabular">{formatINR(data.totalMinor)}</p>
              <p className="muted text-sm mt-1">
                {data.transactionCount} {data.transactionCount === 1 ? 'transaction' : 'transactions'} ·{' '}
                {allTime ? 'all time' : monthLabel(month)}
              </p>
            </div>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2">
              <button className="chip" data-selected={!allTime} onClick={() => setAllTime(false)}>
                Monthly
              </button>
              <button className="chip" data-selected={allTime} onClick={() => setAllTime(true)}>
                All time
              </button>
            </div>
            {!allTime && <MonthPicker month={month} onChange={setMonth} />}
          </div>

          <Card>
            <SectionTitle>Category breakdown</SectionTitle>
            {data.categories.length === 0 ? (
              <EmptyState icon="📭" title="No spending in this period" />
            ) : (
              <>
                <div className="space-y-3">
                  {data.categories.map((c) => (
                    <div key={c.categoryId}>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="flex items-center gap-2 min-w-0">
                          <Icon name={resolveIcon(c.icon)} size={16} />
                          <span className="truncate">{c.name}</span>
                          <span className="muted text-xs shrink-0">×{c.count}</span>
                        </span>
                        <span className="tabular font-medium shrink-0">{formatINR(c.totalMinor)}</span>
                      </div>
                      <ShareBar share={c.totalMinor / maxCat} color={c.color} />
                    </div>
                  ))}
                </div>
                <div
                  className="flex justify-between mt-4 pt-3 border-t text-sm font-semibold"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <span>Total</span>
                  <span className="tabular">{formatINR(data.totalMinor)}</span>
                </div>
              </>
            )}
          </Card>

          <Card>
            <SectionTitle>Expense history</SectionTitle>
            {data.expenses.length === 0 ? (
              <EmptyState icon="🧾" title="Nothing recorded yet" />
            ) : (
              <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {data.expenses.map((e) => (
                  <button key={e.id} onClick={() => openAdd(e)} className="w-full flex items-center gap-3 py-3 text-left">
                    <span className="muted text-xs w-14 shrink-0 tabular">{dayLabel(e.expenseDate)}</span>
                    <CategoryIcon icon={e.category.icon} color={e.category.color} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{e.category.name}</p>
                      {e.note && <p className="muted text-xs truncate">{e.note}</p>}
                    </div>
                    <span className="tabular font-medium text-sm shrink-0">{formatINR(e.amountMinor)}</span>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
