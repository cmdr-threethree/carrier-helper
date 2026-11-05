import { toFiniteNumber } from '../lib/format';
import { parseCapiDate } from '../lib/time';
import type {
  FleetCarrierResponse,
  SummaryItineraryEntry,
  SummaryMetrics,
} from './types';

function num(value: unknown): number {
  return toFiniteNumber(value) ?? 0;
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function countSales(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') return Object.keys(value).length;
  return 0;
}

function summarizeItinerary(data: FleetCarrierResponse): {
  name: string | null;
  totalDistance: number;
  entries: SummaryItineraryEntry[];
} {
  const itinerary = data.itinerary;
  const completed = Array.isArray(itinerary?.completed) ? itinerary.completed : [];
  const entries = completed
    .filter((entry) => typeof entry?.starsystem === 'string' && entry.starsystem.trim())
    .map<SummaryItineraryEntry>((entry) => ({
      system: text(entry.starsystem),
      arrivalTime: parseCapiDate(entry.arrivalTime),
      departureTime: parseCapiDate(entry.departureTime),
      visitDurationSeconds: num(entry.visitDurationSeconds),
    }));

  return {
    name: typeof itinerary?.currentJump === 'string' && itinerary.currentJump.trim()
      ? itinerary.currentJump
      : null,
    totalDistance: num(itinerary?.totalDistanceJumpedLY),
    entries: entries.slice(-10),
  };
}

export function summarizeCarrier(data: FleetCarrierResponse): SummaryMetrics {
  const capacity = data.capacity ?? {};
  const used =
    num(capacity.shipPacks) +
    num(capacity.modulePacks) +
    num(capacity.cargoForSale) +
    num(capacity.cargoNotForSale) +
    num(capacity.cargoSpaceReserved) +
    num(capacity.crew);

  const cargo = Array.isArray(data.cargo) ? data.cargo : [];
  const cargoTotalQty = cargo.reduce((sum, line) => sum + num(line?.qty), 0);
  // CAPI cargo[].value is the total value of the line, not the unit price.
  const cargoTotalValue = cargo.reduce((sum, line) => sum + num(line?.value), 0);

  const orders = data.orders?.commodities;
  const microOrders = data.orders?.onfootmicroresources;
  const services = data.servicesCrew ?? {};
  const serviceEntries = Object.values(services).filter(Boolean);
  const activeServices = serviceEntries.filter((service) => {
    if (!service) return false;
    const enabled = service.crewMember?.enabled;
    if (enabled === undefined) return service.status === 'ok';
    return enabled === true || enabled === 'YES';
  });

  const itinerary = summarizeItinerary(data);
  const finance = data.finance ?? {};
  const market = data.marketFinances ?? {};

  return {
    balance: num(data.balance),
    fuel: num(data.fuel),
    state: text(data.state, 'unknown'),
    theme: text(data.theme, ''),
    currentSystem: text(data.currentStarSystem, 'Unknown'),
    currentJump: itinerary.name,
    totalDistanceLY: itinerary.totalDistance,
    capacity: {
      total: used + num(capacity.freeSpace),
      used,
      free: num(capacity.freeSpace),
      cargoForSale: num(capacity.cargoForSale),
      cargoNotForSale: num(capacity.cargoNotForSale),
      reserved: num(capacity.cargoSpaceReserved),
    },
    finance: {
      bankBalance: num(finance.bankBalance),
      reserved: num(finance.bankReservedBalance),
      maintenance: num(finance.maintenance),
      coreCost: num(finance.coreCost),
      servicesCost: num(finance.servicesCost),
      jumpsCost: num(finance.jumpsCost),
      debtThreshold: num(finance.debtThreshold),
      taxation: num(finance.taxation),
    },
    market: {
      cargoTotalValue: num(market.cargoTotalValue),
      allTimeProfit: num(market.allTimeProfit),
      numCommodsForSale: num(market.numCommodsForSale),
      numCommodsPurchaseOrders: num(market.numCommodsPurchaseOrders),
    },
    cargo: {
      lines: cargo.length,
      totalQty: cargoTotalQty,
      totalValue: cargoTotalValue,
    },
    orders: {
      sales: Array.isArray(orders?.sales) ? orders.sales.length : 0,
      purchases: Array.isArray(orders?.purchases) ? orders.purchases.length : 0,
      microSales: countSales(microOrders?.sales),
      microPurchases: Array.isArray(microOrders?.purchases)
        ? microOrders.purchases.length
        : 0,
    },
    services: {
      installed: serviceEntries.length,
      active: activeServices.length,
      optional: num(finance.numOptionalServices),
    },
    reputation: (Array.isArray(data.reputation) ? data.reputation : [])
      .filter((entry) => typeof entry?.majorFaction === 'string')
      .map((entry) => ({
        majorFaction: text(entry.majorFaction),
        score: num(entry.score),
      })),
    itinerary: itinerary.entries,
  };
}
