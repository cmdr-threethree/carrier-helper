import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { config } from '../src/config';
import { createDemoAccount } from '../src/mock/demo';
import { syncAccount } from '../src/sync';
import { resetDatabaseForTests } from '../src/storage/db';
import { getAccount, latestSnapshotForCarrier, listAccounts, saveAccount } from '../src/storage/repos';
import { makeAccount } from './helpers';

describe('demo sync', () => {
  const now = 1_900_000_000_000;

  beforeEach(async () => {
    await resetDatabaseForTests();
  });

  afterEach(async () => {
    await resetDatabaseForTests();
  });

  it('creates demo history and respects the cooldown', async () => {
    const account = await createDemoAccount(now);
    expect(await listAccounts()).toHaveLength(1);
    expect(account.carrierId).toBeTruthy();

    const first = await syncAccount(account.id, { now: () => now });
    expect(first.status).toBe('success');
    if (first.status === 'success') {
      expect(first.carrier.callsign).toBe('DMO-001');
      expect(first.summary.metrics.balance).toBeGreaterThan(0);
    }

    const second = await syncAccount(account.id, { now: () => now + 1_000 });
    expect(second.status).toBe('cooldown');

    const third = await syncAccount(account.id, { now: () => now + 15 * 60 * 1000 });
    expect(third.status).toBe('success');
    if (third.status === 'success' && account.carrierId) {
      expect(await latestSnapshotForCarrier(account.carrierId)).not.toBeNull();
    }
  });

  it('does not clear needsReauth when the token refresh is rejected', async () => {
    const mutableConfig = config as unknown as { clientId: string };
    const originalClientId = mutableConfig.clientId;
    mutableConfig.clientId = 'test-client';
    try {
      const account = makeAccount({
        tokens: {
          accessToken: 'access',
          refreshToken: 'refresh',
          tokenType: 'Bearer',
          accessExpiresAt: now + 60 * 60 * 1000,
        },
      });
      await saveAccount(account);

      const result = await syncAccount(account.id, {
        now: () => now,
        fetchImpl: async () => new Response('{}', { status: 401 }),
      });

      expect(result.status).toBe('failed');
      if (result.status === 'failed') expect(result.error.code).toBe('auth');
      expect((await getAccount(account.id))?.needsReauth).toBe(true);
    } finally {
      mutableConfig.clientId = originalClientId;
      await resetDatabaseForTests();
    }
  });
});
