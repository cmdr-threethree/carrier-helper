import { getDb } from './db';
import type {
  AccountRecord,
  CarrierRecord,
  MetaRecord,
  SnapshotRecord,
  SummaryRecord,
} from './schema';

const MAX_TIME = Number.MAX_SAFE_INTEGER;

function accountTimeRange(accountId: string, from = 0, to = MAX_TIME): IDBKeyRange {
  return IDBKeyRange.bound([accountId, from], [accountId, to]);
}

function carrierTimeRange(carrierId: string, from = 0, to = MAX_TIME): IDBKeyRange {
  return IDBKeyRange.bound([carrierId, from], [carrierId, to]);
}

export async function listAccounts(): Promise<AccountRecord[]> {
  const db = await getDb();
  const accounts = await db.getAll('accounts');
  return accounts.sort((a, b) => a.createdAt - b.createdAt);
}

export async function getAccount(id: string): Promise<AccountRecord | undefined> {
  const db = await getDb();
  return db.get('accounts', id);
}

export async function saveAccount(account: AccountRecord): Promise<void> {
  const db = await getDb();
  await db.put('accounts', account);
}

export async function deleteAccount(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['accounts', 'carriers', 'snapshots', 'summaries'], 'readwrite');
  await tx.objectStore('accounts').delete(id);

  const carriers = tx.objectStore('carriers').index('by-account');
  let carrierCursor = await carriers.openCursor(IDBKeyRange.only(id));
  while (carrierCursor) {
    await carrierCursor.delete();
    carrierCursor = await carrierCursor.continue();
  }

  const snapshots = tx.objectStore('snapshots').index('by-account-time');
  let snapshotCursor = await snapshots.openCursor(accountTimeRange(id));
  while (snapshotCursor) {
    await snapshotCursor.delete();
    snapshotCursor = await snapshotCursor.continue();
  }

  const summaries = tx.objectStore('summaries').index('by-account-time');
  let summaryCursor = await summaries.openCursor(accountTimeRange(id));
  while (summaryCursor) {
    await summaryCursor.delete();
    summaryCursor = await summaryCursor.continue();
  }

  await tx.done;
}

export async function listCarriers(accountId: string): Promise<CarrierRecord[]> {
  const db = await getDb();
  const carriers = await db.getAllFromIndex('carriers', 'by-account', accountId);
  return carriers.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
}

export async function listAllCarriers(): Promise<CarrierRecord[]> {
  const db = await getDb();
  return db.getAll('carriers');
}

export async function getCarrier(id: string): Promise<CarrierRecord | undefined> {
  const db = await getDb();
  return db.get('carriers', id);
}

export async function findCarrierByCallsign(
  accountId: string,
  callsign: string,
): Promise<CarrierRecord | undefined> {
  const db = await getDb();
  return db.getFromIndex('carriers', 'by-account-callsign', [accountId, callsign]);
}

export async function saveCarrier(carrier: CarrierRecord): Promise<void> {
  const db = await getDb();
  await db.put('carriers', carrier);
}

export async function saveCarrierIfAbsent(carrier: CarrierRecord): Promise<boolean> {
  const db = await getDb();
  try {
    await db.add('carriers', carrier);
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'ConstraintError') return false;
    throw error;
  }
}

export async function latestSnapshotForCarrier(
  carrierId: string,
): Promise<SnapshotRecord | null> {
  const db = await getDb();
  const cursor = await db
    .transaction('snapshots')
    .store.index('by-carrier-time')
    .openCursor(carrierTimeRange(carrierId), 'prev');
  return cursor?.value ?? null;
}

export async function latestSnapshotForAccount(
  accountId: string,
): Promise<SnapshotRecord | null> {
  const db = await getDb();
  const cursor = await db
    .transaction('snapshots')
    .store.index('by-account-time')
    .openCursor(accountTimeRange(accountId), 'prev');
  return cursor?.value ?? null;
}

export async function getSnapshot(id: string): Promise<SnapshotRecord | undefined> {
  const db = await getDb();
  return db.get('snapshots', id);
}

export async function snapshotsForCarrier(
  carrierId: string,
  from = 0,
  to = MAX_TIME,
): Promise<SnapshotRecord[]> {
  const db = await getDb();
  return db.getAllFromIndex('snapshots', 'by-carrier-time', carrierTimeRange(carrierId, from, to));
}

