'use client';

import { Money } from './ui';
import { ShareBar } from './graph';
import { CategoryIcon, PersonMark } from './icons';

/**
 * The two dimensions of one transaction, rendered the same way.
 *
 * A category row and a person row share this component on purpose: they are
 * two slices of the same money, and giving them different visual weights would
 * suggest one is the "real" breakdown. The difference is stated in words
 * underneath the person list, not in the styling.
 *
 * The bar is scaled against the largest row rather than the grand total, so a
 * list where everything is small still has shape. The percentage next to it is
 * always of the grand total, which is the figure people actually mean.
 */
export function BreakdownList({
  items,
  onPick,
  showBar = true,
  max: maxOverride,
}: {
  items: {
    id: string;
    name: string;
    color: string;
    totalMinor: number;
    count?: number;
    /** Category icon key; people pass nothing and get their initials. */
    icon?: string | null;
    share?: number;
  }[];
  onPick?: (id: string) => void;
  showBar?: boolean;
  max?: number;
}) {
  const max = maxOverride ?? Math.max(1, ...items.map((i) => i.totalMinor));

  return (
    <ul className="flex flex-col">
      {items.map((it) => {
        const Tag = onPick ? 'button' : 'div';
        return (
          <li key={it.id}>
            <Tag
              {...(onPick ? { type: 'button' as const, onClick: () => onPick(it.id) } : {})}
              className="row w-full text-left flex items-center gap-3 px-2 py-2.5 rounded-lg"
            >
              {it.icon !== undefined ? (
                <CategoryIcon icon={it.icon} color={it.color} size={30} />
              ) : (
                <PersonMark name={it.name} color={it.color} size={30} />
              )}

              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px] font-medium truncate">{it.name}</span>
                  <Money minor={it.totalMinor} className="text-[13px] font-semibold shrink-0" />
                </span>
                {showBar && (
                  <span className="flex items-center gap-2 mt-1.5">
                    <span className="flex-1">
                      <ShareBar share={it.totalMinor / max} color={it.color} />
                    </span>
                    <span className="micro shrink-0 w-8 text-right">
                      {it.share != null ? `${Math.round(it.share * 100)}%` : it.count != null ? `×${it.count}` : ''}
                    </span>
                  </span>
                )}
              </span>
            </Tag>
          </li>
        );
      })}
    </ul>
  );
}
