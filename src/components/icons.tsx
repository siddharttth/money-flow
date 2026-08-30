/**
 * A small stroke-icon set, replacing emoji.
 *
 * Emoji dragged their own colour and cartoon style into a deliberately
 * restrained palette. These inherit currentColor, so a category renders in its
 * own colour and nothing fights the theme.
 *
 * Categories are user-created, so `icon` stores a KEY from this set. Values
 * from before the switch are emoji; LEGACY_EMOJI maps the seeded ones across
 * and anything unrecognised falls back to a neutral glyph.
 */

export type IconKey =
  | 'bill' | 'smoke' | 'food' | 'veg' | 'shop' | 'transport' | 'misc' | 'invest'
  | 'home' | 'health' | 'movie' | 'book' | 'fuel' | 'gift' | 'salon' | 'phone'
  | 'coffee' | 'pet' | 'travel' | 'cash';

const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

const PATHS: Record<IconKey, React.ReactNode> = {
  bill: <><path {...P} d="M6 3.5h12v17l-2.5-1.6-2.5 1.6-2.5-1.6L8 20.5 6 21z" /><path {...P} d="M9 8h6M9 12h6" /></>,
  smoke: <><rect {...P} x="3" y="13" width="14" height="4" rx="1" /><path {...P} d="M19 13v4M21.5 13v4M15 10.5c1.8-1 1.8-3 0-4M18.5 10.5c1.8-1.2 1.8-3.4 0-4.6" /></>,
  food: <><path {...P} d="M4 12a8 4 0 0116 0z" /><path {...P} d="M3.5 15h17M5 18h14a2 2 0 002-2H3a2 2 0 002 2z" /></>,
  veg: <><path {...P} d="M12 21c-4 0-6.5-3-6.5-6.5S8 8 12 8s6.5 3 6.5 6.5S16 21 12 21z" /><path {...P} d="M12 8V4M12 4c2 0 3.5-1 3.5-1M12 5c-1.6 0-3-.8-3-.8" /></>,
  shop: <><path {...P} d="M4.5 8h15l-1 12.5h-13z" /><path {...P} d="M8.5 8V6a3.5 3.5 0 017 0v2" /></>,
  transport: <><path {...P} d="M4 16.5v-4l2-5h12l2 5v4" /><path {...P} d="M4 16.5h16M4 16.5v2.5h3v-2.5M17 16.5V19h3v-2.5M7 12.5h10" /></>,
  misc: <><path {...P} d="M12 3.5l2.2 5.1 5.3.5-4 3.6 1.2 5.3L12 15.3 7.3 18l1.2-5.3-4-3.6 5.3-.5z" /></>,
  invest: <><path {...P} d="M3.5 18.5l5.5-6 4 3.5 7.5-8" /><path {...P} d="M15.5 8h5v5" /></>,
  home: <><path {...P} d="M3.5 10.5L12 3.5l8.5 7" /><path {...P} d="M5.5 9.5v11h13v-11" /><path {...P} d="M10 20.5v-6h4v6" /></>,
  health: <><path {...P} d="M12 5v14M5 12h14" /><rect {...P} x="3.5" y="3.5" width="17" height="17" rx="4" /></>,
  movie: <><rect {...P} x="3" y="5.5" width="18" height="13" rx="2" /><path {...P} d="M3 9.5h18M7.5 5.5l-2 4M13 5.5l-2 4M18.5 5.5l-2 4" /></>,
  book: <><path {...P} d="M4 4.5h6a3 3 0 013 3v12a2.5 2.5 0 00-2.5-2.5H4z" /><path {...P} d="M20 4.5h-6a3 3 0 00-3 3v12a2.5 2.5 0 012.5-2.5H20z" /></>,
  fuel: <><path {...P} d="M4.5 20.5v-15a2 2 0 012-2h5a2 2 0 012 2v15" /><path {...P} d="M3.5 20.5h11M6.5 8.5h5" /><path {...P} d="M13.5 9.5h3a1.5 1.5 0 011.5 1.5v5a1.5 1.5 0 003 0v-6l-2.5-2.5" /></>,
  gift: <><rect {...P} x="3.5" y="8.5" width="17" height="4" rx="1" /><path {...P} d="M5 12.5v8h14v-8M12 8.5v12" /><path {...P} d="M12 8.5S10.5 4 8.5 4a2 2 0 000 4.5zM12 8.5S13.5 4 15.5 4a2 2 0 010 4.5z" /></>,
  salon: <><path {...P} d="M6 4l9 12M18 4L9 16" /><circle {...P} cx="6.5" cy="18" r="2.5" /><circle {...P} cx="17.5" cy="18" r="2.5" /></>,
  phone: <><rect {...P} x="6" y="2.5" width="12" height="19" rx="2.5" /><path {...P} d="M10.5 5.5h3M11 18.5h2" /></>,
  coffee: <><path {...P} d="M4 8.5h13v6a4 4 0 01-4 4H8a4 4 0 01-4-4z" /><path {...P} d="M17 10h1.5a2.5 2.5 0 010 5H17M7 5.5V3.5M11 5.5V3.5" /></>,
  pet: <><circle {...P} cx="12" cy="15" r="4" /><circle {...P} cx="6" cy="9" r="2" /><circle {...P} cx="18" cy="9" r="2" /><circle {...P} cx="10" cy="6" r="2" /><circle {...P} cx="15" cy="6" r="2" /></>,
  travel: <><path {...P} d="M3 15l3-1 4 1.5 5-9 2.5 1-2.5 9.5 4-1 1.5 2-16 4z" /></>,
  cash: <><rect {...P} x="2.5" y="6" width="19" height="12" rx="2" /><circle {...P} cx="12" cy="12" r="2.5" /><path {...P} d="M6 12h.01M18 12h.01" /></>,
};

