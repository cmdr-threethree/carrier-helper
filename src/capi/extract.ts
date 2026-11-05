import { toFiniteNumber } from '../lib/format';
import type { CargoPoint, MarketPoint } from '../storage/schema';
import type { FleetCarrierResponse } from './types';

function number(value: unknown): number {
  return toFiniteNumber(value) ?? 0;
}

function keyOf(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function sizeOf(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

interface MarketBuilder {
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
  hasPurchaseOrder: boolean;
  purchaseOutstanding: number;
  purchasePrice: number;
}

function ensureMarketItem(
  items: Map<string, MarketBuilder>,
  rawName: unknown,
  commodityId?: unknown,
): MarketBuilder | null {
  const key = keyOf(rawName);
  if (!key) return null;
  const existing = items.get(key);
  if (existing) return existing;
  const item: MarketBuilder = {
    commodityKey: key,
    commodityId:
      typeof commodityId === 'number' && Number.isFinite(commodityId)
        ? commodityId
        : undefined,
    name: String(rawName).trim(),
    stock: 0,
    buyPrice: 0,
    sellPrice: 0,
    meanPrice: 0,
    demand: 0,
    stockBracket: 0,
    demandBracket: 0,
    hasSaleOrder: false,
    saleStock: 0,
    salePrice: 0,
    hasPurchaseOrder: false,
    purchaseOutstanding: 0,
    purchasePrice: 0,
  };
  items.set(key, item);
  return item;
}

export function extractMarketPoints(
  raw: FleetCarrierResponse,
  carrierId: string,
  accountId: string,
  fetchedAt: number,
): MarketPoint[] {
  const items = new Map<string, MarketBuilder>();

  for (const commodity of raw.market?.commodities ?? []) {
    const item = ensureMarketItem(items, commodity.name || commodity.locName, commodity.id);
    if (!item) continue;
    item.commodityId =
      item.commodityId ??
      (typeof commodity.id === 'number' && Number.isFinite(commodity.id)
        ? commodity.id
        : undefined);
    item.locName = commodity.locName || item.locName;
    item.category = commodity.categoryname || item.category;
    item.stock = number(commodity.stock);
    item.buyPrice = number(commodity.buyPrice);
    item.sellPrice = number(commodity.sellPrice);
    item.meanPrice = number(commodity.meanPrice);
    item.demand = number(commodity.demand);
    item.stockBracket = number(commodity.stockBracket);
    item.demandBracket = number(commodity.demandBracket);
  }

  for (const order of raw.orders?.commodities?.sales ?? []) {
    const item = ensureMarketItem(items, order.name);
    if (!item) continue;
    item.hasSaleOrder = true;
    item.saleStock = number(order.stock);
    item.salePrice = number(order.price);
  }

  for (const order of raw.orders?.commodities?.purchases ?? []) {
    const item = ensureMarketItem(items, order.name);
    if (!item) continue;
    item.hasPurchaseOrder = true;
    item.purchaseOutstanding = number(order.outstanding);
    item.purchasePrice = number(order.price);
  }

  const points: MarketPoint[] = [];
  for (const item of items.values()) {
    const point: MarketPoint = {
      id: `${carrierId}:${encodeURIComponent(item.commodityKey)}:${fetchedAt}`,
      carrierId,
      accountId,
      fetchedAt,
      commodityKey: item.commodityKey,
      commodityId: item.commodityId,
      name: item.name,
      locName: item.locName,
      category: item.category,
      stock: item.stock,
      buyPrice: item.buyPrice,
      sellPrice: item.sellPrice,
      meanPrice: item.meanPrice,
      demand: item.demand,
      stockBracket: item.stockBracket,
      demandBracket: item.demandBracket,
      hasSaleOrder: item.hasSaleOrder,
      saleStock: item.saleStock,
      salePrice: item.salePrice,
      saleOrderValue: item.saleStock * item.salePrice,
      hasPurchaseOrder: item.hasPurchaseOrder,
      purchaseOutstanding: item.purchaseOutstanding,
      purchasePrice: item.purchasePrice,
      purchaseOrderValue: item.purchaseOutstanding * item.purchasePrice,
      size: 0,
    };
    point.size = sizeOf(point);
    points.push(point);
  }
  return points;
}

export function extractCargoPoints(
  raw: FleetCarrierResponse,
  carrierId: string,
  accountId: string,
  fetchedAt: number,
): CargoPoint[] {
  const cargo = new Map<
    string,
    {
      name: string;
      locName?: string;
      qty: number;
      value: number;
      hasStolen: boolean;
      hasMission: boolean;
    }
  >();

  for (const line of raw.cargo ?? []) {
    const key = keyOf(line.commodity || line.locName);
    if (!key) continue;
    const existing = cargo.get(key) ?? {
      name: String(line.commodity || line.locName).trim(),
      locName: line.locName,
      qty: 0,
      value: 0,
      hasStolen: false,
      hasMission: false,
    };
    existing.locName = line.locName || existing.locName;
    existing.qty += number(line.qty);
    // CAPI cargo[].value is the total value of the line, not the unit price.
    existing.value += number(line.value);
    existing.hasStolen = existing.hasStolen || Boolean(line.stolen);
    existing.hasMission = existing.hasMission || Boolean(line.mission);
    cargo.set(key, existing);
  }

  const points: CargoPoint[] = [];
  for (const [commodityKey, item] of cargo) {
    const point: CargoPoint = {
      id: `${carrierId}:${encodeURIComponent(commodityKey)}:${fetchedAt}`,
      carrierId,
      accountId,
      fetchedAt,
      commodityKey,
      name: item.name,
      locName: item.locName,
      qty: item.qty,
      value: item.value,
      unitValue: item.qty > 0 ? item.value / item.qty : 0,
      hasStolen: item.hasStolen,
      hasMission: item.hasMission,
      size: 0,
    };
    point.size = sizeOf(point);
    points.push(point);
  }
  return points;
}
