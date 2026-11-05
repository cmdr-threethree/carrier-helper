import type { FleetCarrierResponse, SummaryMetrics } from '../capi/types';

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  accessExpiresAt: number;
}

export interface SyncState {
  lastAttemptAt?: number;
  lastSuccessAt?: number;
  nextAllowedAt?: number;
  lastError?: string | null;
}

export interface AccountRecord {
  id: string;
  platform: string;
  displayName: string;
  tokens: TokenSet | null;
  authorizedAt: number;
  needsReauth: boolean;
  carrierId: string | null;
  sync: SyncState;
  createdAt: number;
  updatedAt: number;
}

export interface CarrierRecord {
  id: string;
  accountId: string;
  callsign: string;
  vanityName: string;
  currentSystem: string;
  lastSnapshotId: string | null;
  lastSeenAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface SnapshotRecord {
  id: string;
  accountId: string;
  carrierId: string;
  fetchedAt: number;
  endpoint: '/fleetcarrier';
  httpStatus: number;
  size: number;
  raw: FleetCarrierResponse;
}

export interface SummaryRecord {
  id: string;
  accountId: string;
  carrierId: string;
  fetchedAt: number;
  metrics: SummaryMetrics;
}

export interface MetaRecord {
  key: string;
  value: unknown;
}

export interface SeriesStats {
  first: number;
  last: number;
  min: number;
  max: number;
  avg: number;
  sum: number;
}

export interface MarketPoint {
  id: string;
  carrierId: string;
  accountId: string;
  fetchedAt: number;
  commodityKey: string;
  commodityId?: number;
  name: string;
  locName?: string;
  category?: string;

  stock: number;
  buyPrice: number;
  sellPrice: number;
  meanPrice: number;
  demand: number;
  stockBracket: number;
  demandBracket: number;

  hasSaleOrder: boolean;
  saleStock: number;
  salePrice: number;
  saleOrderValue: number;

  hasPurchaseOrder: boolean;
  purchaseOutstanding: number;
  purchasePrice: number;
  purchaseOrderValue: number;

  size: number;
}

export interface CargoPoint {
  id: string;
  carrierId: string;
  accountId: string;
  fetchedAt: number;
  commodityKey: string;
  name: string;
  locName?: string;

  qty: number;
  value: number;
  unitValue: number;

  hasStolen: boolean;
  hasMission: boolean;

  size: number;
}

export interface MarketDay {
  id: string;
  carrierId: string;
  accountId: string;
  commodityKey: string;
  commodityId?: number;
  name: string;
  locName?: string;
  category?: string;
  dayStart: number;
  samples: number;
  firstFetchedAt: number;
  lastFetchedAt: number;

  stock: SeriesStats;
  demand: SeriesStats;
  buyPrice: SeriesStats;
  sellPrice: SeriesStats;
  meanPrice: SeriesStats;

  saleSamples: number;
  saleStock: SeriesStats;
  salePrice: SeriesStats;
  saleOrderValue: SeriesStats;

  purchaseSamples: number;
  purchaseOutstanding: SeriesStats;
  purchasePrice: SeriesStats;
  purchaseOrderValue: SeriesStats;

  size: number;
}

export interface CargoDay {
  id: string;
  carrierId: string;
  accountId: string;
  commodityKey: string;
  name: string;
  locName?: string;
  dayStart: number;
  samples: number;
  firstFetchedAt: number;
  lastFetchedAt: number;

  qty: SeriesStats;
  value: SeriesStats;
  unitValue: SeriesStats;

  size: number;
}

export function emptySyncState(): SyncState {
  return {
    lastAttemptAt: undefined,
    lastSuccessAt: undefined,
    nextAllowedAt: 0,
    lastError: null,
  };
}
