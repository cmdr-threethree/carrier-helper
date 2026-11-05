import { extractCargoPoints, extractMarketPoints } from '../capi/extract';
import type { FleetCarrierResponse, SummaryMetrics } from '../capi/types';
import { config } from '../config';
import { AppError } from '../lib/errors';
import {
  clearDataStores,
  findCarrierByCallsign,
  getAccount,
  getCarrier,
  listAccounts,
  putCargoDays,
  putCargoPoints,
  putMarketDays,
  putMarketPoints,
  putSnapshotIfAbsent,
  putSummaryIfAbsent,
  saveAccount,
  saveCarrierIfAbsent,
} from '../storage/repos';
import { applyRetention } from '../storage/retention';
import { invalidateStorageBreakdown } from '../storage/stats';
import {
  emptySyncState,
  type AccountRecord,
  type CargoDay,
  type CargoPoint,
  type CarrierRecord,
  type MarketDay,
  type MarketPoint,
  type SnapshotRecord,
  type SummaryRecord,
} from '../storage/schema';
import {
  normalizeBackup,
  safeValidateBackup,
  type Backup,
  type BackupInput,
} from './validate';

export type ImportMode = 'merge' | 'replace';

export interface ImportPreview {
  accounts: number;
  carriers: number;
  snapshots: number;
  summaries: number;
  marketPoints: number;
  cargoPoints: number;
  marketDays: number;
  cargoDays: number;
  earliest?: number;
  latest?: number;
}

export interface ImportResult extends ImportPreview {
  mode: ImportMode;
  importedAccounts: number;
  importedCarriers: number;
  importedSnapshots: number;
  importedSummaries: number;
  importedMarketPoints: number;
  importedCargoPoints: number;
  importedMarketDays: number;
  importedCargoDays: number;
  skipped: number;
}

export function previewBackup(backup: Backup): ImportPreview {
  let earliest = Number.POSITIVE_INFINITY;
  let latest = Number.NEGATIVE_INFINITY;
  for (const record of [
    ...backup.snapshots,
    ...backup.summaries,
    ...backup.marketPoints,
    ...backup.cargoPoints,
    ...backup.marketDays.map((day) => ({ fetchedAt: day.lastFetchedAt })),
    ...backup.cargoDays.map((day) => ({ fetchedAt: day.lastFetchedAt })),
  ]) {
    if (!Number.isFinite(record.fetchedAt)) continue;
    if (record.fetchedAt < earliest) earliest = record.fetchedAt;
    if (record.fetchedAt > latest) latest = record.fetchedAt;
  }
  return {
    accounts: backup.accounts.length,
    carriers: backup.carriers.length,
    snapshots: backup.snapshots.length,
    summaries: backup.summaries.length,
    marketPoints: backup.marketPoints.length,
    cargoPoints: backup.cargoPoints.length,
    marketDays: backup.marketDays.length,
    cargoDays: backup.cargoDays.length,
    earliest: Number.isFinite(earliest) ? earliest : undefined,
    latest: Number.isFinite(latest) ? latest : undefined,
  };
}

export async function parseBackupFile(file: File): Promise<Backup> {
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
  input: Backup['accounts'][number],
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

function pointSize(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export async function importBackup(
  input: BackupInput,
  mode: ImportMode = 'merge',
  now = Date.now(),
): Promise<ImportResult> {
  const backup = normalizeBackup(input);
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
  const derivedMarketPoints: MarketPoint[] = [];
  const derivedCargoPoints: CargoPoint[] = [];

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
    if (await putSnapshotIfAbsent(snapshot)) {
      importedSnapshots += 1;
      // v1 backups contain raw snapshots but no item history. Derive it here
      // so imported history starts immediately.
      derivedMarketPoints.push(
        ...extractMarketPoints(raw, carrierId, input.accountId, input.fetchedAt),
      );
      derivedCargoPoints.push(
        ...extractCargoPoints(raw, carrierId, input.accountId, input.fetchedAt),
      );
    } else {
      skipped += 1;
    }
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

  const marketPoints: MarketPoint[] = [...derivedMarketPoints];
  for (const input of backup.marketPoints) {
    const carrierId = carrierIdMap.get(input.carrierId);
    if (!accountIds.has(input.accountId) || !carrierId) {
      skipped += 1;
      continue;
    }
    const point: MarketPoint = {
      ...input,
      id: `${carrierId}:${encodeURIComponent(input.commodityKey)}:${input.fetchedAt}`,
      carrierId,
      size: input.size ?? pointSize(input),
    };
    marketPoints.push(point);
  }
  const uniqueMarketPoints = [
    ...new Map(marketPoints.map((point) => [point.id, point])).values(),
  ];
  await putMarketPoints(uniqueMarketPoints);

  const cargoPoints: CargoPoint[] = [...derivedCargoPoints];
  for (const input of backup.cargoPoints) {
    const carrierId = carrierIdMap.get(input.carrierId);
    if (!accountIds.has(input.accountId) || !carrierId) {
      skipped += 1;
      continue;
    }
    const point: CargoPoint = {
      ...input,
      id: `${carrierId}:${encodeURIComponent(input.commodityKey)}:${input.fetchedAt}`,
      carrierId,
      size: input.size ?? pointSize(input),
    };
    cargoPoints.push(point);
  }
  const uniqueCargoPoints = [
    ...new Map(cargoPoints.map((point) => [point.id, point])).values(),
  ];
  await putCargoPoints(uniqueCargoPoints);

  const marketDays: MarketDay[] = [];
  for (const input of backup.marketDays) {
    const carrierId = carrierIdMap.get(input.carrierId);
    if (!accountIds.has(input.accountId) || !carrierId) {
      skipped += 1;
      continue;
    }
    marketDays.push({
      ...input,
      id: `${carrierId}:${encodeURIComponent(input.commodityKey)}:${input.dayStart}`,
      carrierId,
      size: input.size ?? pointSize(input),
    });
  }
  await putMarketDays(marketDays);

  const cargoDays: CargoDay[] = [];
  for (const input of backup.cargoDays) {
    const carrierId = carrierIdMap.get(input.carrierId);
    if (!accountIds.has(input.accountId) || !carrierId) {
      skipped += 1;
      continue;
    }
    cargoDays.push({
      ...input,
      id: `${carrierId}:${encodeURIComponent(input.commodityKey)}:${input.dayStart}`,
      carrierId,
      size: input.size ?? pointSize(input),
    });
  }
  await putCargoDays(cargoDays);

  await applyRetention(now);
  await invalidateStorageBreakdown();

  return {
    ...preview,
    mode,
    importedAccounts,
    importedCarriers,
    importedSnapshots,
    importedSummaries,
    importedMarketPoints: uniqueMarketPoints.length,
    importedCargoPoints: uniqueCargoPoints.length,
    importedMarketDays: marketDays.length,
    importedCargoDays: cargoDays.length,
    skipped,
  };
}