export async function allSnapshots(): Promise<SnapshotRecord[]> {
  const db = await getDb();
  return db.getAll('snapshots');
}

export async function putSnapshotIfAbsent(snapshot: SnapshotRecord): Promise<boolean> {
  const db = await getDb();
  try {
    await db.add('snapshots', snapshot);
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'ConstraintError') return false;
    throw error;
  }
}

export async function deleteSnapshots(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const db = await getDb();
  const tx = db.transaction('snapshots', 'readwrite');
  await Promise.all(ids.map((id) => tx.store.delete(id)));
  await tx.done;
}

export async function latestSummaryForCarrier(
  carrierId: string,
): Promise<SummaryRecord | null> {
  const db = await getDb();
  const cursor = await db
    .transaction('summaries')
    .store.index('by-carrier-time')
    .openCursor(carrierTimeRange(carrierId), 'prev');
  return cursor?.value ?? null;
}

export async function latestSummaryForAccount(
  accountId: string,
): Promise<SummaryRecord | null> {
  const db = await getDb();
  const cursor = await db
    .transaction('summaries')
    .store.index('by-account-time')
    .openCursor(accountTimeRange(accountId), 'prev');
  return cursor?.value ?? null;
}

export async function summariesForCarrier(
  carrierId: string,
  from = 0,
  to = MAX_TIME,
): Promise<SummaryRecord[]> {
  const db = await getDb();
  return db.getAllFromIndex('summaries', 'by-carrier-time', carrierTimeRange(carrierId, from, to));
}

export async function summariesForAccount(
  accountId: string,
  from = 0,
  to = MAX_TIME,
): Promise<SummaryRecord[]> {
  const db = await getDb();
  return db.getAllFromIndex('summaries', 'by-account-time', accountTimeRange(accountId, from, to));
}

export async function allSummaries(): Promise<SummaryRecord[]> {
  const db = await getDb();
  return db.getAll('summaries');
}

export async function putSummaryIfAbsent(summary: SummaryRecord): Promise<boolean> {
  const db = await getDb();
  try {
    await db.add('summaries', summary);
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'ConstraintError') return false;
    throw error;
  }
}

export async function commitSnapshotBundle(input: {
  account: AccountRecord;
  carrier: CarrierRecord;
  snapshot: SnapshotRecord;
  summary: SummaryRecord;
}): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['accounts', 'carriers', 'snapshots', 'summaries'], 'readwrite');
  await Promise.all([
    tx.objectStore('accounts').put(input.account),
    tx.objectStore('carriers').put(input.carrier),
    tx.objectStore('snapshots').put(input.snapshot),
    tx.objectStore('summaries').put(input.summary),
  ]);
  await tx.done;
}

export async function getMeta<T = unknown>(key: string): Promise<T | undefined> {
  const db = await getDb();
  const record = await db.get('meta', key);
  return record?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  const db = await getDb();
  const record: MetaRecord = { key, value };
  await db.put('meta', record);
}

export async function clearDataStores(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['accounts', 'carriers', 'snapshots', 'summaries'], 'readwrite');
  await Promise.all([
    tx.objectStore('accounts').clear(),
    tx.objectStore('carriers').clear(),
    tx.objectStore('snapshots').clear(),
    tx.objectStore('summaries').clear(),
  ]);
  await tx.done;
}

export async function storageUsage(): Promise<{
  snapshotBytes: number;
  snapshotCount: number;
  summaryCount: number;
  carrierCount: number;
  accountCount: number;
}> {
  const db = await getDb();
  let snapshotBytes = 0;
  let snapshotCount = 0;
  const tx = db.transaction('snapshots');
  let cursor = await tx.store.openCursor();
  while (cursor) {
    snapshotBytes += cursor.value.size || 0;
    snapshotCount += 1;
    cursor = await cursor.continue();
  }
  const [summaryCount, carrierCount, accountCount] = await Promise.all([
    db.count('summaries'),
    db.count('carriers'),
    db.count('accounts'),
  ]);
  return { snapshotBytes, snapshotCount, summaryCount, carrierCount, accountCount };
}
