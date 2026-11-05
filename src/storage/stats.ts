import { getDb } from './db';
import { getMeta, setMeta } from './repos';

export type BreakdownStoreName =
  | 'accounts'
  | 'carriers'
  | 'snapshots'
  | 'summaries'
  | 'marketPoints'
  | 'cargoPoints'
  | 'marketDays'
  | 'cargoDays';

export interface StoreBreakdown {
  count: number;
  bytes: number;
  retention: string;
}

export interface StorageBreakdown {
  generatedAt: number;
  stores: Record<BreakdownStoreName, StoreBreakdown>;
  totalBytes: number;
}

const CACHE_KEY = 'storage-breakdown-v1';
const CACHE_TTL_MS = 60_000;

const RETENTION: Record<BreakdownStoreName, string> = {
  accounts: 'until deleted',
  carriers: 'until deleted',
  snapshots: '7 days / latest',
  summaries: '90 days',
  marketPoints: '30 days',
  cargoPoints: '30 days',
  marketDays: '365 days',
  cargoDays: '365 days',
};

function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export async function getStorageBreakdown(force = false): Promise<StorageBreakdown> {
  if (!force) {
    const cached = await getMeta<StorageBreakdown>(CACHE_KEY);
    if (cached && Date.now() - cached.generatedAt < CACHE_TTL_MS) return cached;
  }

  const db = await getDb();
  const stores = {} as Record<BreakdownStoreName, StoreBreakdown>;

  const measures: Array<{
    name: BreakdownStoreName;
    size: (value: unknown) => number;
  }> = [
    { name: 'accounts', size: byteLength },
    { name: 'carriers', size: byteLength },
    {
      name: 'snapshots',
      size: (value) => (value as { size?: number }).size ?? byteLength(value),
    },
    { name: 'summaries', size: byteLength },
    {
      name: 'marketPoints',
      size: (value) => (value as { size?: number }).size ?? byteLength(value),
    },
    {
      name: 'cargoPoints',
      size: (value) => (value as { size?: number }).size ?? byteLength(value),
    },
    {
      name: 'marketDays',
      size: (value) => (value as { size?: number }).size ?? byteLength(value),
    },
    {
      name: 'cargoDays',
      size: (value) => (value as { size?: number }).size ?? byteLength(value),
    },
  ];

  for (const measure of measures) {
    let count = 0;
    let bytes = 0;
    const tx = db.transaction(measure.name);
    let cursor = await tx.store.openCursor();
    while (cursor) {
      count += 1;
      bytes += measure.size(cursor.value);
      cursor = await cursor.continue();
    }
    stores[measure.name] = {
      count,
      bytes,
      retention: RETENTION[measure.name],
    };
  }

  const totalBytes = Object.values(stores).reduce(
    (sum, store) => sum + store.bytes,
    0,
  );
  const breakdown: StorageBreakdown = {
    generatedAt: Date.now(),
    stores,
    totalBytes,
  };
  await setMeta(CACHE_KEY, breakdown);
  return breakdown;
}

export async function invalidateStorageBreakdown(): Promise<void> {
  const db = await getDb();
  await db.delete('meta', CACHE_KEY);
}
