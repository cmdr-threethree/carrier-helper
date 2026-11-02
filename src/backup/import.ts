import type { FleetCarrierResponse, SummaryMetrics } from '../capi/types';
import { config } from '../config';
import { AppError } from '../lib/errors';
import {
  clearDataStores,
  findCarrierByCallsign,
  getAccount,
  getCarrier,
  listAccounts,
  putSnapshotIfAbsent,
  putSummaryIfAbsent,
  saveAccount,
  saveCarrierIfAbsent,
} from '../storage/repos';
import { applyRetention } from '../storage/retention';
import {
  emptySyncState,
  type AccountRecord,
  type CarrierRecord,
  type SnapshotRecord,
  type SummaryRecord,
} from '../storage/schema';
import { safeValidateBackup, type BackupV1 } from './validate';

export type ImportMode = 'merge' | 'replace';

export interface ImportPreview {
  accounts: number;
  carriers: number;
  snapshots: number;
  summaries: number;
  earliest?: number;
  latest?: number;
}

export interface ImportResult extends ImportPreview {
  mode: ImportMode;
  importedAccounts: number;
  importedCarriers: number;
  importedSnapshots: number;
  importedSummaries: number;
  skipped: number;
}

export function previewBackup(backup: BackupV1): ImportPreview {
  let earliest = Number.POSITIVE_INFINITY;
  let latest = Number.NEGATIVE_INFINITY;
  for (const record of [...backup.snapshots, ...backup.summaries]) {
    if (!Number.isFinite(record.fetchedAt)) continue;
    if (record.fetchedAt < earliest) earliest = record.fetchedAt;
    if (record.fetchedAt > latest) latest = record.fetchedAt;
  }
  return {
    accounts: backup.accounts.length,
    carriers: backup.carriers.length,
    snapshots: backup.snapshots.length,
    summaries: backup.summaries.length,
    earliest: Number.isFinite(earliest) ? earliest : undefined,
    latest: Number.isFinite(latest) ? latest : undefined,
  };
}

export async function parseBackupFile(file: File): Promise<BackupV1> {
  if (file.size > config.importSizeLimitBytes) {
    throw new AppError('invalid_data', 'The backup file is too large.');
  }
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AppError('invalid_data', 'The backup file is not valid JSON.');
  }
  const result = safeValidateBackup(parsed);
  if (!result.ok) {
    throw new AppError('invalid_data', `Invalid backup: ${result.error}`);
  }
  return result.data;
}

function importedAccount(
  input: BackupV1['accounts'][number],
  existing: AccountRecord | undefined,
  now: number,
): AccountRecord {
  if (existing) {
    return {
      ...existing,
      displayName: input.displayName || existing.displayName,
      updatedAt: now,
    };
  }
  return {
    id: input.id,
    platform: input.platform,
    displayName: input.displayName,
    tokens: null,
    authorizedAt: 0,
    needsReauth: true,
    carrierId: null,
    sync: {
      ...emptySyncState(),
      lastSuccessAt: input.lastSuccessAt,
      nextAllowedAt: 0,
      lastError: null,
    },
    createdAt: now,
    updatedAt: now,
  };
}

export async function importBackup(
  backup: BackupV1,
  mode: ImportMode = 'merge',
  now = Date.now(),
): Promise<ImportResult> {
  const preview = previewBackup(backup);
  if (mode === 'replace') {
    await clearDataStores();
  }

  const existingAccounts = new Map(
    (await listAccounts()).map((account) => [account.id, account] as const),
  );
  const accountIds = new Set<string>();
  const carrierIdMap = new Map<string, string>();
  const seenAccounts = new Set<string>();
  let importedAccounts = 0;
  let importedCarriers = 0;
  let importedSnapshots = 0;
  let importedSummaries = 0;
  let skipped = 0;

  for (const input of backup.accounts) {
    if (seenAccounts.has(input.id)) {
      skipped += 1;
      continue;
    }
    seenAccounts.add(input.id);
    const existing = existingAccounts.get(input.id) ?? (await getAccount(input.id));
    const account = importedAccount(input, existing, now);
    if (!existing) importedAccounts += 1;
    accountIds.add(account.id);
    await saveAccount(account);
  }

  for (const input of backup.carriers) {
    if (!accountIds.has(input.accountId)) {
      skipped += 1;
      continue;
    }

    const existingById = await getCarrier(input.id);
    if (existingById) {
      carrierIdMap.set(input.id, existingById.id);
      skipped += 1;
      continue;
    }

    const existingCallsign = await findCarrierByCallsign(input.accountId, input.callsign);
    if (existingCallsign) {
      // Keep the local carrier identity and remap imported snapshots to it.
      carrierIdMap.set(input.id, existingCallsign.id);
      skipped += 1;
      continue;
    }

    const carrier: CarrierRecord = {
      id: input.id,
      accountId: input.accountId,
      callsign: input.callsign,
      vanityName: input.vanityName,
      currentSystem: input.currentSystem,
      lastSnapshotId: null,
      lastSeenAt: input.lastSeenAt,
      createdAt: input.createdAt ?? now,
      updatedAt: now,
    };
    if (await saveCarrierIfAbsent(carrier)) {
      importedCarriers += 1;
      carrierIdMap.set(input.id, carrier.id);
    } else {
      skipped += 1;
      const fallback = await findCarrierByCallsign(input.accountId, input.callsign);
      if (fallback) carrierIdMap.set(input.id, fallback.id);
    }
  }

  for (const input of backup.snapshots) {
    const carrierId = carrierIdMap.get(input.carrierId);
    if (!accountIds.has(input.accountId) || !carrierId) {
      skipped += 1;
      continue;
    }
    const raw = input.raw as FleetCarrierResponse;
    const snapshot: SnapshotRecord = {
      id: input.id,
      accountId: input.accountId,
      carrierId,
      fetchedAt: input.fetchedAt,
      endpoint: input.endpoint,
      httpStatus: input.httpStatus,
      size:
        input.size ??
        new TextEncoder().encode(JSON.stringify(input.raw ?? null)).byteLength,
      raw,
    };
    if (await putSnapshotIfAbsent(snapshot)) importedSnapshots += 1;
    else skipped += 1;
  }

  for (const input of backup.summaries) {
    const carrierId = carrierIdMap.get(input.carrierId);
    if (!accountIds.has(input.accountId) || !carrierId) {
      skipped += 1;
      continue;
    }
    const summary: SummaryRecord = {
      id: input.id,
      accountId: input.accountId,
      carrierId,
      fetchedAt: input.fetchedAt,
      metrics: input.metrics as unknown as SummaryMetrics,
    };
    if (await putSummaryIfAbsent(summary)) importedSummaries += 1;
    else skipped += 1;
  }

  await applyRetention(now);

  return {
    ...preview,
    mode,
    importedAccounts,
    importedCarriers,
    importedSnapshots,
    importedSummaries,
    skipped,
  };
}
