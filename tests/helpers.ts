import { summarizeCarrier } from '../src/capi/summarize';
import type { FleetCarrierResponse } from '../src/capi/types';
import { emptySyncState, type AccountRecord, type CarrierRecord, type SnapshotRecord, type SummaryRecord } from '../src/storage/schema';

export function makeAccount(overrides: Partial<AccountRecord> = {}): AccountRecord {
  const now = 1_800_000_000_000;
  return {
    id: 'account-1',
    platform: 'frontier',
    displayName: 'Test Commander',
    tokens: null,
    authorizedAt: now,
    needsReauth: false,
    carrierId: null,
    sync: { ...emptySyncState(), nextAllowedAt: 0 },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function makeCarrier(overrides: Partial<CarrierRecord> = {}): CarrierRecord {
  const now = 1_800_000_000_000;
  return {
    id: 'carrier-1',
    accountId: 'account-1',
    callsign: 'ABC-123',
    vanityName: 'Test Carrier',
    currentSystem: 'Sol',
    lastSnapshotId: null,
    lastSeenAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function makeRaw(overrides: Partial<FleetCarrierResponse> = {}): FleetCarrierResponse {
  return {
    name: { callsign: 'ABC-123' },
    currentStarSystem: 'Sol',
    balance: 1_000_000,
    fuel: 500,
    state: 'normalOperation',
    capacity: { freeSpace: 900 },
    ...overrides,
  };
}

export function makeSnapshot(
  overrides: Partial<SnapshotRecord> = {},
  raw: FleetCarrierResponse = makeRaw(),
): SnapshotRecord {
  return {
    id: crypto.randomUUID(),
    accountId: 'account-1',
    carrierId: 'carrier-1',
    fetchedAt: 1_800_000_000_000,
    endpoint: '/fleetcarrier',
    httpStatus: 200,
    size: 1_000,
    raw,
    ...overrides,
  };
}

export function makeSummary(
  overrides: Partial<SummaryRecord> = {},
  raw: FleetCarrierResponse = makeRaw(),
): SummaryRecord {
  return {
    id: crypto.randomUUID(),
    accountId: 'account-1',
    carrierId: 'carrier-1',
    fetchedAt: 1_800_000_000_000,
    metrics: summarizeCarrier(raw),
    ...overrides,
  };
}
