import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetDatabaseForTests } from '../src/storage/db';
import {
  putMarketPoints,
  putSnapshotIfAbsent,
  saveAccount,
  saveCarrier,
} from '../src/storage/repos';
import { getStorageBreakdown } from '../src/storage/stats';
import type { MarketPoint } from '../src/storage/schema';
import { makeAccount, makeCarrier, makeSnapshot } from './helpers';

describe('storage stats', () => {
  beforeEach(async () => {
    await resetDatabaseForTests();
  });

  afterEach(async () => {
    await resetDatabaseForTests();
  });

  it('reports per-store counts and estimated bytes', async () => {
    await saveAccount(makeAccount());
    await saveCarrier(makeCarrier());
    await putSnapshotIfAbsent(makeSnapshot());
    const point: MarketPoint = {
      id: 'carrier-1:gold:1000',
      carrierId: 'carrier-1',
      accountId: 'account-1',
      fetchedAt: 1000,
      commodityKey: 'gold',
      name: 'gold',
      stock: 10,
      buyPrice: 100,
      sellPrice: 110,
      meanPrice: 105,
      demand: 20,
      stockBracket: 1,
      demandBracket: 1,
      hasSaleOrder: false,
      saleStock: 0,
      salePrice: 0,
      saleOrderValue: 0,
      hasPurchaseOrder: false,
      purchaseOutstanding: 0,
      purchasePrice: 0,
      purchaseOrderValue: 0,
      size: 123,
    };
    await putMarketPoints([point]);

    const breakdown = await getStorageBreakdown(true);
    expect(breakdown.stores.accounts.count).toBe(1);
    expect(breakdown.stores.carriers.count).toBe(1);
    expect(breakdown.stores.snapshots.count).toBe(1);
    expect(breakdown.stores.marketPoints.count).toBe(1);
    expect(breakdown.stores.marketPoints.bytes).toBe(123);
    expect(breakdown.totalBytes).toBeGreaterThan(0);
  });
});
