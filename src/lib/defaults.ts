/** Seeded for every new account. Nothing here is hard-coded into the UI —
 *  these are just starting rows the user can rename, reorder or disable. */

export const DEFAULT_CATEGORIES = [
  { name: 'Bills / Recharge', slug: 'bills-recharge', icon: 'bill', color: '#f59f0a', kind: 'expense' },
  { name: 'Ciggs / Alc', slug: 'ciggs-alc', icon: 'smoke', color: '#e03e52', kind: 'expense' },
  { name: 'Outside Food', slug: 'outside-food', icon: 'food', color: '#f2683c', kind: 'expense' },
  { name: 'Fruits / Veggies', slug: 'fruits-veggies', icon: 'veg', color: '#12a06a', kind: 'expense' },
  { name: 'Shopping', slug: 'shopping', icon: 'shop', color: '#8b5cf6', kind: 'expense' },
  { name: 'Transport', slug: 'transport', icon: 'transport', color: '#0ea5b7', kind: 'expense' },
  { name: 'Misc', slug: 'misc', icon: 'misc', color: '#64748b', kind: 'expense' },
  { name: 'Investment', slug: 'investment', icon: 'invest', color: '#4056f4', kind: 'investment' },
] as const;

/** Only "Me" is created automatically — everyone else is the user's to add. */
export const DEFAULT_PEOPLE = [
  { name: 'Me', relationshipType: 'self', avatar: '', color: '#4056f4', isSelf: true },
] as const;

export const RELATIONSHIP_TYPES = ['self', 'family', 'friend', 'other'] as const;

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'category';
}

/** Deterministic palette used when the user doesn't pick a color. */
/** Muted, ink-and-earth tones that coexist with brass rather than shout over it. */
export const PALETTE = [
  '#4056f4', '#f2683c', '#12a06a', '#e03e52', '#8b5cf6',
  '#0ea5b7', '#f59f0a', '#ec4899', '#6366f1', '#64748b',
];

export function pickColor(index: number): string {
  return PALETTE[index % PALETTE.length];
}
