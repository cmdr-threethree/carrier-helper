import { describe, expect, it } from 'vitest';
import {
  buildCargoChart,
  buildCargoRows,
  buildMarketChart,
  buildMarketRows,
  cargoCommoditySeries,
  downsampleMarketSeries,
  marketCommoditySeries,
  type CargoSample,
  type MarketSample,
} from '../src/history/analytics';

function marketSample(
  t: number,
  key: string,
  values: Partial<MarketSample> = {},
): MarketSample {
  return {
    t,
    key,
    name: key,
    stock: 100,
    buyPrice: 1_000,
    sellPrice: 2_000,
    meanPrice: 1_500,
    demand: 50,
    hasSaleOrder: true,
    saleStock: 10,
    salePrice: 2_000,
    saleOrderValue: 20_000,
    hasPurchaseOrder: true,
    purchaseOutstanding: 20,
    purchasePrice: 1_000,
    purchaseOrderValue: 20_000,
    samples: 1,
    ...values,
  };
}

function cargoSample(t: number, key: string, values: Partial<CargoSample> = {}): CargoSample {
  return {
    t,
    key,
    name: key,
    qty: 10,
    value: 1_000,
    unitValue: 100,
    samples: 1,
    ...values,
  };
}

describe('history analytics', () => {
  it('ranks market commodities over the range and groups the rest as Other', () => {
    const samples = [
      marketSample(1_000, 'a', { purchaseOrderValue: 100 }),
      marketSample(2_000, 'a', { purchaseOrderValue: 100 }),
      marketSample(1_000, 'b', { purchaseOrderValue: 90 }),
      marketSample(2_000, 'b', { purchaseOrderValue: 90 }),
      marketSample(1_000, 'c', { purchaseOrderValue: 80 }),
      marketSample(2_000, 'c', { purchaseOrderValue: 80 }),
      marketSample(1_000, 'd', { purchaseOrderValue: 70 }),
      marketSample(2_000, 'd', { purchaseOrderValue: 70 }),
      marketSample(1_000, 'e', { purchaseOrderValue: 60 }),
      marketSample(2_000, 'e', { purchaseOrderValue: 60 }),
      marketSample(1_000, 'f', { purchaseOrderValue: 50 }),
      marketSample(2_000, 'f', { purchaseOrderValue: 50 }),
    ];

    const chart = buildMarketChart(samples, 'buyOrderValue');
    expect(chart.stacked).toBe(true);
    expect(chart.series).toHaveLength(6);
    expect(chart.series[0]?.key).toBe('a');
    expect(chart.series.at(-1)?.key).toBe('__other');
    expect(chart.series.at(-1)?.values).toEqual([50, 50]);
    expect(chart.other).toBe(true);
  });

  it('uses lines for price-change ranking', () => {
    const samples = [
      marketSample(1_000, 'a', { sellPrice: 1_000 }),
      marketSample(2_000, 'a', { sellPrice: 1_500 }),
      marketSample(1_000, 'b', { sellPrice: 2_000 }),
      marketSample(2_000, 'b', { sellPrice: 2_100 }),
    ];
    const chart = buildMarketChart(samples, 'priceChange');
    expect(chart.stacked).toBe(false);
    expect(chart.series[0]?.key).toBe('a');
    expect(chart.series[0]?.values).toEqual([1_000, 1_500]);
  });

  it('builds market rows and series', () => {
    const samples = [
      marketSample(1_000, 'gold', { sellPrice: 1_000 }),
      marketSample(2_000, 'gold', { sellPrice: 1_100 }),
    ];
    const rows = buildMarketRows(samples);
    expect(rows[0]).toMatchObject({
      key: 'gold',
      stock: 100,
      samples: 2,
      changePct: 10,
    });
    const series = marketCommoditySeries(samples, 'gold');
    expect(series.sellPrice).toEqual([1_000, 1_100]);
    expect(downsampleMarketSeries(series, 1).times).toEqual([2_000]);
  });

  it('builds cargo charts and rows', () => {
    const samples = [
      cargoSample(1_000, 'gold', { qty: 10, value: 1_000 }),
      cargoSample(2_000, 'gold', { qty: 20, value: 2_000 }),
      cargoSample(1_000, 'wine', { qty: 5, value: 250 }),
      cargoSample(2_000, 'wine', { qty: 5, value: 250 }),
    ];
    const chart = buildCargoChart(samples, 'value');
    expect(chart.series[0]?.key).toBe('gold');
    expect(chart.series[0]?.values).toEqual([1_000, 2_000]);

    const rows = buildCargoRows(samples);
    expect(rows.find((row) => row.key === 'gold')).toMatchObject({
      qty: 20,
      value: 2_000,
      changePct: 100,
      peakQty: 20,
    });
    const series = cargoCommoditySeries(samples, 'gold');
    expect(series.qty).toEqual([10, 20]);
  });
});
