import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { accessTokenIsFresh, refreshAccountTokens } from '../src/auth/tokens';
import { config } from '../src/config';
import { resetDatabaseForTests } from '../src/storage/db';
import { getAccount, saveAccount } from '../src/storage/repos';
import { makeAccount } from './helpers';

describe('token refresh', () => {
  const mutableConfig = config as unknown as { clientId: string };
  const originalClientId = mutableConfig.clientId;

  beforeEach(async () => {
    mutableConfig.clientId = 'test-client';
    await resetDatabaseForTests();
  });

  afterEach(async () => {
    mutableConfig.clientId = originalClientId;
    await resetDatabaseForTests();
  });

  it('refreshes without a client secret and rotates the refresh token', async () => {
    const account = makeAccount({
      tokens: {
        accessToken: 'old-access',
        refreshToken: 'old-refresh',
        tokenType: 'Bearer',
        accessExpiresAt: 100,
      },
    });
    await saveAccount(account);

    let body = '';
    let url = '';
    const updated = await refreshAccountTokens(account, {
      now: () => 1_000_000,
      fetchImpl: async (input, init) => {
        url = String(input);
        body = String(init?.body ?? '');
        return new Response(
          JSON.stringify({
            access_token: 'new-access',
            refresh_token: 'new-refresh',
            token_type: 'Bearer',
            expires_in: 14_400,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      },
    });

    expect(url).toBe('https://auth.frontierstore.net/token');
    expect(body).toContain('grant_type=refresh_token');
    expect(body).toContain('client_id=test-client');
    expect(body).toContain('refresh_token=old-refresh');
    expect(body).not.toContain('client_secret');
    expect(updated.tokens?.accessToken).toBe('new-access');
    expect(updated.tokens?.refreshToken).toBe('new-refresh');
    expect(updated.tokens?.accessExpiresAt).toBe(1_000_000 + 14_400_000);
    expect((await getAccount(account.id))?.tokens?.refreshToken).toBe('new-refresh');
  });

  it('marks the account for re-authorization on 401', async () => {
    const account = makeAccount({
      tokens: {
        accessToken: 'old-access',
        refreshToken: 'old-refresh',
        tokenType: 'Bearer',
        accessExpiresAt: 100,
      },
    });
    await saveAccount(account);

    await expect(
      refreshAccountTokens(account, {
        fetchImpl: async () => new Response('{}', { status: 401 }),
      }),
    ).rejects.toMatchObject({ code: 'auth' });

    const stored = await getAccount(account.id);
    expect(stored?.needsReauth).toBe(true);
  });

  it('detects fresh access tokens with a safety skew', () => {
    const account = makeAccount({
      tokens: {
        accessToken: 'a',
        refreshToken: 'r',
        tokenType: 'Bearer',
        accessExpiresAt: 200_000,
      },
    });
    expect(accessTokenIsFresh(account, 100_000)).toBe(true);
    expect(accessTokenIsFresh(account, 199_500)).toBe(false);
    expect(accessTokenIsFresh(account, 250_000)).toBe(false);
  });
});
