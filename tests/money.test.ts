import { describe, it, expect } from 'vitest';
import { toMinor, toMajor, sumToMinor, formatINR } from '@/lib/money';
import { monthRange, weekRange, shiftMonth, daysBetween, isValidISODate } from '@/lib/dates';

describe('money conversion', () => {
  it('round-trips without float drift', () => {
    for (const rupees of [800, 0.01, 1234.56, 484, 10000, 1620.5, 0.1 + 0.2]) {
      expect(toMajor(toMinor(rupees))).toBeCloseTo(rupees, 2);
    }
  });

  it('stores exact paise', () => {
    expect(toMinor(800)).toBe(80000);
    expect(toMinor(0.1 + 0.2)).toBe(30); // the classic 0.30000000000000004 case
    expect(toMinor(1234.56)).toBe(123456);
  });

  it('sums integers exactly where floats would drift', () => {
    const values = Array.from({ length: 1000 }, () => toMinor(0.1));
    expect(values.reduce((a, b) => a + b, 0)).toBe(10000); // exactly ₹100
  });

  it('normalises Postgres string sums', () => {
    expect(sumToMinor('80000')).toBe(80000);
    expect(sumToMinor(null)).toBe(0);
    expect(sumToMinor(undefined)).toBe(0);
  });

  it('formats Indian currency', () => {
    expect(formatINR(80000)).toContain('800');
    expect(formatINR(1000000, { compact: true })).toBe('₹10k');
  });
});

describe('date helpers', () => {
  it('computes month ranges including leap years', () => {
    expect(monthRange('2026-08')).toEqual({ start: '2026-08-01', end: '2026-08-31' });
    expect(monthRange('2026-02')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(monthRange('2024-02')).toEqual({ start: '2024-02-01', end: '2024-02-29' });
  });

  it('shifts months across year boundaries', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });

  it('builds Monday-start weeks', () => {
    // 2026-08-23 is a Sunday.
    expect(weekRange('2026-08-23')).toEqual({ start: '2026-08-17', end: '2026-08-23' });
  });

  it('counts days inclusively', () => {
    expect(daysBetween('2026-08-01', '2026-08-31')).toBe(31);
    expect(daysBetween('2026-08-23', '2026-08-23')).toBe(1);
  });

  it('validates dates', () => {
    expect(isValidISODate('2026-08-23')).toBe(true);
    expect(isValidISODate('2026-02-30')).toBe(false);
    expect(isValidISODate('23-08-2026')).toBe(false);
  });
});
