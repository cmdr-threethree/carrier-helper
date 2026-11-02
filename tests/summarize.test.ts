import { describe, expect, it } from 'vitest';
import { summarizeCarrier } from '../src/capi/summarize';

describe('carrier summary', () => {
  it('maps the important fields safely', () => {
    const summary = summarizeCarrier({
      currentStarSystem: 'Sol',
      balance: 1_000,
      fuel: 500,
      state: 'normalOperation',
      capacity: {
        shipPacks: 10,
        modulePacks: 20,
        cargoForSale: 30,
        cargoNotForSale: 40,
        cargoSpaceReserved: 5,
        crew: 15,
        freeSpace: 880,
      },
      finance: {
        bankBalance: 900,
        bankReservedBalance: 100,
        maintenance: 50,
        coreCost: 20,
        servicesCost: 30,
        jumpsCost: 10,
        debtThreshold: -1_000,
        taxation: 5,
        numOptionalServices: 3,
      },
      marketFinances: {
        cargoTotalValue: 700,
        allTimeProfit: 300,
        numCommodsForSale: 2,
        numCommodsPurchaseOrders: 1,
      },
      cargo: [
        { commodity: 'gold', qty: 2, value: 100 },
        { commodity: 'silver', qty: 3, value: 50 },
      ],
      orders: {
        commodities: {
          sales: [{ name: 'Gold' }],
          purchases: [{ name: 'Silver' }, { name: 'Gold' }],
        },
        onfootmicroresources: {
          sales: { '1': { name: 'a' }, '2': { name: 'b' } },
          purchases: [{ name: 'c' }],
        },
      },
      servicesCrew: {
        refuel: { crewMember: { enabled: 'YES' }, status: 'ok' },
        repair: { crewMember: { enabled: 'NO' }, status: 'ok' },
      },
      itinerary: {
        totalDistanceJumpedLY: 123.5,
        currentJump: 'Alpha Centauri',
        completed: [
          {
            starsystem: 'Sol',
            arrivalTime: '2026-01-01T12:00:00Z',
            departureTime: '2026-01-01T13:00:00Z',
            visitDurationSeconds: 3600,
          },
        ],
      },
      reputation: [{ majorFaction: 'federation', score: 75 }],
    });

    expect(summary.balance).toBe(1_000);
    expect(summary.capacity.used).toBe(120);
    expect(summary.capacity.total).toBe(1_000);
    expect(summary.market.allTimeProfit).toBe(300);
    expect(summary.cargo.totalQty).toBe(5);
    expect(summary.cargo.totalValue).toBe(350);
    expect(summary.orders).toEqual({
      sales: 1,
      purchases: 2,
      microSales: 2,
      microPurchases: 1,
    });
    expect(summary.services).toEqual({ installed: 2, active: 1, optional: 3 });
    expect(summary.currentJump).toBe('Alpha Centauri');
    expect(summary.itinerary).toHaveLength(1);
    expect(summary.itinerary[0]?.system).toBe('Sol');
    expect(summary.reputation[0]?.majorFaction).toBe('federation');
  });

  it('coerces numeric strings returned by CAPI', () => {
    const summary = summarizeCarrier({
      balance: '1725609459',
      fuel: '887',
      capacity: {
        cargoNotForSale: '24843',
        freeSpace: '157',
      },
      finance: {
        bankBalance: '7286840885',
        maintenance: '5000000',
      },
      marketFinances: {
        cargoTotalValue: '306055713',
        allTimeProfit: '15884252863',
      },
      cargo: [
        { commodity: 'Tritium', qty: '1143', value: '60644913' },
        { commodity: 'Wine', qty: '23700', value: '245410800' },
      ],
      orders: {
        commodities: {
          sales: [
            { name: 'gold', stock: '0', price: '161554' },
            { name: 'superconductors', stock: '0', price: '64466' },
          ],
          purchases: [],
        },
      },
      itinerary: {
        totalDistanceJumpedLY: '5927',
        completed: [
          {
            starsystem: 'HIP 57784',
            arrivalTime: '2026-10-24 14:02:00',
            departureTime: null,
            visitDurationSeconds: '792783',
          },
        ],
      },
      reputation: [{ majorFaction: 'empire', score: '100' }],
    });

    expect(summary.balance).toBe(1_725_609_459);
    expect(summary.fuel).toBe(887);
    expect(summary.capacity.free).toBe(157);
    expect(summary.capacity.cargoNotForSale).toBe(24_843);
    expect(summary.finance.bankBalance).toBe(7_286_840_885);
    expect(summary.finance.maintenance).toBe(5_000_000);
    expect(summary.market.cargoTotalValue).toBe(306_055_713);
    expect(summary.market.allTimeProfit).toBe(15_884_252_863);
    expect(summary.cargo.totalQty).toBe(24_843);
    expect(summary.cargo.totalValue).toBe(5_885_553_095_559);
    expect(summary.orders.sales).toBe(2);
    expect(summary.totalDistanceLY).toBe(5_927);
    expect(summary.itinerary[0]?.visitDurationSeconds).toBe(792_783);
    expect(summary.reputation[0]?.score).toBe(100);
  });

  it('handles a missing payload without throwing', () => {
    const summary = summarizeCarrier({});
    expect(summary.balance).toBe(0);
    expect(summary.currentSystem).toBe('Unknown');
    expect(summary.orders.sales).toBe(0);
    expect(summary.capacity.total).toBe(0);
  });
});
