/**
 * All money crosses the API as a decimal number of rupees and is stored as an
 * integer number of paise. These two functions are the ONLY place that converts.
 */

export function toMinor(rupees: number): number {
  // Round through a string-free path that is stable for 2dp values.
  return Math.round((rupees + Number.EPSILON) * 100);
}

export function toMajor(minor: number): number {
  return minor / 100;
}

export function formatINR(minor: number, opts: { compact?: boolean; decimals?: boolean } = {}): string {
  const value = toMajor(minor);
  if (opts.compact && Math.abs(value) >= 100000) {
    return `₹${(value / 100000).toFixed(2).replace(/\.00$/, '')}L`;
  }
  if (opts.compact && Math.abs(value) >= 1000) {
    return `₹${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: opts.decimals ? 2 : 0,
    maximumFractionDigits: opts.decimals ? 2 : 0,
  }).format(value);
}

/** Postgres SUM() over integers returns a string (or null). Normalise it. */
export function sumToMinor(raw: unknown): number {
  if (raw === null || raw === undefined) return 0;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? Math.round(n) : 0;
}
