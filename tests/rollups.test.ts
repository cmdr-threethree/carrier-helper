import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetDatabaseForTests } from '../src/storage/db';
import {
  cargoDaysForCarrier,
  cargoPointsForCarrier,
  marketDaysForCarrier,
  marketPointsForCarrier,
  putCargoPoints,
  putMarketPoints,
} from '../src/storage/repos';
import { applyRetention } from '../src/storage/retention';
import type { CargoPoint, MarketPoint } from '../src/storage/schema';

const DAY = 24 * 60 * 60 * 1000;

describe('item history rollups', () => {
  const now = 1_900_000_000_000;

  beforeEach(async () => {
    await resetDatabaseForTests();
  });

  afterEach(async () => {
    await resetDatabaseForTests();
  });

  it('rolls old market and cargo points into daily records', async () => {
    const fetchedAt = now - 40 * DAY;
    const marketPoint: MarketPoint = {
      id: `carrier-1:gold:${fetchedAt}`,
      carrierId: 'carrier-1',
      accountId: 'account-1',
      fetchedAt,
      commodityKey: 'gold',
      name: 'gold',
      locName: 'Gold',
      category: 'Metals',
      stock: 120,
      buyPrice: 52_500,
      sellPrice: 44_000,
      meanPrice: 47_000,
      demand: 400,
      stockBracket: 2,
      demandBracket: 1,
      hasSaleOrder: true,
      saleStock: 120,
      salePrice: 52_500,
      saleOrderValue: 6_300_000,
      hasPurchaseOrder: true,
      purchaseOutstanding: 280,
      purchasePrice: 44_000,
      purchaseOrderValue: 12_320_000,
      size: 500,
    };
    const cargoPoint: CargoPoint = {
      id: `carrier-1:tritium:${fetchedAt}`,
      carrierId: 'carrier-1',
      accountId: 'account-1',
      fetchedAt,
      commodityKey: 'tritium',
      name: 'Tritium',
      locName: 'Tritium',
      qty: 1_000,
      value: 50_000_000,
      unitValue: 50_000,
      hasStolen: false,
      hasMission: false,
      size: 200,
    };

    await putMarketPoints([marketPoint]);
    await putCargoPoints([cargoPoint]);

    const result = await applyRetention(now);

    expect(result.deletedMarketPoints).toBe(1);
    expect(result.deletedCargoPoints).toBe(1);
    expect(await marketPointsForCarrier('carrier-1')).toEqual([]);
    expect(await cargoPointsForCarrier('carrier-1')).toEqual([]);

    const marketDays = await marketDaysForCarrier('carrier-1');
    expect(marketDays).toHaveLength(1);
    expect(marketDays[0]).toMatchObject({
      commodityKey: 'gold',
      samples: 1,
      stock: { last: 120 },
      purchaseOrderValue: { last: 12_320_000 },
    });

    const cargoDays = await cargoDaysForCarrier('carrier-1');
    expect(cargoDays).toHaveLength(1);
    expect(cargoDays[0]).toMatchObject({
      commodityKey: 'tritium',
      samples: 1,
      qty: { last: 1_000 },
      value: { last: 50_000_000 },
    });
  });
});
