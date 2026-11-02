import { config } from '../config';
import { AppError } from '../lib/errors';
import type { TokenSet } from '../storage/schema';
import { createCodeChallenge, createCodeVerifier, createState } from './pkce';

const PENDING_KEY = 'carrier-helper.oauth.pending';

export type AuthMode = 'add' | 'reauth';

export interface PendingAuth {
  state: string;
  verifier: string;
  mode: AuthMode;
  accountId?: string;
  returnTo: string;
  createdAt: number;
}

export interface AuthCallbackResult {
  customerId: string;
  platform: string;
  displayName: string;
  tokens: TokenSet;
  pending: PendingAuth;
}

export interface AuthOptions {
  fetchImpl?: typeof fetch;
  now?: () => number;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
}

interface MeResponse {
  customer_id?: string | number;
  platform?: string;
}

function getSessionStorage(): Storage {
  if (typeof sessionStorage === 'undefined') {
    throw new AppError('auth', 'Session storage is unavailable.');
  }
  return sessionStorage;
}

export function buildAuthorizationUrl(pending: PendingAuth, challenge: string): string {
  const url = new URL('/auth', config.authBase);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', config.scopes);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', pending.state);
  url.searchParams.set('redirect_uri', config.redirectUri);
  return url.toString();
}

export async function beginAuth(options: {
  mode: AuthMode;
  accountId?: string;
  returnTo?: string;
}): Promise<void> {
  if (!config.clientId) {
    throw new AppError('config', 'Frontier Client ID is not configured.');
  }
  if (!config.redirectUri) {
    throw new AppError('config', 'Frontier redirect URI is not configured.');
  }

  const verifier = createCodeVerifier();
  const state = createState();
  const pending: PendingAuth = {
    state,
    verifier,
    mode: options.mode,
    accountId: options.accountId,
    returnTo:
      options.returnTo ??
      (typeof window !== 'undefined' ? window.location.hash || '#/' : '#/'),
    createdAt: Date.now(),
  };

  getSessionStorage().setItem(PENDING_KEY, JSON.stringify(pending));
  const challenge = await createCodeChallenge(verifier);
  const url = buildAuthorizationUrl(pending, challenge);
  if (typeof window === 'undefined') {
    throw new AppError('auth', 'Authorization requires a browser.');
  }
  window.location.assign(url);
}

export function readPendingAuth(): PendingAuth | null {
  try {
    const raw = getSessionStorage().getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingAuth>;
    if (
      typeof parsed.state !== 'string' ||
      typeof parsed.verifier !== 'string' ||
      (parsed.mode !== 'add' && parsed.mode !== 'reauth')
    ) {
      return null;
    }
    const createdAt = typeof parsed.createdAt === 'number' ? parsed.createdAt : 0;
    if (createdAt > 0 && Date.now() - createdAt > 10 * 60 * 1000) return null;
    return {
      state: parsed.state,
      verifier: parsed.verifier,
      mode: parsed.mode,
      accountId: typeof parsed.accountId === 'string' ? parsed.accountId : undefined,
      returnTo: typeof parsed.returnTo === 'string' ? parsed.returnTo : '#/',
      createdAt,
    };
  } catch {
    return null;
  }
}

export function clearPendingAuth(): void {
  try {
    getSessionStorage().removeItem(PENDING_KEY);
  } catch {
    // Ignore unavailable session storage.
  }
}

async function exchangeAuthorizationCode(
  code: string,
  verifier: string,
  options: AuthOptions,
): Promise<TokenSet> {
  const { fetchImpl = fetch, now = Date.now } = options;
  const body = new URLSearchParams({
    redirect_uri: config.redirectUri,
    code,
    grant_type: 'authorization_code',
    code_verifier: verifier,
    client_id: config.clientId,
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

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new AppError(
      'auth',
      `Frontier rejected the authorization (HTTP ${response.status}). ${detail.slice(0, 200)}`,
    );
  }

  const token = (await response.json()) as TokenResponse;
  if (!token.access_token || !token.refresh_token) {
    throw new AppError('auth', 'Frontier returned an incomplete token response.');
  }

  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    tokenType: token.token_type || 'Bearer',
    accessExpiresAt: now() + (token.expires_in ?? 14_400) * 1000,
  };
}

async function fetchMe(
  tokens: TokenSet,
  options: AuthOptions,
): Promise<{ customerId: string; platform: string; displayName: string }> {
  const { fetchImpl = fetch } = options;
  let response: Response;
  try {
    response = await fetchImpl(new URL('/me', config.authBase).toString(), {
      headers: {
        Authorization: `${tokens.tokenType || 'Bearer'} ${tokens.accessToken}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
      credentials: 'omit',
    });
  } catch (error) {
    throw new AppError('network', 'Could not reach Frontier authorization.', error);
  }

  if (!response.ok) {
    throw new AppError('auth', `Frontier profile request failed (HTTP ${response.status}).`);
  }

  const me = (await response.json()) as MeResponse;
  const customerId =
    typeof me.customer_id === 'number' ? String(me.customer_id) : me.customer_id;
  if (!customerId) {
    throw new AppError('auth', 'Frontier did not return a customer ID.');
  }

  // Avoid storing real names/emails. Frontier does not return a cmdr name here,
  // so the stable customer ID is the least-PII label.
  return {
    customerId,
    platform: me.platform || 'frontier',
    displayName: `Commander ${customerId}`,
  };
}

export async function handleAuthCallback(
  search = typeof window !== 'undefined' ? window.location.search : '',
  options: AuthOptions = {},
): Promise<AuthCallbackResult> {
  const params = new URLSearchParams(search);
  const error = params.get('error');
  if (error) {
    clearPendingAuth();
    throw new AppError(
      'auth',
      params.get('error_description') || `Frontier authorization failed: ${error}`,
    );
  }

  const code = params.get('code');
  const state = params.get('state');
  if (!code || !state) {
    throw new AppError('auth', 'The authorization callback is missing its code or state.');
  }

  const pending = readPendingAuth();
  if (!pending) {
    throw new AppError(
      'auth',
      'No pending authorization was found. Start the connection again.',
    );
  }
  if (pending.state !== state) {
    clearPendingAuth();
    throw new AppError('auth', 'The authorization state did not match. Start again.');
  }

  clearPendingAuth();
  const tokens = await exchangeAuthorizationCode(code, pending.verifier, options);
  const me = await fetchMe(tokens, options);
  return { ...me, tokens, pending };
}
