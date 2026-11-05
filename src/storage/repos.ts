import { getDb } from './db';
import type {
  AccountRecord,
  CargoDay,
  CargoPoint,
  CarrierRecord,
  MarketDay,
  MarketPoint,
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

function carrierCommodityTimeRange(
  carrierId: string,
  commodityKey: string,
  from = 0,
  to = MAX_TIME,
): IDBKeyRange {
  return IDBKeyRange.bound(
    [carrierId, commodityKey, from],
    [carrierId, commodityKey, to],
  );
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
  const tx = db.transaction(
    [
      'accounts',
      'carriers',
      'snapshots',
      'summaries',
      'marketPoints',
      'cargoPoints',
      'marketDays',
      'cargoDays',
    ],
    'readwrite',
  );
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

  for (const storeName of [
    'marketPoints',
    'cargoPoints',
    'marketDays',
    'cargoDays',
  ] as const) {
    const index = tx.objectStore(storeName).index('by-account');
    let cursor = await index.openCursor(IDBKeyRange.only(id));
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
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

export async function marketPointsForCarrier(
  carrierId: string,
  from = 0,
  to = MAX_TIME,
): Promise<MarketPoint[]> {
  const db = await getDb();
  return db.getAllFromIndex(
    'marketPoints',
    'by-carrier-time',
    carrierTimeRange(carrierId, from, to),
  );
}

export async function cargoPointsForCarrier(
  carrierId: string,
  from = 0,
  to = MAX_TIME,
): Promise<CargoPoint[]> {
  const db = await getDb();
  return db.getAllFromIndex(
    'cargoPoints',
    'by-carrier-time',
    carrierTimeRange(carrierId, from, to),
  );
}

export async function marketDaysForCarrier(
  carrierId: string,
  from = 0,
  to = MAX_TIME,
): Promise<MarketDay[]> {
  const db = await getDb();
  return db.getAllFromIndex(
    'marketDays',
    'by-carrier-day',
    carrierTimeRange(carrierId, from, to),
  );
}

export async function cargoDaysForCarrier(
  carrierId: string,
  from = 0,
  to = MAX_TIME,
): Promise<CargoDay[]> {
  const db = await getDb();
  return db.getAllFromIndex(
    'cargoDays',
    'by-carrier-day',
    carrierTimeRange(carrierId, from, to),
  );
}

export async function marketPointsForCommodity(
  carrierId: string,
  commodityKey: string,
  from = 0,
  to = MAX_TIME,
): Promise<MarketPoint[]> {
  const db = await getDb();
  return db.getAllFromIndex(
    'marketPoints',
    'by-carrier-commodity-time',
    carrierCommodityTimeRange(carrierId, commodityKey, from, to),
  );
}

export async function cargoPointsForCommodity(
  carrierId: string,
  commodityKey: string,
  from = 0,
  to = MAX_TIME,
): Promise<CargoPoint[]> {
  const db = await getDb();
  return db.getAllFromIndex(
    'cargoPoints',
    'by-carrier-commodity-time',
    carrierCommodityTimeRange(carrierId, commodityKey, from, to),
  );
}

export async function marketDaysForCommodity(
  carrierId: string,
  commodityKey: string,
  from = 0,
  to = MAX_TIME,
): Promise<MarketDay[]> {
  const db = await getDb();
  return db.getAllFromIndex(
    'marketDays',
    'by-carrier-commodity-day',
    carrierCommodityTimeRange(carrierId, commodityKey, from, to),
  );
}

export async function cargoDaysForCommodity(
  carrierId: string,
  commodityKey: string,
  from = 0,
  to = MAX_TIME,
): Promise<CargoDay[]> {
  const db = await getDb();
  return db.getAllFromIndex(
    'cargoDays',
    'by-carrier-commodity-day',
    carrierCommodityTimeRange(carrierId, commodityKey, from, to),
  );
}

export async function allMarketPoints(): Promise<MarketPoint[]> {
  const db = await getDb();
  return db.getAll('marketPoints');
}

export async function allCargoPoints(): Promise<CargoPoint[]> {
  const db = await getDb();
  return db.getAll('cargoPoints');
}

export async function allMarketDays(): Promise<MarketDay[]> {
  const db = await getDb();
  return db.getAll('marketDays');
}

export async function allCargoDays(): Promise<CargoDay[]> {
  const db = await getDb();
  return db.getAll('cargoDays');
}

export async function putMarketPoints(points: MarketPoint[]): Promise<void> {
  if (!points.length) return;
  const db = await getDb();
  const tx = db.transaction('marketPoints', 'readwrite');
  await Promise.all(points.map((point) => tx.store.put(point)));
  await tx.done;
}

export async function putCargoPoints(points: CargoPoint[]): Promise<void> {
  if (!points.length) return;
  const db = await getDb();
  const tx = db.transaction('cargoPoints', 'readwrite');
  await Promise.all(points.map((point) => tx.store.put(point)));
  await tx.done;
}

export async function putMarketPointIfAbsent(point: MarketPoint): Promise<boolean> {
  const db = await getDb();
  try {
    await db.add('marketPoints', point);
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'ConstraintError') return false;
    throw error;
  }
}

export async function putCargoPointIfAbsent(point: CargoPoint): Promise<boolean> {
  const db = await getDb();
  try {
    await db.add('cargoPoints', point);
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'ConstraintError') return false;
    throw error;
  }
}

export async function putMarketDays(days: MarketDay[]): Promise<void> {
  if (!days.length) return;
  const db = await getDb();
  const tx = db.transaction('marketDays', 'readwrite');
  await Promise.all(days.map((day) => tx.store.put(day)));
  await tx.done;
}

export async function putCargoDays(days: CargoDay[]): Promise<void> {
  if (!days.length) return;
  const db = await getDb();
  const tx = db.transaction('cargoDays', 'readwrite');
  await Promise.all(days.map((day) => tx.store.put(day)));
  await tx.done;
}

export async function deleteMarketPoints(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const db = await getDb();
  const tx = db.transaction('marketPoints', 'readwrite');
  await Promise.all(ids.map((id) => tx.store.delete(id)));
  await tx.done;
}

export async function deleteCargoPoints(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const db = await getDb();
  const tx = db.transaction('cargoPoints', 'readwrite');
  await Promise.all(ids.map((id) => tx.store.delete(id)));
  await tx.done;
}

export async function deleteMarketDays(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const db = await getDb();
  const tx = db.transaction('marketDays', 'readwrite');
  await Promise.all(ids.map((id) => tx.store.delete(id)));
  await tx.done;
}

export async function deleteCargoDays(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const db = await getDb();
  const tx = db.transaction('cargoDays', 'readwrite');
  await Promise.all(ids.map((id) => tx.store.delete(id)));
  await tx.done;
}

export async function commitSnapshotBundle(input: {
  account: AccountRecord;
  carrier: CarrierRecord;
  snapshot: SnapshotRecord;
  summary: SummaryRecord;
  marketPoints?: MarketPoint[];
  cargoPoints?: CargoPoint[];
}): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(
    ['accounts', 'carriers', 'snapshots', 'summaries', 'marketPoints', 'cargoPoints'],
    'readwrite',
  );
  await Promise.all([
    tx.objectStore('accounts').put(input.account),
    tx.objectStore('carriers').put(input.carrier),
    tx.objectStore('snapshots').put(input.snapshot),
    tx.objectStore('summaries').put(input.summary),
    ...(input.marketPoints ?? []).map((point) =>
      tx.objectStore('marketPoints').put(point),
    ),
    ...(input.cargoPoints ?? []).map((point) =>
      tx.objectStore('cargoPoints').put(point),
    ),
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
  const tx = db.transaction(
    [
      'accounts',
      'carriers',
      'snapshots',
      'summaries',
      'marketPoints',
      'cargoPoints',
      'marketDays',
      'cargoDays',
    ],
    'readwrite',
  );
  await Promise.all([
    tx.objectStore('accounts').clear(),
    tx.objectStore('carriers').clear(),
    tx.objectStore('snapshots').clear(),
    tx.objectStore('summaries').clear(),
    tx.objectStore('marketPoints').clear(),
    tx.objectStore('cargoPoints').clear(),
    tx.objectStore('marketDays').clear(),
    tx.objectStore('cargoDays').clear(),
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
