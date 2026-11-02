import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fetchFleetCarrier, parseRetryAfter } from '../src/capi/client';
import { resetDatabaseForTests } from '../src/storage/db';

function response(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

describe('CAPI client', () => {
  beforeEach(async () => {
    await resetDatabaseForTests();
  });

  afterEach(async () => {
    await resetDatabaseForTests();
  });

  it('returns carrier data on 200', async () => {
    const result = await fetchFleetCarrier('token', 'Bearer', {
      fetchImpl: async () => response({ name: { callsign: 'ABC-123' } }),
      now: () => 123,
    });
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.data.name?.callsign).toBe('ABC-123');
      expect(result.fetchedAt).toBe(123);
    }
  });

  it('maps 204 to no-carrier', async () => {
    const result = await fetchFleetCarrier('token', 'Bearer', {
      fetchImpl: async () => response(null, 204),
    });
    expect(result.kind).toBe('no-carrier');
  });

  it('maps 401 to auth', async () => {
    const result = await fetchFleetCarrier('token', 'Bearer', {
      fetchImpl: async () => response({ message: 'expired' }, 401),
    });
    expect(result.kind).toBe('auth');
  });

  it('maps 418 to maintenance', async () => {
    const result = await fetchFleetCarrier('token', 'Bearer', {
      fetchImpl: async () => response({ message: 'teapot' }, 418),
    });
    expect(result.kind).toBe('maintenance');
  });

  it('parses Retry-After for 429', async () => {
    const result = await fetchFleetCarrier('token', 'Bearer', {
      fetchImpl: async () => response({ message: 'slow down' }, 429, { 'Retry-After': '120' }),
      now: () => 1_000,
    });
    expect(result.kind).toBe('rate-limited');
    if (result.kind === 'rate-limited') expect(result.retryAfterMs).toBe(120_000);
  });

  it('returns network errors instead of throwing', async () => {
    const result = await fetchFleetCarrier('token', 'Bearer', {
      fetchImpl: async () => {
        throw new TypeError('offline');
      },
    });
    expect(result.kind).toBe('network');
  });

  it('parses Retry-After dates', () => {
    const now = Date.parse('2026-01-01T00:00:00Z');
    expect(parseRetryAfter('2026-01-01T00:01:00Z', now)).toBe(60_000);
    expect(parseRetryAfter('nope', now)).toBeNull();
  });
});
