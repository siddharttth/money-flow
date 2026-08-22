/** Seeded for every new account. Nothing here is hard-coded into the UI —
 *  these are just starting rows the user can rename, reorder or disable. */

export const DEFAULT_CATEGORIES = [
  { name: 'Bills / Recharge', slug: 'bills-recharge', icon: '🧾', color: '#f59e0b', kind: 'expense' },
  { name: 'Ciggs / Alc', slug: 'ciggs-alc', icon: '🚬', color: '#ef4444', kind: 'expense' },
  { name: 'Outside Food', slug: 'outside-food', icon: '🍔', color: '#f97316', kind: 'expense' },
  { name: 'Fruits / Veggies', slug: 'fruits-veggies', icon: '🥦', color: '#22c55e', kind: 'expense' },
  { name: 'Shopping', slug: 'shopping', icon: '🛍️', color: '#a855f7', kind: 'expense' },
  { name: 'Transport', slug: 'transport', icon: '🚕', color: '#3b82f6', kind: 'expense' },
  { name: 'Misc', slug: 'misc', icon: '✨', color: '#64748b', kind: 'expense' },
  { name: 'Investment', slug: 'investment', icon: '📈', color: '#14b8a6', kind: 'investment' },
] as const;

/** Only "Me" is created automatically — everyone else is the user's to add. */
export const DEFAULT_PEOPLE = [
  { name: 'Me', relationshipType: 'self', avatar: '🙋', color: '#6366f1', isSelf: true },
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
export const PALETTE = [
  '#6366f1', '#f97316', '#22c55e', '#ef4444', '#a855f7',
  '#3b82f6', '#14b8a6', '#f59e0b', '#ec4899', '#64748b',
];

export function pickColor(index: number): string {
  return PALETTE[index % PALETTE.length];
}