export const ICON_KEYS = Object.keys(PATHS) as IconKey[];

/** Seeded emoji from before the icon set, so existing categories keep meaning. */
const LEGACY_EMOJI: Record<string, IconKey> = {
  '🧾': 'bill', '🚬': 'smoke', '🍔': 'food', '🥦': 'veg', '🛍️': 'shop', '🛍': 'shop',
  '🚕': 'transport', '✨': 'misc', '📈': 'invest', '💸': 'cash', '🏠': 'home',
  '💊': 'health', '🎬': 'movie', '📚': 'book', '⛽': 'fuel', '🎁': 'gift', '💇': 'salon',
  '☕': 'coffee', '🐕': 'pet', '✈️': 'travel', '📱': 'phone',
};

export function resolveIcon(value: string | null | undefined): IconKey {
  if (!value) return 'cash';
  if (value in PATHS) return value as IconKey;
  return LEGACY_EMOJI[value] ?? 'cash';
}

export function Icon({ name, size = 20, className = '' }: { name: IconKey; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      {PATHS[name]}
    </svg>
  );
}

/** A category's icon in its own colour, on a tinted square. */
export function CategoryIcon({
  icon,
  color,
  size = 36,
}: {
  icon: string | null | undefined;
  color: string;
  size?: number;
}) {
  return (
    <span
      className="inline-flex items-center justify-center shrink-0 rounded-lg"
      style={{
        width: size,
        height: size,
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        color,
        border: `1px solid color-mix(in srgb, ${color} 26%, transparent)`,
      }}
    >
      <Icon name={resolveIcon(icon)} size={Math.round(size * 0.55)} />
    </span>
  );
}

/**
 * People get initials rather than an emoji face — a name is more identifying
 * than a generic 🙂, and it scales to anyone the user adds.
 */
export function PersonMark({ name, color, size = 36 }: { name: string; color: string; size?: number }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  return (
    <span
      className="inline-flex items-center justify-center shrink-0 rounded-full font-semibold"
      style={{
        width: size,
        height: size,
        background: `color-mix(in srgb, ${color} 16%, transparent)`,
        color,
        border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
        fontSize: Math.round(size * 0.36),
        letterSpacing: '0.01em',
      }}
      aria-hidden
    >
      {initials || '?'}
    </span>
  );
}

/**
 * Navigation marks. Kept separate from the category set: those are chosen by
 * the user and render in a category's colour, these are fixed furniture and
 * always render in currentColor at a single weight.
 */
export type NavIconKey = 'dashboard' | 'ledger' | 'people' | 'analytics' | 'invest' | 'settings' | 'more' | 'plus';

const NAV_PATHS: Record<NavIconKey, React.ReactNode> = {
  dashboard: <><rect {...P} x="3.5" y="3.5" width="7" height="9" rx="1.5" /><rect {...P} x="3.5" y="15.5" width="7" height="5" rx="1.5" /><rect {...P} x="13.5" y="3.5" width="7" height="5" rx="1.5" /><rect {...P} x="13.5" y="11.5" width="7" height="9" rx="1.5" /></>,
  ledger: <><path {...P} d="M4 4.5h16v15H4z" /><path {...P} d="M8 4.5v15M11.5 9h5M11.5 13h5" /></>,
  people: <><circle {...P} cx="9" cy="8.5" r="3.5" /><path {...P} d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" /><path {...P} d="M16 5.6a3.5 3.5 0 010 5.8M17.5 14.9c2 .8 3.5 2.6 3.5 5.1" /></>,
  analytics: <><path {...P} d="M4 19.5h16" /><path {...P} d="M7 19.5v-6M12 19.5V6.5M17 19.5v-9" /></>,
  invest: <><path {...P} d="M4 19.5h16" /><path {...P} d="M4.5 15.5l5-5 3.5 3 6-7" /><path {...P} d="M14.5 6.5h4.5V11" /></>,
  settings: <><circle {...P} cx="12" cy="12" r="3" /><path {...P} d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6" /></>,
  more: <><circle cx="5" cy="12" r="1.7" fill="currentColor" /><circle cx="12" cy="12" r="1.7" fill="currentColor" /><circle cx="19" cy="12" r="1.7" fill="currentColor" /></>,
  plus: <><path {...P} d="M12 5.5v13M5.5 12h13" /></>,
};

export function NavIcon({ name, size = 20 }: { name: NavIconKey; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false">
      {NAV_PATHS[name]}
    </svg>
  );
}
