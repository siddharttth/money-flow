import type { Transaction } from './transactions';

/**
 * Folding a day's repeats into one row.
 *
 * Three ₹15 cigarette runs on the same day are one fact — "₹45 on cigarettes" —
 * printed three times. A paper ledger has the same problem and solves it with a
 * subtotal; this does it by clustering the rows and keeping the individual
 * entries one tap away, so nothing is hidden and nothing is repeated.
 *
 * WHAT COUNTS AS THE SAME THING
 * Two entries cluster only when every field the row displays is identical:
 * the kind, the category, the exact set of people, and the note. That last one
 * matters — "Chai" and "Lunch" both under Outside Food with Me are two
 * different purchases, and merging them would erase the only thing that told
 * them apart. Amount and id are deliberately not part of the key: differing
 * amounts are exactly what a cluster exists to add up.
 *
 * This is pure display grouping. It runs on rows that were already fetched,
 * never on a total: every figure elsewhere in the app still comes from SQL over
 * the individual rows.
 */

export type TxCluster = {
  /** Stable across renders for the same set of rows. */
  key: string;
  /** In feed order. Always at least one. */
  items: Transaction[];
  totalMinor: number;
  /** The row to render — the first entry, whose display fields all match. */
  lead: Transaction;
};

/** Everything the row shows, in a stable order. Amount and id excluded. */
function identityOf(t: Transaction): string {
  const people = t.people
    .map((p) => p.id)
    .sort()
    .join(',');
  const note = (t.note ?? '').trim().toLowerCase();
  return [t.kind, t.category?.id ?? '', people, note].join('|');
}

/**
 * Clusters one day's transactions, preserving the order in which each distinct
 * kind of row first appeared.
 */
export function clusterTransactions(items: Transaction[]): TxCluster[] {
  const byIdentity = new Map<string, TxCluster>();

  for (const t of items) {
    const id = identityOf(t);
    const found = byIdentity.get(id);
    if (found) {
      found.items.push(t);
      found.totalMinor += t.amountMinor;
    } else {
      byIdentity.set(id, { key: `${t.kind}-${t.id}`, items: [t], totalMinor: t.amountMinor, lead: t });
    }
  }

  return [...byIdentity.values()];
}
