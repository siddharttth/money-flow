'use client';

import { api } from '@/lib/client';
import { dayLabel } from '@/lib/dates';
import type { Transaction } from '@/lib/transactions';
import { Money } from './ui';
import { CategoryIcon, PersonMark } from './icons';
import { useInspector } from './inspector';
import { useShell } from './app-shell';

/**
 * One transaction, one row — the same row on the dashboard and in the ledger.
 *
 * Layout is deliberately two-line on a phone and one line on a desktop. The
 * amount is the only thing pinned right at every width, because scanning a
 * column of right-aligned monospace figures is the entire point of a ledger;
 * the tags wrap under the description rather than compete with it.
 */
export function TransactionRow({
  tx,
  showDate = false,
  onDelete,
  onFilterCategory,
  onFilterPerson,
}: {
  tx: Transaction;
  showDate?: boolean;
  /** Omitted on read-only lists like the dashboard's recent activity. */
  onDelete?: () => void;
  onFilterCategory?: (id: string) => void;
  onFilterPerson?: (id: string) => void;
}) {
  const { openPerson, openCategory } = useInspector();
  const { openAdd } = useShell();
  const isLedger = tx.kind !== 'expense';

  const title = tx.note || tx.category?.name || (tx.kind === 'lent' ? 'Money given' : 'Money received');
  // An untitled expense already shows its category as the title; repeating it
  // as a tag underneath was the same word twice on every second row.
  const showCategoryTag = !!tx.category && title !== tx.category.name;

  return (
    <div className="row group flex items-start gap-3 px-3.5 sm:px-4 py-3">
      {tx.category ? (
        <CategoryIcon icon={tx.category.icon} color={tx.category.color} size={34} />
      ) : (
        <span
          className="w-[34px] h-[34px] rounded-lg flex items-center justify-center shrink-0"
          style={{
            background: tx.kind === 'borrowed' ? 'var(--credit-soft)' : 'var(--rule-red-soft)',
            color: tx.kind === 'borrowed' ? 'var(--credit)' : 'var(--rule-red)',
          }}
          aria-hidden
        >
          <svg width="16" height="16" viewBox="0 0 24 24">
            <path
              d={tx.kind === 'borrowed' ? 'M12 5v14M6 13l6 6 6-6' : 'M12 19V5M6 11l6-6 6 6'}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p className="text-[13.5px] font-semibold truncate flex-1">{title}</p>
          <Money minor={tx.amountMinor} className="text-[13.5px] font-semibold shrink-0" />
        </div>

        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          {showDate && <span className="micro shrink-0">{dayLabel(tx.date)}</span>}
          {showCategoryTag && tx.category && (
            <button
              className="tag"
              title="Open category · shift-click to filter"
              onClick={(e) =>
                e.shiftKey && onFilterCategory ? onFilterCategory(tx.category!.id) : openCategory(tx.category!.id)
              }
            >
              {tx.category.name}
            </button>
          )}
          {tx.people.map((p) => (
            <button
              key={p.id}
              className="tag"
              title="Open person · shift-click to filter"
              onClick={(e) => (e.shiftKey && onFilterPerson ? onFilterPerson(p.id) : openPerson(p.id))}
            >
              <PersonMark name={p.name} color={p.color} size={14} />
              {p.name}
            </button>
          ))}
          {isLedger && (
            <span
              className="micro px-1.5 py-0.5 rounded"
              style={{
                background: tx.kind === 'borrowed' ? 'var(--credit-soft)' : 'var(--rule-red-soft)',
                color: tx.kind === 'borrowed' ? 'var(--credit)' : 'var(--rule-red)',
              }}
            >
              {tx.kind}
            </span>
          )}

          {/* Actions reveal on hover with a pointer, and are always present for
              touch — a hidden action on a phone is no action at all. */}
          {onDelete && (
            <span className="ml-auto flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity duration-150">
              {tx.kind === 'expense' && (
                <button
                  className="tag"
                  onClick={async () => {
                    const full = await api.get<never>(`/api/expenses/${tx.id}`);
                    openAdd(full);
                  }}
                >
                  Edit
                </button>
              )}
              <button className="tag" style={{ color: 'var(--rule-red)' }} onClick={onDelete}>
                Delete
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
