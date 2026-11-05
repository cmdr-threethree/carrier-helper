import type {
  CargoDay,
  CargoPoint,
  MarketDay,
  MarketPoint,
} from '../storage/schema';
import {
  cargoDaysForCarrier,
  cargoPointsForCarrier,
  marketDaysForCarrier,
  marketPointsForCarrier,
} from '../storage/repos';
import { formatDate } from '../lib/time';

export type HistoryRange = 7 | 30 | 90 | 365;

export type MarketRanking =
  | 'buyOrderValue'
  | 'sellOrderValue'
  | 'stock'
  | 'demand'
  | 'presence'
  | 'priceChange';

export type CargoRanking = 'value' | 'quantity' | 'presence' | 'peak';

export interface MarketSample {
  t: number;
  key: string;
  name: string;
  locName?: string;
  category?: string;
  stock: number;
  buyPrice: number;
  sellPrice: number;
  meanPrice: number;
  demand: number;
  hasSaleOrder: boolean;
  saleStock: number;
  salePrice: number;
  saleOrderValue: number;
  hasPurchaseOrder: boolean;
  purchaseOutstanding: number;
  purchasePrice: number;
  purchaseOrderValue: number;
  samples: number;
}

export interface CargoSample {
  t: number;
  key: string;
  name: string;
  locName?: string;
  qty: number;
  value: number;
  unitValue: number;
  samples: number;
}

export interface ChartSeries {
  key: string;
  label: string;
  values: Array<number | null>;
  color: string;
}

export interface ChartData {
  labels: string[];
  times: number[];
  series: ChartSeries[];
  stacked: boolean;
  metricLabel: string;
  other?: boolean;
}

export interface MarketRow {
  key: string;
  name: string;
  locName?: string;
  category?: string;
  samples: number;
  lastSeen: number;
  stock: number;
  buyPrice: number;
  sellPrice: number;
  meanPrice: number;
  demand: number;
  saleStock: number;
  salePrice: number;
  purchaseOutstanding: number;
  purchasePrice: number;
  buyOrderValue: number;
  sellOrderValue: number;
  changePct: number;
  peakStock: number;
}

export interface CargoRow {
  key: string;
  name: string;
  locName?: string;
  samples: number;
  lastSeen: number;
  qty: number;
  value: number;
  unitValue: number;
  changePct: number;
  peakQty: number;
}

export interface MarketSeries {
  times: number[];
  buyPrice: Array<number | null>;
  sellPrice: Array<number | null>;
  meanPrice: Array<number | null>;
  stock: Array<number | null>;
  demand: Array<number | null>;
  saleStock: Array<number | null>;
  salePrice: Array<number | null>;
  purchaseOutstanding: Array<number | null>;
  purchasePrice: Array<number | null>;
}

export interface CargoSeries {
  times: number[];
  qty: Array<number | null>;
  unitValue: Array<number | null>;
  value: Array<number | null>;
}

const COLORS = [
  'var(--accent)',
  'var(--cyan)',
  'var(--green)',
  'var(--violet)',
  '#f472b6',
  '#facc15',
];
const OTHER_COLOR = 'var(--faint)';

function pointToMarketSample(point: MarketPoint): MarketSample {
  return {
    t: point.fetchedAt,
    key: point.commodityKey,
    name: point.name,
    locName: point.locName,
    category: point.category,
    stock: point.stock,
    buyPrice: point.buyPrice,
    sellPrice: point.sellPrice,
    meanPrice: point.meanPrice,
    demand: point.demand,
    hasSaleOrder: point.hasSaleOrder,
    saleStock: point.saleStock,
    salePrice: point.salePrice,
    saleOrderValue: point.saleOrderValue,
    hasPurchaseOrder: point.hasPurchaseOrder,
    purchaseOutstanding: point.purchaseOutstanding,
    purchasePrice: point.purchasePrice,
    purchaseOrderValue: point.purchaseOrderValue,
    samples: 1,
  };
}

function dayToMarketSample(day: MarketDay): MarketSample {
  return {
    t: day.lastFetchedAt,
    key: day.commodityKey,
    name: day.name,
    locName: day.locName,
    category: day.category,
    stock: day.stock.last,
    buyPrice: day.buyPrice.last,
    sellPrice: day.sellPrice.last,
    meanPrice: day.meanPrice.last,
    demand: day.demand.last,
    hasSaleOrder: day.saleSamples > 0,
    saleStock: day.saleStock.last,
    salePrice: day.salePrice.last,
    saleOrderValue: day.saleOrderValue.last,
    hasPurchaseOrder: day.purchaseSamples > 0,
    purchaseOutstanding: day.purchaseOutstanding.last,
    purchasePrice: day.purchasePrice.last,
    purchaseOrderValue: day.purchaseOrderValue.last,
    samples: day.samples,
  };
}

