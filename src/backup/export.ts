import type {
  AccountRecord,
  CargoDay,
  CargoPoint,
  CarrierRecord,
  MarketDay,
  MarketPoint,
  SnapshotRecord,
  SummaryRecord,
} from '../storage/schema';
import {
  allCargoDays,
  allCargoPoints,
  allMarketDays,
  allMarketPoints,
  allSnapshots,
  allSummaries,
  listAccounts,
  listAllCarriers,
  marketDaysForCarrier,
  marketPointsForCarrier,
  cargoDaysForCarrier,
  cargoPointsForCarrier,
  snapshotsForCarrier,
} from '../storage/repos';
import type {
  Backup,
  BackupAccount,
  BackupCargoDay,
  BackupCargoPoint,
  BackupCarrier,
  BackupMarketDay,
  BackupMarketPoint,
  BackupSnapshot,
  BackupSummary,
} from './validate';

function exportAccount(account: AccountRecord): BackupAccount {
  return {
    id: account.id,
    platform: account.platform,
    displayName: account.displayName,
    needsReauth: true,
    lastSuccessAt: account.sync.lastSuccessAt,
  };
}

function exportCarrier(carrier: CarrierRecord): BackupCarrier {
  return {
    id: carrier.id,
    accountId: carrier.accountId,
    callsign: carrier.callsign,
    vanityName: carrier.vanityName,
    currentSystem: carrier.currentSystem,
    lastSeenAt: carrier.lastSeenAt,
    createdAt: carrier.createdAt,
  };
}

function exportSnapshot(snapshot: SnapshotRecord): BackupSnapshot {
  return {
    id: snapshot.id,
    accountId: snapshot.accountId,
    carrierId: snapshot.carrierId,
    fetchedAt: snapshot.fetchedAt,
    endpoint: snapshot.endpoint,
    httpStatus: snapshot.httpStatus,
    size: snapshot.size,
    raw: snapshot.raw,
  };
}

function exportSummary(summary: SummaryRecord): BackupSummary {
  return {
    id: summary.id,
    accountId: summary.accountId,
    carrierId: summary.carrierId,
    fetchedAt: summary.fetchedAt,
    metrics: summary.metrics as unknown as Record<string, unknown>,
  };
}

function exportMarketPoint(point: MarketPoint): BackupMarketPoint {
  return { ...point, size: point.size };
}

function exportCargoPoint(point: CargoPoint): BackupCargoPoint {
  return { ...point, size: point.size };
}

function exportMarketDay(day: MarketDay): BackupMarketDay {
  return { ...day, size: day.size };
}

function exportCargoDay(day: CargoDay): BackupCargoDay {
  return { ...day, size: day.size };
}

export async function exportAllData(): Promise<Backup> {
  const [
    accounts,
    carriers,
    snapshots,
    summaries,
    marketPoints,
    cargoPoints,
    marketDays,
    cargoDays,
  ] = await Promise.all([
    listAccounts(),
    listAllCarriers(),
    allSnapshots(),
    allSummaries(),
    allMarketPoints(),
    allCargoPoints(),
    allMarketDays(),
    allCargoDays(),
  ]);
  return {
    app: 'carrier-helper',
    schemaVersion: 2,
    exportedAt: Date.now(),
    accounts: accounts.map(exportAccount),
    carriers: carriers.map(exportCarrier),
    snapshots: snapshots.map(exportSnapshot),
    summaries: summaries.map(exportSummary),
    marketPoints: marketPoints.map(exportMarketPoint),
    cargoPoints: cargoPoints.map(exportCargoPoint),
    marketDays: marketDays.map(exportMarketDay),
    cargoDays: cargoDays.map(exportCargoDay),
  };
}

export async function exportCarrierData(
  accountId: string,
  carrierId: string,
): Promise<Backup> {
  const accounts = await listAccounts();
  const account = accounts.find((candidate) => candidate.id === accountId);
  if (!account) throw new Error('Account not found.');

  const carriers = (await listAllCarriers()).filter(
    (carrier) => carrier.accountId === accountId && carrier.id === carrierId,
  );
  const [
    snapshots,
    summaries,
    marketPoints,
    cargoPoints,
    marketDays,
    cargoDays,
  ] = await Promise.all([
    snapshotsForCarrier(carrierId),
    allSummaries(),
    marketPointsForCarrier(carrierId),
    cargoPointsForCarrier(carrierId),
    marketDaysForCarrier(carrierId),
    cargoDaysForCarrier(carrierId),
  ]);
  const carrierSummaries = summaries.filter(
    (summary) => summary.accountId === accountId && summary.carrierId === carrierId,
  );

  return {
    app: 'carrier-helper',
    schemaVersion: 2,
    exportedAt: Date.now(),
    accounts: [exportAccount(account)],
    carriers: carriers.map(exportCarrier),
    snapshots: snapshots.map(exportSnapshot),
    summaries: carrierSummaries.map(exportSummary),
    marketPoints: marketPoints.map(exportMarketPoint),
    cargoPoints: cargoPoints.map(exportCargoPoint),
    marketDays: marketDays.map(exportMarketDay),
    cargoDays: cargoDays.map(exportCargoDay),
  };
}

export function backupFilename(now = new Date()): string {
  const date = now.toISOString().slice(0, 10);
  return `carrier-helper-backup-${date}.json`;
}

export function downloadBackup(backup: Backup, filename = backupFilename()): void {
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
