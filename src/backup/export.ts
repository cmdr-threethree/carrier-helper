import type {
  AccountRecord,
  CarrierRecord,
  SnapshotRecord,
  SummaryRecord,
} from '../storage/schema';
import {
  allSnapshots,
  allSummaries,
  listAccounts,
  listAllCarriers,
  snapshotsForCarrier,
} from '../storage/repos';
import type { BackupAccount, BackupCarrier, BackupSnapshot, BackupSummary, BackupV1 } from './validate';

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

export async function exportAllData(): Promise<BackupV1> {
  const [accounts, carriers, snapshots, summaries] = await Promise.all([
    listAccounts(),
    listAllCarriers(),
    allSnapshots(),
    allSummaries(),
  ]);
  return {
    app: 'carrier-helper',
    schemaVersion: 1,
    exportedAt: Date.now(),
    accounts: accounts.map(exportAccount),
    carriers: carriers.map(exportCarrier),
    snapshots: snapshots.map(exportSnapshot),
    summaries: summaries.map(exportSummary),
  };
}

export async function exportCarrierData(
  accountId: string,
  carrierId: string,
): Promise<BackupV1> {
  const accounts = await listAccounts();
  const account = accounts.find((candidate) => candidate.id === accountId);
  if (!account) throw new Error('Account not found.');

  const carriers = (await listAllCarriers()).filter(
    (carrier) => carrier.accountId === accountId && carrier.id === carrierId,
  );
  const snapshots = await snapshotsForCarrier(carrierId);
  const summaries = (await allSummaries()).filter(
    (summary) => summary.accountId === accountId && summary.carrierId === carrierId,
  );

  return {
    app: 'carrier-helper',
    schemaVersion: 1,
    exportedAt: Date.now(),
    accounts: [exportAccount(account)],
    carriers: carriers.map(exportCarrier),
    snapshots: snapshots.map(exportSnapshot),
    summaries: summaries.map(exportSummary),
  };
}

export function backupFilename(now = new Date()): string {
  const date = now.toISOString().slice(0, 10);
  return `carrier-helper-backup-${date}.json`;
}

export function downloadBackup(backup: BackupV1, filename = backupFilename()): void {
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
