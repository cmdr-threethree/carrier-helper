import { config } from '../config';
import { getDb } from './db';
import {
  deleteCargoPoints,
  deleteMarketPoints,
  deleteSnapshots,
  latestSnapshotForCarrier,
  listAllCarriers,
  putCargoDays,
  putMarketDays,
} from './repos';
import type {
  CargoDay,
  CargoPoint,
  MarketDay,
  MarketPoint,
  SeriesStats,
} from './schema';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RetentionResult {
  deletedSnapshots: number;
  deletedSummaries: number;
  rolledMarketDays: number;
  rolledCargoDays: number;
  deletedMarketPoints: number;
  deletedCargoPoints: number;
  remainingSnapshotBytes: number;
}

function seriesStats(values: number[]): SeriesStats {
  if (!values.length) {
    return { first: 0, last: 0, min: 0, max: 0, avg: 0, sum: 0 };
  }
  let sum = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    sum += value;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return {
    first: values[0] ?? 0,
    last: values[values.length - 1] ?? 0,
    min,
    max,
    avg: sum / values.length,
    sum,
  };
}

function pointSize(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

async function deleteOldSummaries(cutoff: number): Promise<number> {
  const db = await getDb();
  const old = await db.getAllFromIndex('summaries', 'by-time', IDBKeyRange.upperBound(cutoff));
  if (!old.length) return 0;
  const tx = db.transaction('summaries', 'readwrite');
  await Promise.all(old.map((summary) => tx.store.delete(summary.id)));
  await tx.done;
  return old.length;
}

function groupByDay<T extends { carrierId: string; commodityKey: string; fetchedAt: number }>(
  points: T[],
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const point of points) {
    const dayStart = Math.floor(point.fetchedAt / DAY_MS) * DAY_MS;
    const key = `${point.carrierId}|${point.commodityKey}|${dayStart}`;
    const group = groups.get(key);
    if (group) group.push(point);
    else groups.set(key, [point]);
  }
  return groups;
}

function buildMarketDay(points: MarketPoint[]): MarketDay {
  const sorted = [...points].sort((a, b) => a.fetchedAt - b.fetchedAt);
  const latest = sorted[sorted.length - 1] ?? points[0];
  if (!latest) throw new Error('Market day requires at least one point.');
  const dayStart = Math.floor(latest.fetchedAt / DAY_MS) * DAY_MS;
  const salePoints = sorted.filter((point) => point.hasSaleOrder);
  const purchasePoints = sorted.filter((point) => point.hasPurchaseOrder);

  const day: MarketDay = {
    id: `${latest.carrierId}:${encodeURIComponent(latest.commodityKey)}:${dayStart}`,
    carrierId: latest.carrierId,
    accountId: latest.accountId,
    commodityKey: latest.commodityKey,
    commodityId: latest.commodityId,
    name: latest.name,
    locName: latest.locName,
    category: latest.category,
    dayStart,
    samples: sorted.length,
    firstFetchedAt: sorted[0]?.fetchedAt ?? latest.fetchedAt,
    lastFetchedAt: latest.fetchedAt,
    stock: seriesStats(sorted.map((point) => point.stock)),
    demand: seriesStats(sorted.map((point) => point.demand)),
    buyPrice: seriesStats(sorted.map((point) => point.buyPrice)),
    sellPrice: seriesStats(sorted.map((point) => point.sellPrice)),
    meanPrice: seriesStats(sorted.map((point) => point.meanPrice)),
    saleSamples: salePoints.length,
    saleStock: seriesStats(salePoints.map((point) => point.saleStock)),
    salePrice: seriesStats(salePoints.map((point) => point.salePrice)),
    saleOrderValue: seriesStats(salePoints.map((point) => point.saleOrderValue)),
    purchaseSamples: purchasePoints.length,
    purchaseOutstanding: seriesStats(
      purchasePoints.map((point) => point.purchaseOutstanding),
    ),
    purchasePrice: seriesStats(purchasePoints.map((point) => point.purchasePrice)),
    purchaseOrderValue: seriesStats(
      purchasePoints.map((point) => point.purchaseOrderValue),
    ),
    size: 0,
  };
  day.size = pointSize(day);
  return day;
}

function buildCargoDay(points: CargoPoint[]): CargoDay {
  const sorted = [...points].sort((a, b) => a.fetchedAt - b.fetchedAt);
  const latest = sorted[sorted.length - 1] ?? points[0];
  if (!latest) throw new Error('Cargo day requires at least one point.');
  const dayStart = Math.floor(latest.fetchedAt / DAY_MS) * DAY_MS;
  const day: CargoDay = {
    id: `${latest.carrierId}:${encodeURIComponent(latest.commodityKey)}:${dayStart}`,
    carrierId: latest.carrierId,
    accountId: latest.accountId,
    commodityKey: latest.commodityKey,
    name: latest.name,
    locName: latest.locName,
    dayStart,
    samples: sorted.length,
    firstFetchedAt: sorted[0]?.fetchedAt ?? latest.fetchedAt,
    lastFetchedAt: latest.fetchedAt,
    qty: seriesStats(sorted.map((point) => point.qty)),
    value: seriesStats(sorted.map((point) => point.value)),
    unitValue: seriesStats(sorted.map((point) => point.unitValue)),
    size: 0,
  };
  day.size = pointSize(day);
  return day;
}

