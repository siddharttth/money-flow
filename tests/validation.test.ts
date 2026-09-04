import { describe, it, expect } from 'vitest';
import { createCategorySchema } from '@/lib/validation';
import { ICON_KEYS } from '@/components/icons';
import { monthsBetween } from '@/lib/dates';

describe('the category schema accepts the icons the app actually offers', () => {
  it('takes every key in the icon set', () => {
    for (const icon of ICON_KEYS) {
      const parsed = createCategorySchema.safeParse({ name: 'X', icon });
      expect(parsed.success, `icon "${icon}" (${icon.length} chars) was rejected`).toBe(true);
    }
  });

  it('takes the one that used to be too long', () => {
    // `transport` is nine characters against an eight-character cap left over
    // from when icons were emoji. Picking the car silently failed every save.
    expect(ICON_KEYS).toContain('transport');
    expect(createCategorySchema.safeParse({ name: 'Bike fund', icon: 'transport' }).success).toBe(true);
  });

  it('still refuses something absurd', () => {
    expect(createCategorySchema.safeParse({ name: 'X', icon: 'x'.repeat(64) }).success).toBe(false);
  });
});

describe('months between two dates', () => {
  it('counts a part month as one, so a goal is never quietly under-funded', () => {
    // Sep 5 to Aug 15 the following year: eleven whole months plus the part.
    expect(monthsBetween('2026-09-05', '2027-08-15')).toBe(12);
    expect(monthsBetween('2026-09-05', '2027-08-05')).toBe(12);
    // A day short of a whole month drops one.
    expect(monthsBetween('2026-09-05', '2027-08-04')).toBe(11);
  });

  it('is one for a target inside the current month, and never negative', () => {
    expect(monthsBetween('2026-09-05', '2026-09-30')).toBe(1);
    expect(monthsBetween('2026-09-05', '2026-01-01')).toBe(0);
  });
});
