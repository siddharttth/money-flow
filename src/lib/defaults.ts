/** Seeded for every new account. Nothing here is hard-coded into the UI —
 *  these are just starting rows the user can rename, reorder or disable. */

/*
 * PALETTE
 * -------
 * Every colour here is OKLCH L≈0.56 / C≈0.095 with only the hue changing, so
 * the whole set reads as one family: no single category can shout over the
 * others, and all ten hold up on cream and on near-black without a second
 * palette for dark mode. The earlier set was a stock UI rainbow at wildly
 * different lightnesses, which is why one category always looked louder than
 * the rest of the page.
 */
export const PALETTE = [
  '#4b8454', // forest
  '#a16241', // terracotta
  '#4678aa', // steel
  '#936d2b', // amber
  '#945f8f', // plum
  '#038586', // teal
  '#a55e55', // clay
  '#7a782f', // olive
  '#746aa8', // slate violet
  '#a35c6d', // rose
];

/** Neutral, for anything that should not claim a hue. */
export const NEUTRAL = '#6f7168';

export const DEFAULT_CATEGORIES = [
  { name: 'Bills / Recharge', slug: 'bills-recharge', icon: 'bill', color: '#4678aa', kind: 'expense' },
  { name: 'Ciggs / Alc', slug: 'ciggs-alc', icon: 'smoke', color: '#a55e55', kind: 'expense' },
  { name: 'Outside Food', slug: 'outside-food', icon: 'food', color: '#a16241', kind: 'expense' },
  { name: 'Fruits / Veggies', slug: 'fruits-veggies', icon: 'veg', color: '#4b8454', kind: 'expense' },
  { name: 'Shopping', slug: 'shopping', icon: 'shop', color: '#945f8f', kind: 'expense' },
  { name: 'Transport', slug: 'transport', icon: 'transport', color: '#038586', kind: 'expense' },
  { name: 'Misc', slug: 'misc', icon: 'misc', color: NEUTRAL, kind: 'expense' },
  { name: 'Investment', slug: 'investment', icon: 'invest', color: '#936d2b', kind: 'investment' },
] as const;

/** Only "Me" is created automatically — everyone else is the user's to add. */
export const DEFAULT_PEOPLE = [
  { name: 'Me', relationshipType: 'self', avatar: '', color: '#4b8454', isSelf: true },
] as const;

export const RELATIONSHIP_TYPES = ['self', 'family', 'friend', 'other'] as const;

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'category';
}

export function pickColor(index: number): string {
  return PALETTE[index % PALETTE.length];
}
