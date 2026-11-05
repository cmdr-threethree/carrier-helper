import { ensureFreshAccessToken, refreshAccountTokens } from './auth/tokens';
import { fetchFleetCarrier } from './capi/client';
import { reserveSyncSlot, cooldownRemaining, nextAllowedAfterRateLimit } from './capi/cooldown';
import { extractCargoPoints, extractMarketPoints } from './capi/extract';
import { summarizeCarrier } from './capi/summarize';
import type { FleetCarrierResponse, SummaryMetrics } from './capi/types';
import { config } from './config';
import { carrierDisplayName } from './lib/hex';
import { AppError, toAppError } from './lib/errors';
import { log } from './lib/log';
import { demoCarrierResponse } from './mock/demo';
import {
  commitSnapshotBundle,
  findCarrierByCallsign,
  getAccount,
  latestSnapshotForCarrier,
  saveAccount,
} from './storage/repos';
import { applyRetention } from './storage/retention';
import type {
  AccountRecord,
  CarrierRecord,
  SnapshotRecord,
  SummaryRecord,
  SyncState,
} from './storage/schema';

export type SyncResult =
  | {
      status: 'success';
      account: AccountRecord;
      carrier: CarrierRecord;
      summary: SummaryRecord;
    }
  | { status: 'no-carrier'; account: AccountRecord }
  | { status: 'cooldown'; account: AccountRecord; remainingMs: number }
  | { status: 'failed'; account: AccountRecord; error: AppError };

export interface SyncOptions {
  now?: () => number;
  fetchImpl?: typeof fetch;
}

function isDemo(account: AccountRecord): boolean {
  return account.platform === 'demo';
}

function isQuotaError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
  );
}

async function saveSyncState(
  account: AccountRecord,
  patch: Partial<SyncState>,
  now: number,
): Promise<AccountRecord> {
  const updated: AccountRecord = {
    ...account,
    sync: { ...account.sync, ...patch },
    updatedAt: now,
  };
  await saveAccount(updated);
  return updated;
}