function pointToCargoSample(point: CargoPoint): CargoSample {
  return {
    t: point.fetchedAt,
    key: point.commodityKey,
    name: point.name,
    locName: point.locName,
    qty: point.qty,
    value: point.value,
    unitValue: point.unitValue,
    samples: 1,
  };
}

function dayToCargoSample(day: CargoDay): CargoSample {
  return {
    t: day.lastFetchedAt,
    key: day.commodityKey,
    name: day.name,
    locName: day.locName,
    qty: day.qty.last,
    value: day.value.last,
    unitValue: day.unitValue.last,
    samples: day.samples,
  };
}

export async function loadMarketSamples(
  carrierId: string,
  from: number,
  to: number,
): Promise<MarketSample[]> {
  const [points, days] = await Promise.all([
    marketPointsForCarrier(carrierId, from, to),
    marketDaysForCarrier(carrierId, from, to),
  ]);
  return [
    ...points.map(pointToMarketSample),
    ...days.map(dayToMarketSample),
  ].sort((a, b) => a.t - b.t);
}

export async function loadCargoSamples(
  carrierId: string,
  from: number,
  to: number,
): Promise<CargoSample[]> {
  const [points, days] = await Promise.all([
    cargoPointsForCarrier(carrierId, from, to),
    cargoDaysForCarrier(carrierId, from, to),
  ]);
  return [
    ...points.map(pointToCargoSample),
    ...days.map(dayToCargoSample),
  ].sort((a, b) => a.t - b.t);
}

function uniqueTimes(samples: Array<{ t: number }>, max = 400): number[] {
  const times = [...new Set(samples.map((sample) => sample.t))].sort((a, b) => a - b);
  if (times.length <= max) return times;
  const result: number[] = [];
  for (let index = 0; index < max; index += 1) {
    const sourceIndex = Math.round((index * (times.length - 1)) / (max - 1));
    result.push(times[sourceIndex] as number);
  }
  return result;
}

function sampleMap<T extends { t: number; key: string }>(samples: T[]): Map<number, Map<string, T>> {
  const map = new Map<number, Map<string, T>>();
  for (const sample of samples) {
    let bucket = map.get(sample.t);
    if (!bucket) {
      bucket = new Map();
      map.set(sample.t, bucket);
    }
    bucket.set(sample.key, sample);
  }
  return map;
}

function marketValue(sample: MarketSample, metric: MarketRanking): number {
  switch (metric) {
    case 'buyOrderValue':
      return sample.hasPurchaseOrder ? sample.purchaseOrderValue : 0;
    case 'sellOrderValue':
      return sample.hasSaleOrder ? sample.saleOrderValue : 0;
    case 'stock':
      return sample.stock;
    case 'demand':
      return sample.demand;
    case 'presence':
      return 1;
    case 'priceChange':
      return sample.sellPrice;
    default:
      return 0;
  }
}

function groupSamples<T extends { key: string }>(samples: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const sample of samples) {
    const group = groups.get(sample.key);
    if (group) group.push(sample);
    else groups.set(sample.key, [sample]);
  }
  return groups;
}

