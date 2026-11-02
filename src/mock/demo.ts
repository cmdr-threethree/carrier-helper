import { summarizeCarrier } from '../capi/summarize';
import type { FleetCarrierResponse } from '../capi/types';
import { encodeCapiName } from '../lib/hex';
import { commitSnapshotBundle, listAccounts, putSummaryIfAbsent } from '../storage/repos';
import {
  emptySyncState,
  type AccountRecord,
  type CarrierRecord,
  type SnapshotRecord,
  type SummaryRecord,
} from '../storage/schema';

const SYSTEMS = ['Sol', 'Shinrarta Dezhra', 'LHS 3447', 'Colonia', 'Rhea', 'Cubeo'];

function pad(value: number, length = 3): string {
  return String(value).padStart(length, '0');
}

function round(value: number): number {
  return Math.round(value);
}

export function demoAccountIndex(accountId: string): number {
  const match = /^demo-(\d+)$/.exec(accountId);
  return match ? Number(match[1]) : 1;
}

export function demoCarrierResponse(
  accountId: string,
  at = Date.now(),
  step = 0,
): FleetCarrierResponse {
  const index = demoAccountIndex(accountId);
  const system = SYSTEMS[Math.floor(Math.max(0, step) / 18) % SYSTEMS.length] ?? 'Sol';
  const balance = round(1_250_000_000 + index * 120_000_000 + step * 2_750_000);
  const fuel = round(420 + ((step * 37 + index * 91) % 520));
  const cargoValue = round(38_000_000 + index * 4_000_000 + step * 120_000);
  const profit = round(240_000_000 + index * 20_000_000 + step * 900_000);
  const nowIso = new Date(at).toISOString();
  const callsign = `DMO-${pad(index)}`;
  const carrierName = `Demo Carrier ${index}`;

  const itinerary = Array.from({ length: 8 }, (_, entryIndex) => {
    const arrival = at - (8 - entryIndex) * 6 * 60 * 60 * 1000;
    return {
      starsystem: SYSTEMS[(entryIndex + Math.floor(step / 18)) % SYSTEMS.length] ?? 'Sol',
      arrivalTime: new Date(arrival).toISOString(),
      departureTime: new Date(arrival + 45 * 60 * 1000).toISOString(),
      state: 'success',
      visitDurationSeconds: 6 * 60 * 60,
    };
  });

  return {
    name: {
      callsign,
      vanityName: encodeCapiName(carrierName),
      filteredVanityName: encodeCapiName(carrierName),
    },
    currentStarSystem: system,
    balance,
    fuel,
    state: 'normalOperation',
    theme: 'Explorer',
    dockingAccess: 'all',
    notoriousAccess: true,
    capacity: {
      shipPacks: 1_200,
      modulePacks: 800,
      cargoForSale: 3_400,
      cargoNotForSale: 5_200,
      cargoSpaceReserved: 1_500,
      crew: 240,
      freeSpace: 12_660,
      microresourceCapacityTotal: 1_000,
      microresourceCapacityFree: 760,
      microresourceCapacityUsed: 240,
      microresourceCapacityReserved: 0,
    },
    itinerary: {
      completed: itinerary,
      totalDistanceJumpedLY: round(12_480 + index * 900 + step * 12),
      currentJump: SYSTEMS[(Math.floor(step / 18) + 1) % SYSTEMS.length] ?? 'Sol',
    },
    marketFinances: {
      cargoTotalValue: cargoValue,
      allTimeProfit: profit,
      numCommodsForSale: 14,
      numCommodsPurchaseOrders: 9,
      balanceAllocForPurchaseOrders: round(180_000_000 + step * 80_000),
    },
    blackmarketFinances: {
      cargoTotalValue: 0,
      allTimeProfit: 5_400_000,
      numCommodsForSale: 0,
      numCommodsPurchaseOrders: 0,
      balanceAllocForPurchaseOrders: 0,
    },
    finance: {
      bankBalance: balance,
      bankReservedBalance: round(42_000_000 + step * 50_000),
      taxation: 5,
      service_taxation: {
        bartender: 5,
        pioneersupplies: 5,
        rearm: 5,
        refuel: 5,
        repair: 5,
        shipyard: 5,
        outfitting: 5,
      },
      numServices: 4,
      numOptionalServices: 4,
      debtThreshold: -1_000_000_000,
      maintenance: round(8_250_000 + step * 12_000),
      maintenanceToDate: round(420_000_000 + step * 100_000),
      coreCost: 5_000_000,
      servicesCost: round(3_250_000 + step * 12_000),
      servicesCostToDate: round(120_000_000 + step * 50_000),
      jumpsCost: round((step % 7) * 250_000),
      numJumps: step % 7,
      bartender: {
        microresourcesTotalValue: round(4_200_000 + step * 20_000),
        allTimeProfit: round(12_000_000 + step * 90_000),
        microresourcesForSale: 6,
        microresourcesPurchaseOrders: 2,
        profitHistory: [1_200_000, 1_800_000, 2_100_000, 2_500_000],
      },
    },
    servicesCrew: {
      refuel: {
        crewMember: {
          name: 'Mira Voss',
          gender: 'F',
          enabled: 'YES',
          faction: 'Federation',
          salary: 1_200_000,
        },
        status: 'ok',
      },
      repair: {
        crewMember: {
          name: 'Dalen Rook',
          gender: 'M',
          enabled: 'YES',
          faction: 'Independent',
          salary: 1_500_000,
        },
        status: 'ok',
      },
      shipyard: {
        crewMember: {
          name: 'Sana Ives',
          gender: 'F',
          enabled: 'YES',
          faction: 'Alliance',
          salary: 2_100_000,
        },
        status: 'ok',
      },
      bartender: {
        crewMember: {
          name: 'Jax Calder',
          gender: 'M',
          enabled: 'YES',
          faction: 'Empire',
          salary: 1_800_000,
        },
        status: 'ok',
      },
    },
    cargo: [
      { commodity: 'gold', locName: 'Gold', qty: 120, value: 48_000, stolen: false, mission: false },
      { commodity: 'silver', locName: 'Silver', qty: 300, value: 32_000, stolen: false, mission: false },
      { commodity: 'tritium', locName: 'Tritium', qty: 540, value: 52_000, stolen: false, mission: false },
    ],
    orders: {
      commodities: {
        sales: [
          { name: 'Gold', stock: 120, price: 52_500, blackmarket: false },
          { name: 'Silver', stock: 300, price: 38_400, blackmarket: false },
          { name: 'Tritium', stock: 540, price: 58_000, blackmarket: false },
        ],
        purchases: [
          { name: 'Tritium', total: 2_000, outstanding: 1_460, price: 48_000 },
          { name: 'Gold', total: 400, outstanding: 280, price: 44_000 },
        ],
      },
      onfootmicroresources: {
        sales: {
          '1': { id: 1, name: 'weaponcomponent', locName: 'Weapon Component', stock: 12, price: 180_000 },
          '2': { id: 2, name: 'buildingfabricators', locName: 'Building Fabricators', stock: 8, price: 120_000 },
        },
        purchases: [
          { id: 3, name: 'microelectrode', locName: 'Microelectrode', total: 20, outstanding: 17, price: 95_000 },
        ],
      },
    },
    carrierLocker: {
      assets: [
        { id: 1, name: 'buildingfabricators', locName: 'Building Fabricators', quantity: 8 },
      ],
      goods: [
        { id: 2, name: 'microelectrode', locName: 'Microelectrode', quantity: 17 },
      ],
      data: [{ id: 3, name: 'settlementdefenceplans', locName: 'Settlement Defence Plans', quantity: 4 }],
    },
    reputation: [
      { majorFaction: 'federation', score: 78 },
      { majorFaction: 'empire', score: 42 },
      { majorFaction: 'alliance', score: 65 },
      { majorFaction: 'independent', score: 88 },
    ],
    market: {
      id: 3_700_000_000 + index,
      name: callsign,
      outpostType: 'fleetcarrier',
      services: {
        commodities: 'ok',
        refuel: 'ok',
        repair: 'ok',
        shipyard: 'ok',
        outfitting: 'ok',
        bartender: 'ok',
        dock: 'ok',
      },
      economies: { '136': { name: 'Carrier', proportion: 1 } },
      commodities: [
        { id: 1, name: 'gold', locName: 'Gold', stock: 120, buyPrice: 52_500, sellPrice: 44_000, demand: 400, meanPrice: 47_000, categoryname: 'Metals' },
        { id: 2, name: 'silver', locName: 'Silver', stock: 300, buyPrice: 38_400, sellPrice: 31_500, demand: 0, meanPrice: 34_000, categoryname: 'Metals' },
        { id: 3, name: 'tritium', locName: 'Tritium', stock: 540, buyPrice: 58_000, sellPrice: 48_000, demand: 2_000, meanPrice: 50_000, categoryname: 'Chemicals' },
        { id: 4, name: 'thermalcoolingunits', locName: 'Thermal Cooling Units', stock: 80, buyPrice: 9_800, sellPrice: 7_200, demand: 120, meanPrice: 8_100, categoryname: 'Industrial Materials' },
      ],
    },
    ships: { shipyard_list: {} },
    modules: {},
    lastUpdated: nowIso,
  };
}

