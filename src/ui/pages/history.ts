import { formatCompact, formatCredits, formatNumber } from '../../lib/format';
import { daysAgo, formatDate, formatRelative } from '../../lib/time';
import { summariesForCarrier } from '../../storage/repos';
import type { CarrierRecord, SummaryRecord } from '../../storage/schema';
import { el, type Child } from '../dom';
import { requestRender } from '../events';
import { emptyState, stat } from '../layout';
import { lineChart, multiSeriesChart, type MultiSeriesInput } from '../components/chart';
import { dataTable } from '../components/table';
import {
  buildCargoChart,
  buildCargoRows,
  buildMarketChart,
  buildMarketRows,
  cargoCommoditySeries,
  cargoMetricLabel,
  downsampleCargoSeries,
  downsampleMarketSeries,
  loadCargoSamples,
  loadMarketSamples,
  marketCommoditySeries,
  marketMetricLabel,
  type CargoRanking,
  type HistoryRange,
  type MarketRanking,
} from '../../history/analytics';

type HistoryView = 'overview' | 'market' | 'cargo';

const OVERVIEW_RANGES: HistoryRange[] = [7, 30, 90];
const ITEM_RANGES: HistoryRange[] = [7, 30, 90, 365];

const viewByCarrier = new Map<string, HistoryView>();
const rangeByCarrier = new Map<string, HistoryRange>();
const marketRankingByCarrier = new Map<string, MarketRanking>();
const cargoRankingByCarrier = new Map<string, CargoRanking>();
const marketKeyByCarrier = new Map<string, string>();
const cargoKeyByCarrier = new Map<string, string>();
const marketSearchByCarrier = new Map<string, string>();
const cargoSearchByCarrier = new Map<string, string>();

const MARKET_METRICS: Array<{ value: MarketRanking; label: string }> = [
  { value: 'buyOrderValue', label: 'Buy-order value' },
  { value: 'sellOrderValue', label: 'Sell-order value' },
  { value: 'stock', label: 'Stock' },
  { value: 'demand', label: 'Demand' },
  { value: 'presence', label: 'Presence' },
  { value: 'priceChange', label: 'Price change' },
];

const CARGO_METRICS: Array<{ value: CargoRanking; label: string }> = [
  { value: 'value', label: 'Value' },
  { value: 'quantity', label: 'Quantity' },
  { value: 'presence', label: 'Presence' },
  { value: 'peak', label: 'Peak quantity' },
];

function viewFor(carrierId: string): HistoryView {
  return viewByCarrier.get(carrierId) ?? 'overview';
}

function rangeFor(carrierId: string, view: HistoryView): HistoryRange {
  const stored = rangeByCarrier.get(carrierId) ?? 30;
  if (view === 'overview' && stored === 365) return 90;
  return stored;
}

function seriesColorClass(index: number): string {
  return `legend-color-${index % 7}`;
}

function legend(series: MultiSeriesInput[]): HTMLElement | null {
  if (!series.length) return null;
  return el(
    'div',
    { class: 'chart-legend' },
    ...series.map((item, index) =>
      el(
        'span',
        { class: 'legend-item' },
        el('span', {
          class: `legend-swatch ${seriesColorClass(index)}`,
          'aria-hidden': 'true',
        }),
        item.label,
      ),
    ),
  );
}

function hasValues(values: Array<number | null>): boolean {
  return values.some((value) => value !== null && Number.isFinite(value));
}

function chartCard(
  title: string,
  chart: SVGSVGElement,
  chartLegend: HTMLElement | null,
  subtitle?: string,
): HTMLElement {
  return el(
    'section',
    { class: 'chart-card' },
    el('div', { class: 'chart-card-head' }, el('h2', null, title)),
    chartLegend,
    chart,
    subtitle ? el('p', { class: 'muted small' }, subtitle) : null,
  );
}