function displayName(
  group: Array<{ name: string; locName?: string }> | undefined,
  fallback: string,
): string {
  return group?.[group.length - 1]?.locName || group?.[group.length - 1]?.name || fallback;
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentChange(first: number, last: number): number {
  if (!Number.isFinite(first) || first === 0) return 0;
  return ((last - first) / Math.abs(first)) * 100;
}

function rankMarket(groups: Map<string, MarketSample[]>, metric: MarketRanking): string[] {
  const scores = new Map<string, number>();
  for (const [key, samples] of groups) {
    const sorted = [...samples].sort((a, b) => a.t - b.t);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    let score = 0;
    switch (metric) {
      case 'buyOrderValue':
        score = average(
          samples.filter((sample) => sample.hasPurchaseOrder).map((sample) => sample.purchaseOrderValue),
        );
        break;
      case 'sellOrderValue':
        score = average(
          samples.filter((sample) => sample.hasSaleOrder).map((sample) => sample.saleOrderValue),
        );
        break;
      case 'stock':
        score = average(samples.map((sample) => sample.stock));
        break;
      case 'demand':
        score = average(samples.map((sample) => sample.demand));
        break;
      case 'presence':
        score = samples.reduce((sum, sample) => sum + sample.samples, 0);
        break;
      case 'priceChange':
        score = Math.abs(percentChange(first?.sellPrice ?? 0, last?.sellPrice ?? 0));
        break;
    }
    scores.set(key, score);
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => key);
}

function rankCargo(groups: Map<string, CargoSample[]>, metric: CargoRanking): string[] {
  const scores = new Map<string, number>();
  for (const [key, samples] of groups) {
    let score = 0;
    switch (metric) {
      case 'value':
        score = average(samples.map((sample) => sample.value));
        break;
      case 'quantity':
        score = average(samples.map((sample) => sample.qty));
        break;
      case 'presence':
        score = samples.reduce((sum, sample) => sum + sample.samples, 0);
        break;
      case 'peak':
        score = Math.max(...samples.map((sample) => sample.qty));
        break;
    }
    scores.set(key, score);
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => key);
}

export function buildMarketChart(
  samples: MarketSample[],
  metric: MarketRanking,
  limit = 5,
): ChartData {
  const groups = groupSamples(samples);
  const ranked = rankMarket(groups, metric).slice(0, limit);
  const times = uniqueTimes(samples);
  const buckets = sampleMap(samples);
  const labels = times.map((time) => formatDate(time));
  const chosen = new Set(ranked);

  if (metric === 'priceChange') {
    return {
      labels,
      times,
      stacked: false,
      metricLabel: 'Sell price',
      series: ranked.map((key, index) => ({
        key,
        label: displayName(groups.get(key), key),
        color: COLORS[index % COLORS.length] ?? 'var(--accent)',
        values: times.map((time) => buckets.get(time)?.get(key)?.sellPrice ?? null),
      })),
    };
  }

  const series: ChartSeries[] = ranked.map((key, index) => ({
    key,
    label: displayName(groups.get(key), key),
    color: COLORS[index % COLORS.length] ?? 'var(--accent)',
    values: times.map((time) => {
      const sample = buckets.get(time)?.get(key);
      return sample ? marketValue(sample, metric) : 0;
    }),
  }));

  const otherValues = times.map((time) => {
    const bucket = buckets.get(time);
    if (!bucket) return 0;
    let total = 0;
    for (const [key, sample] of bucket) {
      if (!chosen.has(key)) total += marketValue(sample, metric);
    }
    return total;
  });

  if (chosen.size < groups.size) {
    series.push({
      key: '__other',
      label: 'Other',
      color: OTHER_COLOR,
      values: otherValues,
    });
  }

  return {
    labels,
    times,
    stacked: true,
    metricLabel: marketMetricLabel(metric),
    series,
    other: chosen.size < groups.size,
  };
}

export function buildCargoChart(
  samples: CargoSample[],
  metric: CargoRanking,
  limit = 5,
): ChartData {
  const groups = groupSamples(samples);
  const ranked = rankCargo(groups, metric).slice(0, limit);
  const times = uniqueTimes(samples);
  const buckets = sampleMap(samples);
  const labels = times.map((time) => formatDate(time));
  const chosen = new Set(ranked);

  const series: ChartSeries[] = ranked.map((key, index) => ({
    key,
    label: displayName(groups.get(key), key),
    color: COLORS[index % COLORS.length] ?? 'var(--accent)',
    values: times.map((time) => {
      const sample = buckets.get(time)?.get(key);
      return sample ? (metric === 'value' ? sample.value : sample.qty) : 0;
    }),
  }));

  if (chosen.size < groups.size) {
    series.push({
      key: '__other',
      label: 'Other',
      color: OTHER_COLOR,
      values: times.map((time) => {
        const bucket = buckets.get(time);
        if (!bucket) return 0;
        let total = 0;
        for (const [key, sample] of bucket) {
          if (!chosen.has(key)) {
            total += metric === 'value' ? sample.value : sample.qty;
          }
        }
        return total;
      }),
    });
  }

  return {
    labels,
    times,
    stacked: true,
    metricLabel: metric === 'value' ? 'Cargo value' : 'Cargo quantity',
    series,
    other: chosen.size < groups.size,
  };
}

export function buildMarketRows(samples: MarketSample[]): MarketRow[] {
  const groups = groupSamples(samples);
  const rows: MarketRow[] = [];
  for (const [key, group] of groups) {
    const sorted = [...group].sort((a, b) => a.t - b.t);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    if (!last) continue;
    rows.push({
      key,
      name: last.name,
      locName: last.locName,
      category: last.category,
      samples: sorted.reduce((sum, sample) => sum + sample.samples, 0),
      lastSeen: last.t,
      stock: last.stock,
      buyPrice: last.buyPrice,
      sellPrice: last.sellPrice,
      meanPrice: last.meanPrice,
      demand: last.demand,
      saleStock: last.saleStock,
      salePrice: last.salePrice,
      purchaseOutstanding: last.purchaseOutstanding,
      purchasePrice: last.purchasePrice,
      buyOrderValue: last.purchaseOrderValue,
      sellOrderValue: last.saleOrderValue,
      changePct: percentChange(first?.sellPrice ?? 0, last.sellPrice),
      peakStock: Math.max(...sorted.map((sample) => sample.stock)),
    });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export function buildCargoRows(samples: CargoSample[]): CargoRow[] {
  const groups = groupSamples(samples);
  const rows: CargoRow[] = [];
  for (const [key, group] of groups) {
    const sorted = [...group].sort((a, b) => a.t - b.t);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    if (!last) continue;
    rows.push({
      key,
      name: last.name,
      locName: last.locName,
      samples: sorted.reduce((sum, sample) => sum + sample.samples, 0),
      lastSeen: last.t,
      qty: last.qty,
      value: last.value,
      unitValue: last.unitValue,
      changePct: percentChange(first?.qty ?? 0, last.qty),
      peakQty: Math.max(...sorted.map((sample) => sample.qty)),
    });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export function marketCommoditySeries(
  samples: MarketSample[],
  key: string,
): MarketSeries {
  const selected = samples.filter((sample) => sample.key === key).sort((a, b) => a.t - b.t);
  return {
    times: selected.map((sample) => sample.t),
    buyPrice: selected.map((sample) => sample.buyPrice),
    sellPrice: selected.map((sample) => sample.sellPrice),
    meanPrice: selected.map((sample) => sample.meanPrice),
    stock: selected.map((sample) => sample.stock),
    demand: selected.map((sample) => sample.demand),
    saleStock: selected.map((sample) => (sample.hasSaleOrder ? sample.saleStock : null)),
    salePrice: selected.map((sample) => (sample.hasSaleOrder ? sample.salePrice : null)),
    purchaseOutstanding: selected.map((sample) =>
      sample.hasPurchaseOrder ? sample.purchaseOutstanding : null,
    ),
    purchasePrice: selected.map((sample) =>
      sample.hasPurchaseOrder ? sample.purchasePrice : null,
    ),
  };
}

export function cargoCommoditySeries(samples: CargoSample[], key: string): CargoSeries {
  const selected = samples.filter((sample) => sample.key === key).sort((a, b) => a.t - b.t);
  return {
    times: selected.map((sample) => sample.t),
    qty: selected.map((sample) => sample.qty),
    unitValue: selected.map((sample) => sample.unitValue),
    value: selected.map((sample) => sample.value),
  };
}

function sampledIndices(length: number, max = 400): number[] {
  if (length <= max) return Array.from({ length }, (_, index) => index);
  if (max <= 1) return [length - 1];
  return Array.from({ length: max }, (_, index) =>
    Math.round((index * (length - 1)) / (max - 1)),
  );
}

function pick<T>(values: T[], indices: number[]): T[] {
  return indices.map((index) => values[index] as T);
}

export function downsampleMarketSeries(series: MarketSeries, max = 400): MarketSeries {
  const indices = sampledIndices(series.times.length, max);
  return {
    times: pick(series.times, indices),
    buyPrice: pick(series.buyPrice, indices),
    sellPrice: pick(series.sellPrice, indices),
    meanPrice: pick(series.meanPrice, indices),
    stock: pick(series.stock, indices),
    demand: pick(series.demand, indices),
    saleStock: pick(series.saleStock, indices),
    salePrice: pick(series.salePrice, indices),
    purchaseOutstanding: pick(series.purchaseOutstanding, indices),
    purchasePrice: pick(series.purchasePrice, indices),
  };
}

export function downsampleCargoSeries(series: CargoSeries, max = 400): CargoSeries {
  const indices = sampledIndices(series.times.length, max);
  return {
    times: pick(series.times, indices),
    qty: pick(series.qty, indices),
    unitValue: pick(series.unitValue, indices),
    value: pick(series.value, indices),
  };
}

export function marketMetricLabel(metric: MarketRanking): string {
  switch (metric) {
    case 'buyOrderValue':
      return 'Buy-order value';
    case 'sellOrderValue':
      return 'Sell-order value';
    case 'stock':
      return 'Stock';
    case 'demand':
      return 'Demand';
    case 'presence':
      return 'Listed';
    case 'priceChange':
      return 'Sell price';
  }
}

export function cargoMetricLabel(metric: CargoRanking): string {
  switch (metric) {
    case 'value':
      return 'Cargo value';
    case 'quantity':
      return 'Cargo quantity';
    case 'presence':
      return 'Cargo quantity';
    case 'peak':
      return 'Cargo quantity';
  }
}
