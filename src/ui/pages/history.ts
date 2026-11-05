import { formatCompact, formatCredits, formatNumber } from '../../lib/format';
import { daysAgo, formatDate, formatRelative } from '../../lib/time';
import { summariesForCarrier } from '../../storage/repos';
import type { CarrierRecord, SummaryRecord } from '../../storage/schema';
import { el, type Child } from '../dom';
import { requestRender } from '../events';
import { emptyState, stat } from '../layout';
import { lineChart } from '../components/chart';
import { dataTable } from '../components/table';

const RANGES = [7, 30, 90] as const;
type RangeDays = (typeof RANGES)[number];

const rangeByCarrier = new Map<string, RangeDays>();

function deltaLabel(
  first: number | undefined,
  last: number | undefined,
  format: (value: number) => string = formatNumber,
): string {
  if (first === undefined || last === undefined) return 'No change data';
  const delta = last - first;
  const sign = delta > 0 ? '+' : '';
  return `${sign}${format(delta)} over range`;
}

function deltaCredits(value: number): string {
  return formatCredits(value);
}

function deltaTons(value: number): string {
  return `${formatNumber(value)} t`;
}

function timeline(
  rows: SummaryRecord[],
): Array<{ fetchedAt: number; system: string; balance: number; fuel: number }> {
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
}

export async function renderHistoryTab(carrier: CarrierRecord): Promise<Child[]> {
  const rangeDays = rangeByCarrier.get(carrier.id) ?? 30;
  const now = Date.now();
  const rows = await summariesForCarrier(carrier.id, daysAgo(rangeDays, now), now);
  const chartRows =
    rows.length > 400
      ? rows.filter(
          (_, index) =>
            index % Math.ceil(rows.length / 400) === 0 || index === rows.length - 1,
        )
      : rows;
  const labels = chartRows.map((row) => formatDate(row.fetchedAt));

  const rangeButtons = el(
    'div',
    { class: 'segmented', role: 'group', 'aria-label': 'History range' },
    ...RANGES.map((days) =>
      el(
        'button',
        {
          type: 'button',
          class: days === rangeDays ? 'segment active' : 'segment',
          on: {
            click: () => {
              rangeByCarrier.set(carrier.id, days);
              requestRender();
            },
          },
        },
        `${days} days`,
      ),
    ),
  );

  const toolbar = el(
    'div',
    { class: 'tab-toolbar' },
    rangeButtons,
    el(
      'span',
      { class: 'muted small' },
      `${rows.length} snapshot${rows.length === 1 ? '' : 's'} in ${rangeDays} days`,
    ),
  );

  if (!rows.length) {
    return [
      toolbar,
      emptyState(
        'No history in this range',
        'Sync this carrier to start building a timeline.',
      ),
    ];
  }

  const first = rows[0]?.metrics;
  const last = rows[rows.length - 1]?.metrics;
  const chartCards = [
    {
      title: 'Carrier balance',
      values: chartRows.map((row) => row.metrics.balance ?? 0),
      latest: last ? formatCredits(last.balance) : '—',
      delta: deltaLabel(first?.balance, last?.balance, deltaCredits),
      color: 'var(--accent)',
    },
    {
      title: 'Fuel reserve',
      values: chartRows.map((row) => row.metrics.fuel ?? 0),
      latest: last ? `${formatNumber(last.fuel)} t` : '—',
      delta: deltaLabel(first?.fuel, last?.fuel, deltaTons),
      color: 'var(--cyan)',
    },
    {
      title: 'Free capacity',
      values: chartRows.map((row) => row.metrics.capacity?.free ?? 0),
      latest: last ? `${formatNumber(last.capacity?.free)} t` : '—',
      delta: deltaLabel(first?.capacity?.free, last?.capacity?.free, deltaTons),
      color: 'var(--green)',
    },
    {
      title: 'Market all-time profit',
      values: chartRows.map((row) => row.metrics.market?.allTimeProfit ?? 0),
      latest: last ? formatCredits(last.market?.allTimeProfit) : '—',
      delta: deltaLabel(first?.market?.allTimeProfit, last?.market?.allTimeProfit, deltaCredits),
      color: 'var(--violet)',
    },
  ];

  const stops = timeline(rows);
  const recent = [...rows].reverse().slice(0, 20);

  return [
    toolbar,
    el(
      'div',
      { class: 'chart-grid' },
      ...chartCards.map((chart) =>
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
            format:
              chart.title === 'Carrier balance' || chart.title === 'Market all-time profit'
                ? (value) => `${formatCompact(value, 2)} cr`
                : (value) => `${formatCompact(value, 2)} t`,
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
          recent.map((row) => [
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
  ];
}
