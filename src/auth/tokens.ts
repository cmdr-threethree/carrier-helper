import { config } from '../config';
import { AppError } from '../lib/errors';
import { saveAccount } from '../storage/repos';
import type { AccountRecord, TokenSet } from '../storage/schema';

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
}

export interface TokenOptions {
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export function accessTokenIsFresh(
  account: AccountRecord,
  now = Date.now(),
  skewMs = 60_000,
): boolean {
  return Boolean(account.tokens && account.tokens.accessExpiresAt > now + skewMs);
}

export async function refreshAccountTokens(
  account: AccountRecord,
  options: TokenOptions = {},
): Promise<AccountRecord> {
  const { fetchImpl = fetch, now = Date.now } = options;
  if (!account.tokens?.refreshToken) {
    throw new AppError('auth', 'No refresh token is stored for this account.');
  }
  if (!config.clientId) {
    throw new AppError('config', 'Frontier Client ID is not configured.');
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: config.clientId,
    refresh_token: account.tokens.refreshToken,
  });

  let response: Response;
  try {
    response = await fetchImpl(new URL('/token', config.authBase).toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      cache: 'no-store',
      credentials: 'omit',
    });
  } catch (error) {
    throw new AppError('network', 'Could not reach Frontier authorization.', error);
  }

  if (response.status === 400 || response.status === 401 || response.status === 403) {
    const updated: AccountRecord = {
      ...account,
      needsReauth: true,
      updatedAt: now(),
    };
    await saveAccount(updated);
    throw new AppError('auth', 'The Frontier refresh token is no longer valid.');
  }

  if (!response.ok) {
    throw new AppError('server', `Token refresh failed (HTTP ${response.status}).`);
  }

  const token = (await response.json()) as TokenResponse;
  if (!token.access_token) {
    throw new AppError('auth', 'Frontier returned an incomplete token response.');
  }

  const tokens: TokenSet = {
    accessToken: token.access_token,
    refreshToken: token.refresh_token || account.tokens.refreshToken,
    tokenType: token.token_type || account.tokens.tokenType || 'Bearer',
    accessExpiresAt: now() + (token.expires_in ?? 14_400) * 1000,
  };

  const updated: AccountRecord = {
    ...account,
    tokens,
    needsReauth: false,
    updatedAt: now(),
  };
  await saveAccount(updated);
  return updated;
}

export async function ensureFreshAccessToken(
  account: AccountRecord,
  force = false,
  options: TokenOptions = {},
): Promise<AccountRecord> {
  if (!account.tokens) {
    throw new AppError('auth', 'This account needs to be reconnected.');
  }
  if (!force && accessTokenIsFresh(account, (options.now ?? Date.now)())) {
    return account;
  }
  if (account.needsReauth) {
    throw new AppError('auth', 'This account needs to be reconnected.');
  }
  return refreshAccountTokens(account, options);
}