async function rollupOldItemPoints(now: number): Promise<{
  marketDays: number;
  cargoDays: number;
  marketPoints: number;
  cargoPoints: number;
}> {
  const db = await getDb();
  const pointCutoff = now - 30 * DAY_MS;

  const oldMarket = await db.getAllFromIndex(
    'marketPoints',
    'by-time',
    IDBKeyRange.upperBound(pointCutoff),
  );
  const oldCargo = await db.getAllFromIndex(
    'cargoPoints',
    'by-time',
    IDBKeyRange.upperBound(pointCutoff),
  );

  const marketGroups = groupByDay(
    oldMarket.filter((point) => {
      const dayStart = Math.floor(point.fetchedAt / DAY_MS) * DAY_MS;
      return dayStart + DAY_MS <= pointCutoff;
    }),
  );
  const cargoGroups = groupByDay(
    oldCargo.filter((point) => {
      const dayStart = Math.floor(point.fetchedAt / DAY_MS) * DAY_MS;
      return dayStart + DAY_MS <= pointCutoff;
    }),
  );

  const marketDays = [...marketGroups.values()].map(buildMarketDay);
  const cargoDays = [...cargoGroups.values()].map(buildCargoDay);

  await putMarketDays(marketDays);
  await putCargoDays(cargoDays);
  await deleteMarketPoints(
    [...marketGroups.values()].flat().map((point) => point.id),
  );
  await deleteCargoPoints([...cargoGroups.values()].flat().map((point) => point.id));

  return {
    marketDays: marketDays.length,
    cargoDays: cargoDays.length,
    marketPoints: [...marketGroups.values()].reduce(
      (sum, group) => sum + group.length,
      0,
    ),
    cargoPoints: [...cargoGroups.values()].reduce(
      (sum, group) => sum + group.length,
      0,
    ),
  };
}

async function deleteOldItemDays(now: number): Promise<{
  marketDays: number;
  cargoDays: number;
}> {
  const db = await getDb();
  const cutoff = now - 365 * DAY_MS;
  const marketDays = await db.getAllFromIndex(
    'marketDays',
    'by-day',
    IDBKeyRange.upperBound(cutoff),
  );
  const cargoDays = await db.getAllFromIndex(
    'cargoDays',
    'by-day',
    IDBKeyRange.upperBound(cutoff),
  );
  if (marketDays.length) {
    const tx = db.transaction('marketDays', 'readwrite');
    await Promise.all(marketDays.map((day) => tx.store.delete(day.id)));
    await tx.done;
  }
  if (cargoDays.length) {
    const tx = db.transaction('cargoDays', 'readwrite');
    await Promise.all(cargoDays.map((day) => tx.store.delete(day.id)));
    await tx.done;
  }
  return { marketDays: marketDays.length, cargoDays: cargoDays.length };
}

export async function applyRetention(now = Date.now()): Promise<RetentionResult> {
  const db = await getDb();
  const rawCutoff = now - config.rawRetentionMs;
  const summaryCutoff = now - config.summaryRetentionMs;

  const deletedSummaries = await deleteOldSummaries(summaryCutoff);
  const rolled = await rollupOldItemPoints(now);
  await deleteOldItemDays(now);

  const carriers = await listAllCarriers();
  const protectedIds = new Set<string>();
  await Promise.all(
    carriers.map(async (carrier) => {
      const latest = await latestSnapshotForCarrier(carrier.id);
      if (latest) protectedIds.add(latest.id);
    }),
  );

  const old = await db.getAllFromIndex('snapshots', 'by-time', IDBKeyRange.upperBound(rawCutoff));
  const deletable = old.filter((snapshot) => !protectedIds.has(snapshot.id));
  await deleteSnapshots(deletable.map((snapshot) => snapshot.id));
  let deletedSnapshots = deletable.length;

  const remaining = await db.getAll('snapshots');
  let remainingSnapshotBytes = remaining.reduce((sum, snapshot) => sum + (snapshot.size || 0), 0);

  if (remainingSnapshotBytes > config.rawStorageCapBytes) {
    remaining.sort((a, b) => a.fetchedAt - b.fetchedAt);
    const toDelete: string[] = [];
    for (const snapshot of remaining) {
      if (remainingSnapshotBytes <= config.rawStorageCapBytes) break;
      if (protectedIds.has(snapshot.id)) continue;
      toDelete.push(snapshot.id);
      remainingSnapshotBytes -= snapshot.size || 0;
    }
    await deleteSnapshots(toDelete);
    deletedSnapshots += toDelete.length;
  }

  return {
    deletedSnapshots,
    deletedSummaries,
    rolledMarketDays: rolled.marketDays,
    rolledCargoDays: rolled.cargoDays,
    deletedMarketPoints: rolled.marketPoints,
    deletedCargoPoints: rolled.cargoPoints,
    remainingSnapshotBytes,
  };
}
