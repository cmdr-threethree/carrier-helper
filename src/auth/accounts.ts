import { config } from '../config';
import { AppError } from '../lib/errors';
import { createDemoAccount } from '../mock/demo';
import { deleteAccount, getAccount, listAccounts, saveAccount } from '../storage/repos';
import {
  emptySyncState,
  type AccountRecord,
  type TokenSet,
} from '../storage/schema';
import { beginAuth, handleAuthCallback, type AuthOptions, type PendingAuth } from './oauth';

const SELECTED_KEY = 'carrier-helper.selected-account';

export function getSelectedAccountId(): string | null {
  try {
    return localStorage.getItem(SELECTED_KEY);
  } catch {
    return null;
  }
}

function writeSelectedAccountId(accountId: string | null): void {
  try {
    if (accountId) localStorage.setItem(SELECTED_KEY, accountId);
    else localStorage.removeItem(SELECTED_KEY);
  } catch {
    // Ignore unavailable localStorage.
  }
}

export function setSelectedAccountId(accountId: string | null): void {
  writeSelectedAccountId(accountId);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('carrier-helper:account-changed'));
  }
}

export function resolveSelectedAccount(
  accounts: AccountRecord[],
  preferred = getSelectedAccountId(),
): AccountRecord | null {
  if (!accounts.length) {
    if (preferred) writeSelectedAccountId(null);
    return null;
  }
  const match = preferred ? accounts.find((account) => account.id === preferred) : undefined;
  if (match) return match;
  const first = accounts[0] ?? null;
  if (first) writeSelectedAccountId(first.id);
  return first;
}

export function accountLabel(account: AccountRecord): string {
  return account.displayName || `Commander ${account.id}`;
}

export function isDemoAccount(account: AccountRecord): boolean {
  return account.platform === 'demo';
}

export function authorizationWarning(
  account: AccountRecord,
  now = Date.now(),
): string | null {
  if (!account.tokens || account.authorizedAt <= 0) return null;
  const days = Math.floor((now - account.authorizedAt) / (24 * 60 * 60 * 1000));
  if (days >= 25) {
    return 'Frontier authorization is 25 days old. Reconnect this account to renew access.';
  }
  if (days >= 21) {
    return `Frontier authorization is ${days} days old. Re-authorize soon to avoid interruption.`;
  }
  return null;
}

export async function connectAccount(): Promise<AccountRecord | null> {
  if (config.mockAuth) {
    const account = await createDemoAccount();
    setSelectedAccountId(account.id);
    return account;
  }
  await beginAuth({ mode: 'add' });
  return null;
}

export async function reauthAccount(accountId: string): Promise<void> {
  if (config.mockAuth) {
    throw new AppError('config', 'Demo accounts do not need re-authorization.');
  }
  await beginAuth({ mode: 'reauth', accountId });
}

interface UpsertAuthInput {
  customerId: string;
  platform: string;
  displayName: string;
  tokens: TokenSet;
  now: number;
}

async function upsertAuthorizedAccount(input: UpsertAuthInput): Promise<AccountRecord> {
  const existing = await getAccount(input.customerId);
  if (existing) {
    const updated: AccountRecord = {
      ...existing,
      platform: input.platform,
      displayName: input.displayName || existing.displayName,
      tokens: input.tokens,
      authorizedAt: input.now,
      needsReauth: false,
      updatedAt: input.now,
    };
    await saveAccount(updated);
    return updated;
  }

  const account: AccountRecord = {
    id: input.customerId,
    platform: input.platform,
    displayName: input.displayName,
    tokens: input.tokens,
    authorizedAt: input.now,
    needsReauth: false,
    carrierId: null,
    sync: emptySyncState(),
    createdAt: input.now,
    updatedAt: input.now,
  };
  await saveAccount(account);
  return account;
}

export async function completeAuthCallback(
  options: AuthOptions = {},
): Promise<{ account: AccountRecord; pending: PendingAuth }> {
  const result = await handleAuthCallback(undefined, options);
  const now = (options.now ?? Date.now)();
  const account = await upsertAuthorizedAccount({
    customerId: result.customerId,
    platform: result.platform,
    displayName: result.displayName,
    tokens: result.tokens,
    now,
  });
  setSelectedAccountId(account.id);
  return { account, pending: result.pending };
}

export async function disconnectAccount(accountId: string): Promise<void> {
  const account = await getAccount(accountId);
  if (!account) return;
  const now = Date.now();
  await saveAccount({
    ...account,
    tokens: null,
    needsReauth: true,
    updatedAt: now,
  });
}

export async function deleteAccountData(accountId: string): Promise<void> {
  await deleteAccount(accountId);
  if (getSelectedAccountId() === accountId) {
    const remaining = await listAccounts();
    setSelectedAccountId(remaining[0]?.id ?? null);
  }
}

export async function markNeedsReauth(accountId: string): Promise<void> {
  const account = await getAccount(accountId);
  if (!account) return;
  await saveAccount({
    ...account,
    needsReauth: true,
    updatedAt: Date.now(),
  });
}

export function cleanAuthUrl(returnTo = '#/'): void {
  if (typeof window === 'undefined') return;
  const hash = returnTo.startsWith('#') ? returnTo : `#${returnTo}`;
  window.history.replaceState(null, '', `${window.location.pathname}${hash}`);
}