function changeLabel(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

function orderLabel(stock: number, price: number): string {
  if (!stock && !price) return '—';
  return `${formatNumber(stock)} @ ${formatCredits(price)}`;
}

function clickableTable(
  headers: string[],
  rows: Array<{
    key: string;
    search: string;
    selected: boolean;
    cells: Child[];
    onSelect: () => void;
  }>,
  search: string,
  onSearch: (value: string) => void,
  emptyText: string,
): { node: HTMLElement; filter: (value: string) => void } {
  const rowElements: Array<{ element: HTMLTableRowElement; search: string }> = [];
  const tbody = el('tbody');

  if (!rows.length) {
    tbody.append(
      el(
        'tr',
        null,
        el('td', { colspan: String(headers.length), class: 'muted' }, emptyText),
      ),
    );
  } else {
    for (const row of rows) {
      const tr = el(
        'tr',
        {
          class: row.selected ? 'clickable-row selected-row' : 'clickable-row',
          dataset: { key: row.key },
          on: { click: row.onSelect },
        },
        ...row.cells.map((cell) => el('td', null, cell)),
      );
      rowElements.push({ element: tr, search: row.search.toLowerCase() });
      tbody.append(tr);
    }
  }

  const input = el('input', {
    class: 'text-input search-input',
    type: 'search',
    placeholder: 'Search commodities…',
    value: search,
    'aria-label': 'Search commodities',
    on: {
      input: (event) => {
        const value = (event.currentTarget as HTMLInputElement).value;
        onSearch(value);
        filter(value);
      },
    },
  }) as HTMLInputElement;

  const filter = (value: string): void => {
    const query = value.trim().toLowerCase();
    for (const row of rowElements) {
      row.element.hidden = Boolean(query) && !row.search.includes(query);
    }
  };

  const table = el(
    'div',
    { class: 'table-wrap' },
    el(
      'table',
      { class: 'data-table' },
      el(
        'thead',
        null,
        el(
          'tr',
          null,
          ...headers.map((header) => el('th', { scope: 'col' }, header)),
        ),
      ),
      tbody,
    ),
  );

  filter(search);
  return { node: el('div', null, input, table), filter };
}

function rangeButtons(
  carrierId: string,
  view: HistoryView,
  current: HistoryRange,
): HTMLElement {
  const ranges = view === 'overview' ? OVERVIEW_RANGES : ITEM_RANGES;
  return el(
    'div',
    { class: 'segmented compact-segments', role: 'group', 'aria-label': 'History range' },
    ...ranges.map((days) =>
      el(
        'button',
        {
          type: 'button',
          class: days === current ? 'segment active' : 'segment',
          on: {
            click: () => {
              rangeByCarrier.set(carrierId, days);
              requestRender();
            },
          },
        },
        days === 365 ? '1 year' : `${days} days`,
      ),
    ),
  );
}

function viewButtons(carrierId: string, current: HistoryView): HTMLElement {
  const views: Array<{ value: HistoryView; label: string }> = [
    { value: 'overview', label: 'Overview' },
    { value: 'market', label: 'Market' },
    { value: 'cargo', label: 'Cargo' },
  ];
  return el(
    'div',
    { class: 'segmented', role: 'group', 'aria-label': 'History view' },
    ...views.map((view) =>
      el(
        'button',
        {
          type: 'button',
          class: view.value === current ? 'segment active' : 'segment',
          on: {
            click: () => {
              viewByCarrier.set(carrierId, view.value);
              if (view.value === 'overview' && rangeFor(carrierId, 'overview') === 365) {
                rangeByCarrier.set(carrierId, 90);
              }
              requestRender();
            },
          },
        },
        view.label,
      ),
    ),
  );
}

function overviewContent(
  rows: SummaryRecord[],
  rangeDays: HistoryRange,
): { content: Child[]; countLabel: string } {
  if (!rows.length) {
    return {
      content: [emptyState('No history in this range', 'Sync this carrier to start building a timeline.')],
      countLabel: `0 snapshots in ${rangeDays} days`,
    };
  }

  const chartRows =
    rows.length > 400
      ? rows.filter(
          (_, index) =>
            index % Math.ceil(rows.length / 400) === 0 || index === rows.length - 1,
        )
      : rows;
  const labels = chartRows.map((row) => formatDate(row.fetchedAt));
  const first = rows[0]?.metrics;
  const last = rows[rows.length - 1]?.metrics;

  const charts = [
    {
      title: 'Carrier balance',
      values: chartRows.map((row) => row.metrics.balance ?? 0),
      latest: last ? formatCredits(last.balance) : '—',
      delta: first?.balance !== undefined && last?.balance !== undefined
        ? `${last.balance - first.balance >= 0 ? '+' : ''}${formatCredits(last.balance - first.balance)} over range`
        : 'No change data',
      color: 'var(--accent)',
      format: (value: number) => `${formatCompact(value, 2)} cr`,
    },
    {
      title: 'Fuel reserve',
      values: chartRows.map((row) => row.metrics.fuel ?? 0),
      latest: last ? `${formatNumber(last.fuel)} t` : '—',
      delta: first?.fuel !== undefined && last?.fuel !== undefined
        ? `${last.fuel - first.fuel >= 0 ? '+' : ''}${formatNumber(last.fuel - first.fuel)} t over range`
        : 'No change data',
      color: 'var(--cyan)',
      format: (value: number) => `${formatCompact(value, 2)} t`,
    },
    {
      title: 'Free capacity',
      values: chartRows.map((row) => row.metrics.capacity?.free ?? 0),
      latest: last ? `${formatNumber(last.capacity?.free)} t` : '—',
      delta: first?.capacity?.free !== undefined && last?.capacity?.free !== undefined
        ? `${last.capacity.free - first.capacity.free >= 0 ? '+' : ''}${formatNumber(last.capacity.free - first.capacity.free)} t over range`
        : 'No change data',
      color: 'var(--green)',
      format: (value: number) => `${formatCompact(value, 2)} t`,
    },
    {
      title: 'Market all-time profit',
      values: chartRows.map((row) => row.metrics.market?.allTimeProfit ?? 0),
      latest: last ? formatCredits(last.market?.allTimeProfit) : '—',
      delta: first?.market?.allTimeProfit !== undefined && last?.market?.allTimeProfit !== undefined
        ? `${last.market.allTimeProfit - first.market.allTimeProfit >= 0 ? '+' : ''}${formatCredits(last.market.allTimeProfit - first.market.allTimeProfit)} over range`
        : 'No change data',
      color: 'var(--violet)',
      format: (value: number) => `${formatCompact(value, 2)} cr`,
    },
  ];

  const stops = (() => {
    const result: Array<{ fetchedAt: number; system: string; balance: number; fuel: number }> = [];
    let previousSystem: string | null = null;
    for (const row of rows) {
      const system = row.metrics.currentSystem || 'Unknown';
      if (system !== previousSystem) {
        result.push({
          fetchedAt: row.fetchedAt,
          system,
          balance: row.metrics.balance ?? 0,
          fuel: row.metrics.fuel ?? 0,
        });
        previousSystem = system;
      }
    }
    return result;
  })();

  return {
    content: [
      el(
        'div',
        { class: 'chart-grid' },
        ...charts.map((chart) =>
          el(
            'section',
            { class: 'chart-card' },
            el(
              'div',
              { class: 'chart-card-head' },
              el('h2', null, chart.title),
              el('span', { class: 'chart-latest' }, chart.latest),
            ),
            lineChart({
              values: chart.values,
              labels,
              color: chart.color,
              valueLabel: chart.title,
              format: chart.format,
            }),
            el('p', { class: 'muted small' }, chart.delta),
          ),
        ),
      ),
      el(
        'div',
        { class: 'two-column' },
        el(
          'section',
          { class: 'section' },
          el('h2', { class: 'section-title' }, 'System timeline'),
          dataTable(
            ['Date', 'System', 'Balance', 'Fuel'],
            stops.map((stop) => [
              formatDate(stop.fetchedAt),
              stop.system,
              formatCredits(stop.balance),
              `${formatNumber(stop.fuel)} t`,
            ]),
            { emptyText: 'No system changes recorded.' },
          ),
        ),
        el(
          'section',
          { class: 'section' },
          el('h2', { class: 'section-title' }, 'Latest snapshots'),
          dataTable(
            ['When', 'System', 'Balance', 'Free space'],
            [...rows]
              .reverse()
              .slice(0, 20)
              .map((row) => [
                formatRelative(row.fetchedAt),
                row.metrics.currentSystem ?? 'Unknown',
                formatCredits(row.metrics.balance ?? 0),
                `${formatNumber(row.metrics.capacity?.free ?? 0)} t`,
              ]),
            { compact: true },
          ),
        ),
      ),
      el(
        'div',
        { class: 'stat-row' },
        stat('Snapshots in range', formatNumber(rows.length)),
        stat('Earliest', formatDate(rows[0]?.fetchedAt)),
        stat('Latest', formatRelative(rows[rows.length - 1]?.fetchedAt)),
        stat('Range', `${rangeDays} days`),
      ),
    ],
    countLabel: `${rows.length} snapshots in ${rangeDays} days`,
  };
}

async function marketContent(
  carrier: CarrierRecord,
  rangeDays: HistoryRange,
): Promise<{ content: Child[]; countLabel: string }> {
  const now = Date.now();
  const samples = await loadMarketSamples(carrier.id, daysAgo(rangeDays, now), now);
  if (!samples.length) {
    return {
      content: [emptyState('No market history in this range', 'Sync this carrier to start recording market history.')],
      countLabel: `0 samples in ${rangeDays === 365 ? '1 year' : `${rangeDays} days`}`,
    };
  }

  const defaultRanking: MarketRanking = samples.some(
    (sample) => sample.hasPurchaseOrder && sample.purchaseOrderValue > 0,
  )
    ? 'buyOrderValue'
    : samples.some((sample) => sample.hasSaleOrder && sample.saleOrderValue > 0)
      ? 'sellOrderValue'
      : samples.some((sample) => sample.stock > 0)
        ? 'stock'
        : 'presence';
  const ranking = marketRankingByCarrier.get(carrier.id) ?? defaultRanking;
  if (!marketRankingByCarrier.has(carrier.id)) {
    marketRankingByCarrier.set(carrier.id, ranking);
  }
  const chart = buildMarketChart(samples, ranking);
  const rows = buildMarketRows(samples);
  const selectedFromChart = chart.series.find((series) => series.key !== '__other')?.key;
  const storedKey = marketKeyByCarrier.get(carrier.id);
  const selectedKey =
    (storedKey && rows.some((row) => row.key === storedKey) ? storedKey : undefined) ??
    selectedFromChart ??
    rows[0]?.key ??
    '';
  if (selectedKey) marketKeyByCarrier.set(carrier.id, selectedKey);

  const selectedRow = rows.find((row) => row.key === selectedKey);
  const series = downsampleMarketSeries(marketCommoditySeries(samples, selectedKey));
  const labels = series.times.map((time) => formatDate(time));
  const uniqueSamples = new Set(samples.map((sample) => sample.t)).size;
  const chartFormat =
    ranking === 'buyOrderValue' ||
    ranking === 'sellOrderValue' ||
    ranking === 'priceChange'
      ? (value: number) => `${formatCompact(value, 2)} cr`
      : (value: number) => formatCompact(value, 2);

  const rankingSelect = el(
    'label',
    { class: 'inline-field' },
    el('span', null, 'Rank by'),
    el(
      'select',
      {
        on: {
          change: (event) => {
            marketRankingByCarrier.set(
              carrier.id,
              (event.currentTarget as HTMLSelectElement).value as MarketRanking,
            );
            requestRender();
          },
        },
      },
      ...MARKET_METRICS.map((metric) =>
        el(
          'option',
          { value: metric.value, selected: metric.value === ranking },
          metric.label,
        ),
      ),
    ),
  );

  const priceSeries: MultiSeriesInput[] = [
    { label: 'Buy price', values: series.buyPrice },
    { label: 'Sell price', values: series.sellPrice },
    { label: 'Mean price', values: series.meanPrice },
  ];
  const liquiditySeries: MultiSeriesInput[] = [
    { label: 'Stock', values: series.stock },
    { label: 'Demand', values: series.demand },
  ];
  const orderQuantitySeries: MultiSeriesInput[] = [
    { label: 'Sell order stock', values: series.saleStock },
    { label: 'Buy outstanding', values: series.purchaseOutstanding },
  ];
  const orderPriceSeries: MultiSeriesInput[] = [
    { label: 'Sell order price', values: series.salePrice },
    { label: 'Buy order price', values: series.purchasePrice },
  ];

  const table = clickableTable(
    ['Commodity', 'Stock', 'Buy', 'Sell', 'Demand', 'Buy order', 'Sell order', 'Change'],
    rows.map((row) => ({
      key: row.key,
      search: `${row.name} ${row.locName ?? ''} ${row.category ?? ''}`,
      selected: row.key === selectedKey,
      onSelect: () => {
        marketKeyByCarrier.set(carrier.id, row.key);
        requestRender();
      },
      cells: [
        row.locName || row.name,
        formatNumber(row.stock),
        formatCredits(row.buyPrice),
        formatCredits(row.sellPrice),
        formatNumber(row.demand),
        orderLabel(row.purchaseOutstanding, row.purchasePrice),
        orderLabel(row.saleStock, row.salePrice),
        changeLabel(row.changePct),
      ],
    })),
    marketSearchByCarrier.get(carrier.id) ?? '',
    (value) => marketSearchByCarrier.set(carrier.id, value),
    'No commodities in this range.',
  );

  return {
    content: [
      el(
        'div',
        { class: 'history-controls' },
        rankingSelect,
        el(
          'span',
          { class: 'muted small' },
          `Top ${Math.min(5, rows.length)} of ${rows.length} · ${uniqueSamples} samples`,
        ),
      ),
      chartCard(
        `${marketMetricLabel(ranking)} · top commodities`,
        multiSeriesChart({
          series: chart.series,
          labels: chart.labels,
          stacked: chart.stacked,
          step: false,
          valueLabel: marketMetricLabel(ranking),
          format: chartFormat,
        }),
        legend(chart.series),
        `Ranked over ${rangeDays === 365 ? '1 year' : `${rangeDays} days`}; ${
          chart.other
            ? 'remaining commodities are grouped as Other.'
            : chart.series.length < rows.length
              ? 'other commodities are omitted from the chart.'
              : 'all commodities are shown.'
        }`,
      ),
      el(
        'section',
        { class: 'section' },
        el('h2', { class: 'section-title' }, 'Selected commodity'),
        el('p', { class: 'chart-latest' }, selectedRow?.locName || selectedRow?.name || '—'),
        el(
          'div',
          { class: 'chart-grid' },
          chartCard(
            'Prices',
            multiSeriesChart({
              series: priceSeries,
              labels,
              step: true,
              valueLabel: 'Price',
              format: (value) => formatCredits(value),
            }),
            legend(priceSeries),
          ),
          chartCard(
            'Stock and demand',
            multiSeriesChart({
              series: liquiditySeries,
              labels,
              step: true,
              valueLabel: 'Stock',
              format: (value) => formatNumber(value),
            }),
            legend(liquiditySeries),
          ),
          hasValues(orderQuantitySeries.flatMap((item) => item.values))
            ? chartCard(
                'Order quantities',
                multiSeriesChart({
                  series: orderQuantitySeries,
                  labels,
                  step: true,
                  valueLabel: 'Order quantities',
                  format: (value) => formatNumber(value),
                }),
                legend(orderQuantitySeries),
              )
            : null,
          hasValues(orderPriceSeries.flatMap((item) => item.values))
            ? chartCard(
                'Order prices',
                multiSeriesChart({
                  series: orderPriceSeries,
                  labels,
                  step: true,
                  valueLabel: 'Order prices',
                  format: (value) => formatCredits(value),
                }),
                legend(orderPriceSeries),
              )
            : null,
        ),
      ),
      el(
        'section',
        { class: 'section' },
        el('h2', { class: 'section-title' }, 'All commodities'),
        table.node,
      ),
    ],
    countLabel: `${uniqueSamples} samples · ${rows.length} commodities in ${rangeDays === 365 ? '1 year' : `${rangeDays} days`}`,
  };
}

async function cargoContent(
  carrier: CarrierRecord,
  rangeDays: HistoryRange,
): Promise<{ content: Child[]; countLabel: string }> {
  const now = Date.now();
  const samples = await loadCargoSamples(carrier.id, daysAgo(rangeDays, now), now);
  if (!samples.length) {
    return {
      content: [emptyState('No cargo history in this range', 'Sync this carrier to start recording cargo history.')],
      countLabel: `0 samples in ${rangeDays === 365 ? '1 year' : `${rangeDays} days`}`,
    };
  }

  const ranking = cargoRankingByCarrier.get(carrier.id) ?? 'value';
  const chart = buildCargoChart(samples, ranking);
  const rows = buildCargoRows(samples);
  const selectedFromChart = chart.series.find((series) => series.key !== '__other')?.key;
  const storedKey = cargoKeyByCarrier.get(carrier.id);
  const selectedKey =
    (storedKey && rows.some((row) => row.key === storedKey) ? storedKey : undefined) ??
    selectedFromChart ??
    rows[0]?.key ??
    '';
  if (selectedKey) cargoKeyByCarrier.set(carrier.id, selectedKey);

  const selectedRow = rows.find((row) => row.key === selectedKey);
  const series = downsampleCargoSeries(cargoCommoditySeries(samples, selectedKey));
  const labels = series.times.map((time) => formatDate(time));
  const uniqueSamples = new Set(samples.map((sample) => sample.t)).size;
  const chartFormat =
    ranking === 'value'
      ? (value: number) => `${formatCompact(value, 2)} cr`
      : (value: number) => `${formatCompact(value, 2)} t`;

  const rankingSelect = el(
    'label',
    { class: 'inline-field' },
    el('span', null, 'Rank by'),
    el(
      'select',
      {
        on: {
          change: (event) => {
            cargoRankingByCarrier.set(
              carrier.id,
              (event.currentTarget as HTMLSelectElement).value as CargoRanking,
            );
            requestRender();
          },
        },
      },
      ...CARGO_METRICS.map((metric) =>
        el(
          'option',
          { value: metric.value, selected: metric.value === ranking },
          metric.label,
        ),
      ),
    ),
  );

  const table = clickableTable(
    ['Commodity', 'Quantity', 'Value', 'Unit value', 'Change', 'Peak'],
    rows.map((row) => ({
      key: row.key,
      search: `${row.name} ${row.locName ?? ''}`,
      selected: row.key === selectedKey,
      onSelect: () => {
        cargoKeyByCarrier.set(carrier.id, row.key);
        requestRender();
      },
      cells: [
        row.locName || row.name,
        `${formatNumber(row.qty)} t`,
        formatCredits(row.value),
        formatCredits(row.unitValue),
        changeLabel(row.changePct),
        `${formatNumber(row.peakQty)} t`,
      ],
    })),
    cargoSearchByCarrier.get(carrier.id) ?? '',
    (value) => cargoSearchByCarrier.set(carrier.id, value),
    'No cargo commodities in this range.',
  );

  const lineValueChart = chartCard(
    'Line value',
    multiSeriesChart({
      series: [{ label: 'Line value', values: series.value }],
      labels,
      step: true,
      valueLabel: 'Line value',
      format: (value) => formatCredits(value),
    }),
    null,
  );
  lineValueChart.classList.add('span-two');

  return {
    content: [
      el(
        'div',
        { class: 'history-controls' },
        rankingSelect,
        el(
          'span',
          { class: 'muted small' },
          `Top ${Math.min(5, rows.length)} of ${rows.length} · ${uniqueSamples} samples`,
        ),
      ),
      chartCard(
        `${cargoMetricLabel(ranking)} · top cargo`,
        multiSeriesChart({
          series: chart.series,
          labels: chart.labels,
          stacked: chart.stacked,
          step: false,
          valueLabel: cargoMetricLabel(ranking),
          format: chartFormat,
        }),
        legend(chart.series),
        `Ranked over ${rangeDays === 365 ? '1 year' : `${rangeDays} days`}; ${
          chart.other
            ? 'remaining commodities are grouped as Other.'
            : chart.series.length < rows.length
              ? 'other commodities are omitted from the chart.'
              : 'all commodities are shown.'
        }`,
      ),
      el(
        'section',
        { class: 'section' },
        el('h2', { class: 'section-title' }, 'Selected cargo'),
        el('p', { class: 'chart-latest' }, selectedRow?.locName || selectedRow?.name || '—'),
        el(
          'div',
          { class: 'chart-grid' },
          chartCard(
            'Quantity',
            multiSeriesChart({
              series: [{ label: 'Quantity', values: series.qty }],
              labels,
              step: true,
              valueLabel: 'Quantity',
              format: (value) => `${formatNumber(value)} t`,
            }),
            null,
          ),
          chartCard(
            'Unit value',
            multiSeriesChart({
              series: [{ label: 'Unit value', values: series.unitValue }],
              labels,
              step: true,
              valueLabel: 'Unit value',
              format: (value) => formatCredits(value),
            }),
            null,
          ),
          lineValueChart,
        ),
      ),
      el(
        'section',
        { class: 'section' },
        el('h2', { class: 'section-title' }, 'All cargo'),
        table.node,
      ),
    ],
    countLabel: `${uniqueSamples} samples · ${rows.length} commodities in ${rangeDays === 365 ? '1 year' : `${rangeDays} days`}`,
  };
}

export async function renderHistoryTab(carrier: CarrierRecord): Promise<Child[]> {
  const view = viewFor(carrier.id);
  const rangeDays = rangeFor(carrier.id, view);
  let result: { content: Child[]; countLabel: string };

  if (view === 'market') {
    result = await marketContent(carrier, rangeDays);
  } else if (view === 'cargo') {
    result = await cargoContent(carrier, rangeDays);
  } else {
    const now = Date.now();
    const rows = await summariesForCarrier(carrier.id, daysAgo(rangeDays, now), now);
    result = overviewContent(rows, rangeDays);
  }

  const toolbar = el(
    'div',
    { class: 'tab-toolbar history-toolbar' },
    el(
      'div',
      { class: 'toolbar-group' },
      viewButtons(carrier.id, view),
      rangeButtons(carrier.id, view, rangeDays),
    ),
    el('span', { class: 'muted small' }, result.countLabel),
  );

  return [toolbar, ...result.content];
}
