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

export function emptySyncState(): SyncState {
  return {
    lastAttemptAt: undefined,
    lastSuccessAt: undefined,
    nextAllowedAt: 0,
    lastError: null,
  };
}
