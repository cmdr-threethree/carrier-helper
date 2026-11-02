import { describe, expect, it } from 'vitest';
import {
  cooldownRemaining,
  isCoolingDown,
  nextAllowedAfterRateLimit,
  reserveSyncSlot,
} from '../src/capi/cooldown';

describe('sync cooldown', () => {
  it('reserves exactly fifteen minutes', () => {
    const now = 1_800_000_000_000;
    expect(reserveSyncSlot(now)).toBe(now + 15 * 60 * 1000);
    expect(cooldownRemaining(reserveSyncSlot(now), now)).toBe(15 * 60 * 1000);
    expect(isCoolingDown(reserveSyncSlot(now), now)).toBe(true);
  });

  it('reports ready after the target', () => {
    expect(cooldownRemaining(100, 101)).toBe(0);
    expect(isCoolingDown(undefined, 101)).toBe(false);
  });

  it('honours a longer Retry-After', () => {
    const now = 1_000;
    expect(nextAllowedAfterRateLimit(60_000, now + 900_000, now)).toBe(now + 900_000);
    expect(nextAllowedAfterRateLimit(1_200_000, now + 900_000, now)).toBe(now + 1_200_000);
  });
});
