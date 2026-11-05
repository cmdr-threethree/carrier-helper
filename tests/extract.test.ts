import { describe, expect, it } from 'vitest';
import { extractCargoPoints, extractMarketPoints } from '../src/capi/extract';
import type { FleetCarrierResponse } from '../src/capi/types';

describe('item extraction', () => {
  it('merges market items with orders and coerces strings', () => {
    const raw: FleetCarrierResponse = {
      market: {
        commodities: [
          {
            id: 1,
            name: 'gold',
            locName: 'Gold',
            categoryname: 'Metals',
            stock: '120',
            buyPrice: '52500',
            sellPrice: '44000',
            meanPrice: '47000',
            demand: '400',
            stockBracket: '2',
            demandBracket: '1',
          },
        ],
      },
      orders: {
        commodities: {
          sales: [
            { name: 'gold', stock: '120', price: '52500' },
            { name: 'tritium', stock: '0', price: '161554' },
          ],
          purchases: [
            { name: 'gold', total: '400', outstanding: '280', price: '44000' },
          ],
        },
      },
    };

    const points = extractMarketPoints(raw, 'carrier-1', 'account-1', 1000);
    expect(points).toHaveLength(2);
    const gold = points.find((point) => point.commodityKey === 'gold');
    expect(gold).toMatchObject({
      commodityId: 1,
      stock: 120,
      buyPrice: 52500,
      sellPrice: 44000,
      demand: 400,
      hasSaleOrder: true,
      saleOrderValue: 6_300_000,
      hasPurchaseOrder: true,
      purchaseOutstanding: 280,
      purchaseOrderValue: 12_320_000,
      category: 'Metals',
    });
    const tritium = points.find((point) => point.commodityKey === 'tritium');
    expect(tritium).toMatchObject({
      hasSaleOrder: true,
      salePrice: 161554,
      stock: 0,
      hasPurchaseOrder: false,
    });
    expect(gold?.id).toBe('carrier-1:gold:1000');
  });

  it('aggregates cargo lines per commodity using line totals', () => {
    const raw: FleetCarrierResponse = {
      cargo: [
        { commodity: 'Tritium', locName: 'Tritium', qty: '100', value: '5000', stolen: false },
        { commodity: 'Tritium', locName: 'Tritium', qty: '50', value: '2500', stolen: true },
        { commodity: 'Wine', locName: 'Wine', qty: '10', value: '100', mission: true },
      ],
    };

    const points = extractCargoPoints(raw, 'carrier-1', 'account-1', 2000);
    expect(points).toHaveLength(2);
    const tritium = points.find((point) => point.commodityKey === 'tritium');
    expect(tritium).toMatchObject({
      qty: 150,
      value: 7_500,
      unitValue: 50,
      hasStolen: true,
      hasMission: false,
    });
  });
});
