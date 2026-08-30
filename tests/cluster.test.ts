import { describe, it, expect } from 'vitest';
import { clusterTransactions } from '@/lib/cluster';
import type { Transaction } from '@/lib/transactions';

const cat = (id: string) => ({ id, name: id, icon: 'cash', color: '#000', kind: 'expense' });
const person = (id: string) => ({ id, name: id, color: '#000' });

let n = 0;
function tx(over: Partial<Transaction> = {}): Transaction {
  return {
    id: `t${n++}`,
    kind: 'expense',
    amountMinor: 1000,
    date: '2026-08-30',
    note: null,
    category: cat('ciggs'),
    people: [person('me')],
    ...over,
  };
}

describe('clustering a day', () => {
  it('folds identical rows and sums them', () => {
    const out = clusterTransactions([tx({ amountMinor: 3000 }), tx({ amountMinor: 1500 })]);

    expect(out).toHaveLength(1);
    expect(out[0].totalMinor).toBe(4500);
    expect(out[0].items).toHaveLength(2);
    expect(out[0].lead.amountMinor).toBe(3000);
  });

  it('keeps a single entry as a cluster of one', () => {
    const out = clusterTransactions([tx()]);
    expect(out).toHaveLength(1);
    expect(out[0].items).toHaveLength(1);
    expect(out[0].totalMinor).toBe(1000);
  });

  it('never merges different notes — they are the only thing telling them apart', () => {
    const out = clusterTransactions([tx({ note: 'Chai' }), tx({ note: 'Lunch' })]);
    expect(out).toHaveLength(2);
  });

  it('matches notes case- and whitespace-insensitively', () => {
    const out = clusterTransactions([tx({ note: 'Chai' }), tx({ note: '  chai ' })]);
    expect(out).toHaveLength(1);
  });

  it('separates different categories', () => {
    const out = clusterTransactions([tx(), tx({ category: cat('food') })]);
    expect(out).toHaveLength(2);
  });

  it('separates different kinds even when everything else matches', () => {
    const out = clusterTransactions([
      tx({ category: null, kind: 'lent' }),
      tx({ category: null, kind: 'borrowed' }),
    ]);
    expect(out).toHaveLength(2);
  });

  it('treats the set of people as unordered', () => {
    const a = tx({ people: [person('me'), person('sankalp')] });
    const b = tx({ people: [person('sankalp'), person('me')] });
    expect(clusterTransactions([a, b])).toHaveLength(1);
  });

  it('does not merge a subset of people with a superset', () => {
    const a = tx({ people: [person('me')] });
    const b = tx({ people: [person('me'), person('sankalp')] });
    expect(clusterTransactions([a, b])).toHaveLength(2);
  });

  it('separates an untagged row from a tagged one', () => {
    expect(clusterTransactions([tx({ people: [] }), tx()])).toHaveLength(2);
  });

  it('preserves the order each distinct row first appeared in', () => {
    const out = clusterTransactions([
      tx({ category: cat('a') }),
      tx({ category: cat('b') }),
      tx({ category: cat('a') }),
    ]);
    expect(out.map((c) => c.lead.category!.id)).toEqual(['a', 'b']);
  });

  it('conserves the total no matter how the rows fold', () => {
    const items = [
      tx({ amountMinor: 1500 }),
      tx({ amountMinor: 3000 }),
      tx({ category: cat('food'), amountMinor: 800 }),
      tx({ note: 'Chai', amountMinor: 200 }),
    ];
    const out = clusterTransactions(items);
    const before = items.reduce((s, t) => s + t.amountMinor, 0);
    const after = out.reduce((s, c) => s + c.totalMinor, 0);
    expect(after).toBe(before);
    expect(out.flatMap((c) => c.items)).toHaveLength(items.length);
  });

  it('returns nothing for an empty day', () => {
    expect(clusterTransactions([])).toEqual([]);
  });
});