async function persistSnapshot(
  account: AccountRecord,
  raw: FleetCarrierResponse,
  fetchedAt: number,
  httpStatus: number,
): Promise<{ account: AccountRecord; carrier: CarrierRecord; summary: SummaryRecord }> {
  const callsign = raw.name?.callsign?.trim();
  if (!callsign) {
    throw new AppError('invalid_data', 'The carrier response did not include a callsign.');
  }

  const now = fetchedAt;
  const existing = await findCarrierByCallsign(account.id, callsign);
  const metrics: SummaryMetrics = summarizeCarrier(raw);
  const carrierId = existing?.id ?? crypto.randomUUID();
  const carrier: CarrierRecord = {
    id: carrierId,
    accountId: account.id,
    callsign,
    vanityName: carrierDisplayName(raw.name),
    currentSystem: metrics.currentSystem,
    lastSnapshotId: null,
    lastSeenAt: now,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  const snapshot: SnapshotRecord = {
    id: crypto.randomUUID(),
    accountId: account.id,
    carrierId,
    fetchedAt: now,
    endpoint: '/fleetcarrier',
    httpStatus,
    size: new TextEncoder().encode(JSON.stringify(raw)).byteLength,
    raw,
  };
  carrier.lastSnapshotId = snapshot.id;

  const marketPoints = extractMarketPoints(raw, carrierId, account.id, now);
  const cargoPoints = extractCargoPoints(raw, carrierId, account.id, now);

  const summary: SummaryRecord = {
    id: crypto.randomUUID(),
    accountId: account.id,
    carrierId,
    fetchedAt: now,
    metrics,
  };

  const updatedAccount: AccountRecord = {
    ...account,
    carrierId,
    sync: {
      ...account.sync,
      lastSuccessAt: now,
      lastError: null,
    },
    updatedAt: now,
  };

  try {
    await commitSnapshotBundle({
      account: updatedAccount,
      carrier,
      snapshot,
      summary,
      marketPoints,
      cargoPoints,
    });
  } catch (error) {
    if (!isQuotaError(error)) throw error;
    await applyRetention(now);
    try {
      await commitSnapshotBundle({
        account: updatedAccount,
        carrier,
        snapshot,
        summary,
        marketPoints,
        cargoPoints,
      });
    } catch (retryError) {
      if (isQuotaError(retryError)) {
        throw new AppError('quota', 'Browser storage is full.', retryError);
      }
      throw retryError;
    }
  }

  void applyRetention(now).catch((error) => log.warn('Retention failed', error));

  return { account: updatedAccount, carrier, summary };
}

async function fetchAndStore(
  account: AccountRecord,
  reservedUntil: number,
  priorNextAllowedAt: number | undefined,
  options: SyncOptions,
): Promise<SyncResult> {
  const { now = Date.now, fetchImpl = fetch } = options;
  const tokens = account.tokens;
  if (!tokens) {
    return { status: 'failed', account, error: new AppError('auth', 'Reconnect required.') };
  }

  const result = await fetchFleetCarrier(tokens.accessToken, tokens.tokenType, {
    baseUrl: config.capiBase,
    language: config.language,
    fetchImpl,
    now,
  });

  if (result.kind === 'ok') {
    try {
      const stored = await persistSnapshot(account, result.data, result.fetchedAt, 200);
      return {
        status: 'success',
        account: stored.account,
        carrier: stored.carrier,
        summary: stored.summary,
      };
    } catch (error) {
      const appError = toAppError(error);
      const updated = await saveSyncState(account, { lastError: appError.message }, now());
      return { status: 'failed', account: updated, error: appError };
    }
  }

  if (result.kind === 'no-carrier') {
    const updated = await saveSyncState(
      account,
      {
        lastSuccessAt: result.fetchedAt,
        lastError: 'This account does not own a fleet carrier.',
      },
      result.fetchedAt,
    );
    const accountWithoutCarrier: AccountRecord = {
      ...updated,
      carrierId: null,
      updatedAt: result.fetchedAt,
    };
    await saveAccount(accountWithoutCarrier);
    return { status: 'no-carrier', account: accountWithoutCarrier };
  }

  if (result.kind === 'auth') {
    return { status: 'failed', account, error: new AppError('auth', result.message) };
  }

  if (result.kind === 'maintenance') {
    const updated = await saveSyncState(
      account,
      { lastError: 'Frontier CAPI is under maintenance.' },
      now(),
    );
    return {
      status: 'failed',
      account: updated,
      error: new AppError('maintenance', result.message),
    };
  }

  if (result.kind === 'rate-limited') {
    const at = now();
    const nextAllowedAt = nextAllowedAfterRateLimit(result.retryAfterMs, reservedUntil, at);
    const updated = await saveSyncState(
      account,
      { nextAllowedAt, lastError: 'Frontier rate limit reached.' },
      at,
    );
    return {
      status: 'failed',
      account: updated,
      error: new AppError('rate_limited', 'Frontier rate limit reached.'),
    };
  }

  if (result.kind === 'network') {
    const at = now();
    const updated = await saveSyncState(
      account,
      {
        nextAllowedAt: priorNextAllowedAt ?? 0,
        lastError: 'Network request failed.',
      },
      at,
    );
    return { status: 'failed', account: updated, error: toAppError(result.error) };
  }

  const updated = await saveSyncState(
    account,
    { lastError: result.message || `HTTP ${result.status}` },
    now(),
  );
  return {
    status: 'failed',
    account: updated,
    error: new AppError('server', result.message || `HTTP ${result.status}`),
  };
}

async function performSync(accountId: string, options: SyncOptions): Promise<SyncResult> {
  const { now = Date.now } = options;
  let account = await getAccount(accountId);
  if (!account) {
    throw new AppError('not_found', 'Account not found.');
  }

  const initialRemaining = cooldownRemaining(account.sync.nextAllowedAt, now());
  if (initialRemaining > 0) {
    return { status: 'cooldown', account, remainingMs: initialRemaining };
  }

  if (isDemo(account)) {
    const at = now();
    const reservedUntil = reserveSyncSlot(at);
    const priorNextAllowedAt = account.sync.nextAllowedAt;
    account = await saveSyncState(
      account,
      { lastAttemptAt: at, nextAllowedAt: reservedUntil },
      at,
    );
    try {
      const step = Math.floor((at - account.createdAt) / (60 * 60 * 1000));
      const raw = demoCarrierResponse(account.id, at, Math.max(0, step));
      const stored = await persistSnapshot(account, raw, at, 200);
      return {
        status: 'success',
        account: stored.account,
        carrier: stored.carrier,
        summary: stored.summary,
      };
    } catch (error) {
      const updated = await saveSyncState(
        account,
        { nextAllowedAt: priorNextAllowedAt ?? 0, lastError: 'Demo sync failed.' },
        now(),
      );
      return { status: 'failed', account: updated, error: toAppError(error) };
    }
  }

  if (!account.tokens || account.needsReauth) {
    return {
      status: 'failed',
      account,
      error: new AppError('auth', 'This account needs to be reconnected.'),
    };
  }

  try {
    account = await ensureFreshAccessToken(account, false, {
      fetchImpl: options.fetchImpl,
      now,
    });
  } catch (error) {
    const updated = (await getAccount(accountId)) ?? account;
    return { status: 'failed', account: updated, error: toAppError(error) };
  }

  const at = now();
  const priorNextAllowedAt = account.sync.nextAllowedAt;
  const reservedUntil = reserveSyncSlot(at);
  account = await saveSyncState(
    account,
    { lastAttemptAt: at, nextAllowedAt: reservedUntil },
    at,
  );

  let result = await fetchAndStore(account, reservedUntil, priorNextAllowedAt, options);
  if (result.status === 'failed' && result.error.code === 'auth') {
    try {
      const refreshed = await refreshAccountTokens(result.account, {
        fetchImpl: options.fetchImpl,
        now,
      });
      result = await fetchAndStore(refreshed, reservedUntil, priorNextAllowedAt, options);
    } catch (error) {
      // refreshAccountTokens may have persisted needsReauth = true before
      // throwing; re-read so this update does not overwrite that flag.
      const fresh = (await getAccount(accountId)) ?? result.account;
      const updated = await saveSyncState(
        fresh,
        { lastError: 'Reconnect required.' },
        now(),
      );
      return { status: 'failed', account: updated, error: toAppError(error) };
    }
    if (result.status === 'failed' && result.error.code === 'auth') {
      const updated: AccountRecord = {
        ...result.account,
        needsReauth: true,
        updatedAt: now(),
      };
      await saveAccount(updated);
      return { status: 'failed', account: updated, error: result.error };
    }
  }

  return result;
}

export async function syncAccount(
  accountId: string,
  options: SyncOptions = {},
): Promise<SyncResult> {
  const run = () => performSync(accountId, options);
  const lockManager =
    typeof navigator !== 'undefined' && 'locks' in navigator ? navigator.locks : undefined;
  if (lockManager) {
    return lockManager.request(`carrier-helper:capi:${accountId}`, run);
  }
  return run();
}

export async function refreshCarrierSnapshot(
  accountId: string,
): Promise<SnapshotRecord | null> {
  const account = await getAccount(accountId);
  if (!account?.carrierId) return null;
  return latestSnapshotForCarrier(account.carrierId);
}
