import { describe, expect, it } from 'vitest';
import {
  formatCompact,
  formatCredits,
  formatNumber,
  toFiniteNumber,
} from '../src/lib/format';

describe('numeric formatting', () => {
  it('coerces numeric strings from CAPI', () => {
    expect(toFiniteNumber('1725609459')).toBe(1_725_609_459);
    expect(toFiniteNumber('887')).toBe(887);
    expect(toFiniteNumber(' 42 ')).toBe(42);
    expect(toFiniteNumber(12.5)).toBe(12.5);
  });

  it('rejects invalid values', () => {
    expect(toFiniteNumber('')).toBeNull();
    expect(toFiniteNumber('   ')).toBeNull();
    expect(toFiniteNumber('abc')).toBeNull();
    expect(toFiniteNumber(Number.NaN)).toBeNull();
    expect(toFiniteNumber(Number.POSITIVE_INFINITY)).toBeNull();
    expect(toFiniteNumber(null)).toBeNull();
    expect(toFiniteNumber(undefined)).toBeNull();
  });

  it('formats numeric strings', () => {
    expect(formatNumber('887')).toBe('887');
    expect(formatCredits('887')).toBe('887 cr');
    expect(formatCompact('1725609459')).not.toBe('—');
    expect(formatNumber('not-a-number')).toBe('—');
    expect(formatCredits(null)).toBe('—');
  });
});
