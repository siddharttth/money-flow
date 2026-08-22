/** Seeded for every new account. Nothing here is hard-coded into the UI —
 *  these are just starting rows the user can rename, reorder or disable. */

export const DEFAULT_CATEGORIES = [
  { name: 'Bills / Recharge', slug: 'bills-recharge', icon: 'bill', color: '#c99a3f', kind: 'expense' },
  { name: 'Ciggs / Alc', slug: 'ciggs-alc', icon: 'smoke', color: '#a8443a', kind: 'expense' },
  { name: 'Outside Food', slug: 'outside-food', icon: 'food', color: '#c4643c', kind: 'expense' },
  { name: 'Fruits / Veggies', slug: 'fruits-veggies', icon: 'veg', color: '#5f8a5a', kind: 'expense' },
  { name: 'Shopping', slug: 'shopping', icon: 'shop', color: '#7d6098', kind: 'expense' },
  { name: 'Transport', slug: 'transport', icon: 'transport', color: '#4a7a96', kind: 'expense' },
  { name: 'Misc', slug: 'misc', icon: 'misc', color: '#6b7280', kind: 'expense' },
  { name: 'Investment', slug: 'investment', icon: 'invest', color: '#2f8f7d', kind: 'investment' },
] as const;

/** Only "Me" is created automatically — everyone else is the user's to add. */
export const DEFAULT_PEOPLE = [
  { name: 'Me', relationshipType: 'self', avatar: '', color: '#8a6a14', isSelf: true },
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
  '#b8862b', '#c4643c', '#5f8a5a', '#a8443a', '#7d6098',
  '#4a7a96', '#2f8f7d', '#c99a3f', '#a85a76', '#6b7280',
];

export function pickColor(index: number): string {
  return PALETTE[index % PALETTE.length];
}