export async function createDemoAccount(now = Date.now()): Promise<AccountRecord> {
  const existing = await listAccounts();
  const demoIndexes = existing
    .map((account) => /^demo-(\d+)$/.exec(account.id))
    .filter((match): match is RegExpExecArray => Boolean(match))
    .map((match) => Number(match[1]));
  const index = Math.max(0, ...demoIndexes) + 1;
  const accountId = `demo-${index}`;
  const callsign = `DMO-${pad(index)}`;
  const carrierId = crypto.randomUUID();
  const displayName = `Demo Commander ${index}`;

  const account: AccountRecord = {
    id: accountId,
    platform: 'demo',
    displayName,
    tokens: null,
    authorizedAt: now,
    needsReauth: false,
    carrierId,
    sync: {
      ...emptySyncState(),
      lastSuccessAt: now,
      nextAllowedAt: 0,
      lastError: null,
    },
    createdAt: now,
    updatedAt: now,
  };

  const raw = demoCarrierResponse(accountId, now, 0);
  const metrics = summarizeCarrier(raw);
  const carrier: CarrierRecord = {
    id: carrierId,
    accountId,
    callsign,
    vanityName: `Demo Carrier ${index}`,
    currentSystem: metrics.currentSystem,
    lastSnapshotId: null,
    lastSeenAt: now,
    createdAt: now,
    updatedAt: now,
  };

  const snapshot: SnapshotRecord = {
    id: crypto.randomUUID(),
    accountId,
    carrierId,
    fetchedAt: now,
    endpoint: '/fleetcarrier',
    httpStatus: 200,
    size: new TextEncoder().encode(JSON.stringify(raw)).byteLength,
    raw,
  };
  carrier.lastSnapshotId = snapshot.id;

  const summary: SummaryRecord = {
    id: crypto.randomUUID(),
    accountId,
    carrierId,
    fetchedAt: now,
    metrics,
  };

  await commitSnapshotBundle({ account, carrier, snapshot, summary });

  // Seed 30 days of 12-hourly summaries so charts are useful in demo mode.
  for (let step = 60; step >= 1; step -= 1) {
    const fetchedAt = now - step * 12 * 60 * 60 * 1000;
    const historyRaw = demoCarrierResponse(accountId, fetchedAt, 60 - step);
    const historySummary: SummaryRecord = {
      id: crypto.randomUUID(),
      accountId,
      carrierId,
      fetchedAt,
      metrics: summarizeCarrier(historyRaw),
    };
    await putSummaryIfAbsent(historySummary);
  }

  return account;
}
