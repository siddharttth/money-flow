'use client';

import type { ReactNode } from 'react';
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
  amountMinor,
  count = 1,
  onOpen,
  onDelete,
  onEdit,
  onFilterCategory,
  onFilterPerson,
}: {
  tx: Transaction;
  showDate?: boolean;
  /** The cluster's total, when this row stands for more than one entry. */
  amountMinor?: number;
  /** How many entries this row folds together. 1 means it is a plain row. */
  count?: number;
  /** Opens the cluster's individual entries. Required when count > 1. */
  onOpen?: () => void;
  /** Omitted on read-only lists like the dashboard's recent activity. */
  onDelete?: () => void;
  /** Editing a lent/borrowed entry. Expenses open the add sheet themselves. */
  onEdit?: () => void;
  onFilterCategory?: (id: string) => void;
  onFilterPerson?: (id: string) => void;
}) {
  const { openPerson, openCategory } = useInspector();
  const { openAdd } = useShell();
  const isLedger = tx.kind !== 'expense';

  const clustered = count > 1;
  const shown = amountMinor ?? tx.amountMinor;
  /*
   * Income sits in the same table and the same feed, so without this it reads
   * as a ₹52,000 expense — the single most alarming row the app could print.
   * Money arriving is green; a contribution is marked but stays neutral.
   */
  const incoming = tx.category?.kind === 'income';
  const investing = tx.category?.kind === 'investment';
  const title = tx.note || tx.category?.name || (tx.kind === 'lent' ? 'Money given' : 'Money received');
  // An untitled expense already shows its category as the title; repeating it
  // as a tag underneath was the same word twice on every second row.
  const showCategoryTag = !!tx.category && title !== tx.category.name;

  /*
   * A clustered row is itself pressable, and it contains pressable tags —
   * category, person, Edit, Delete. `<button>` inside `<button>` is invalid
   * HTML and React says so at hydration, so the inner ones are spans carrying
   * `role="button"` and keyboard handling instead. They behave identically and
   * nest legally.
   */
  const Tag = clustered ? 'button' : 'div';

  return (
    <Tag
      {...(clustered ? { type: 'button' as const, onClick: onOpen } : {})}
      className={`row group flex items-start gap-3 px-3.5 sm:px-4 py-3 ${clustered ? 'w-full text-left' : ''}`}
    >
      {tx.category ? (
        <CategoryIcon
          icon={tx.category.icon}
          color={incoming ? 'var(--credit)' : tx.category.color}
          size={34}
        />
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
          {clustered && (
            <span
              className="num text-[11px] font-semibold px-1.5 py-0.5 rounded shrink-0"
              style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}
              title={`${count} entries on this day`}
            >
              ×{count}
            </span>
          )}
          <Money
            minor={shown}
            className="text-[13.5px] font-semibold shrink-0"
            style={incoming ? { color: 'var(--credit)' } : undefined}
          />
        </div>

        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          {showDate && <span className="micro shrink-0">{dayLabel(tx.date)}</span>}
          {showCategoryTag && tx.category && (
            <PressableTag
              title="Open category · shift-click to filter"
              onPress={(shift) =>
                shift && onFilterCategory ? onFilterCategory(tx.category!.id) : openCategory(tx.category!.id)
              }
            >
              {tx.category.name}
            </PressableTag>
          )}
          {tx.people.map((p) => (
            <PressableTag
              key={p.id}
              title="Open person · shift-click to filter"
              onPress={(shift) => (shift && onFilterPerson ? onFilterPerson(p.id) : openPerson(p.id))}
            >
              <PersonMark name={p.name} color={p.color} size={14} />
              {p.name}
            </PressableTag>
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

          {/* Neither of these is spending, and a row that does not say so gets
              added up by the reader even when the app does not. */}
          {(incoming || investing) && (
            <span
              className="micro px-1.5 py-0.5 rounded"
              style={
                incoming
                  ? { background: 'var(--credit-soft)', color: 'var(--credit)' }
                  : { background: 'var(--surface-2)', color: 'var(--text-muted)' }
              }
            >
              {incoming ? 'income' : 'invested'}
            </span>
          )}

          {/* Actions reveal on hover with a pointer, and are always present for
              touch — a hidden action on a phone is no action at all. */}
          {/* The count already sits next to the amount, so this only has to
              say that the row opens. */}
          {clustered && (
            <span className="micro ml-auto" style={{ color: 'var(--accent)' }}>
              View →
            </span>
          )}

          {!clustered && onDelete && (
            <span className="reveal ml-auto flex items-center gap-1">
              {tx.kind === 'expense' && (
                <PressableTag
                  onPress={async () => {
                    const full = await api.get<never>(`/api/expenses/${tx.id}`);
                    openAdd(full);
                  }}
                >
                  Edit
                </PressableTag>
              )}
              {isLedger && onEdit && <PressableTag onPress={onEdit}>Edit</PressableTag>}
              <PressableTag tone="var(--rule-red)" onPress={onDelete}>
                Delete
              </PressableTag>
            </span>
          )}
        </div>
      </div>
    </Tag>
  );
}

/**
 * A `.tag` that presses, without being a `<button>`.
 *
 * These sit inside a row that is itself a button when its entries are
 * clustered, and nesting real buttons is invalid HTML — React raises a
 * hydration error for it. A span with `role="button"`, a tab stop and Enter
 * handling is the same control, legally nested. It also stops the click
 * reaching the row behind it.
 */
function PressableTag({
  children,
  onPress,
  title,
  tone,
}: {
  children: ReactNode;
  onPress: (shiftKey: boolean) => void;
  title?: string;
  tone?: string;
}) {
  return (
    <span
      role="button"
      tabIndex={0}
      title={title}
      className="tag"
      style={tone ? { color: tone } : undefined}
      onClick={(e) => {
        e.stopPropagation();
        onPress(e.shiftKey);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          onPress(e.shiftKey);
        }
      }}
    >
      {children}
    </span>
  );
}
