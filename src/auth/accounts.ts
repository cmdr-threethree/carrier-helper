import { config } from '../config';
import { AppError } from '../lib/errors';
import { createDemoAccount } from '../mock/demo';
import { deleteAccount, getAccount, saveAccount } from '../storage/repos';
import {
  emptySyncState,
  type AccountRecord,
  type TokenSet,
} from '../storage/schema';
import { beginAuth, handleAuthCallback, type AuthOptions, type PendingAuth } from './oauth';

export function accountLabel(account: AccountRecord): string {
  return account.displayName || `Frontier account ${account.id}`;
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

export async function connectAccount(displayName?: string): Promise<AccountRecord | null> {
  const label = displayName?.trim() || undefined;
  if (config.mockAuth) {
    return createDemoAccount(Date.now(), label);
  }
  await beginAuth({ mode: 'add', label });
  return null;
}

export async function renameAccount(
  accountId: string,
  displayName: string,
): Promise<AccountRecord> {
  const name = displayName.trim();
  if (!name) {
    throw new AppError('invalid_data', 'Commander name cannot be empty.');
  }
  if (name.length > 80) {
    throw new AppError('invalid_data', 'Commander name is too long.');
  }
  const account = await getAccount(accountId);
  if (!account) {
    throw new AppError('not_found', 'Account not found.');
  }
  const updated: AccountRecord = {
    ...account,
    displayName: name,
    updatedAt: Date.now(),
  };
  await saveAccount(updated);
  return updated;
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
  displayName?: string;
  tokens: TokenSet;
  now: number;
}

async function upsertAuthorizedAccount(input: UpsertAuthInput): Promise<AccountRecord> {
  const existing = await getAccount(input.customerId);
  if (existing) {
    const updated: AccountRecord = {
      ...existing,
      platform: input.platform,
      // Adding/re-authorizing an existing account must not overwrite a name
      // the user chose later.
      displayName:
        existing.displayName ||
        input.displayName ||
        `Frontier account ${input.customerId}`,
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
    displayName: input.displayName || `Frontier account ${input.customerId}`,
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
    displayName: result.pending.label,
    tokens: result.tokens,
    now,
  });
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
