import { accountLabel } from '../../auth/accounts';
import { formatCompact, formatCredits, formatNumber } from '../../lib/format';
import { daysAgo, formatDate, formatRelative } from '../../lib/time';
import {
  listCarriers,
  summariesForCarrier,
} from '../../storage/repos';
import type { SummaryRecord } from '../../storage/schema';
import { el, type Child } from '../dom';
import { requestRender } from '../events';
import { emptyState, pageHeader, stat } from '../layout';
import { lineChart } from '../components/chart';
import { dataTable } from '../components/table';
import { carrierHref } from '../route';
import type { PageContext, PageResult } from './types';

const RANGES = [7, 30, 90] as const;
let rangeDays: (typeof RANGES)[number] = 30;
let selectedCarrierId: string | null = null;
let lastAccountId: string | null = null;

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

function timeline(rows: SummaryRecord[]): Array<{ fetchedAt: number; system: string; balance: number; fuel: number }> {
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

export async function renderHistory(context: PageContext): Promise<PageResult> {
  const account = context.selectedAccount;
  if (!account) {
    return {
      node: el(
        'div',
        null,
        pageHeader('History', 'Carrier trends over time'),
        emptyState('No account connected', 'Connect a Frontier account to collect history.', el('a', { class: 'btn', href: '#/' }, 'Go to carriers')),
      ),
    };
  }

  if (lastAccountId !== account.id) {
    lastAccountId = account.id;
    selectedCarrierId = null;
  }

  const carriers = await listCarriers(account.id);
  if (!carriers.length) {
    return {
      node: el(
        'div',
        null,
        pageHeader('History', accountLabel(account)),
        emptyState('No carrier data yet', 'Run a sync on the carrier dashboard first.', el('a', { class: 'btn', href: '#/' }, 'Go to carriers')),
      ),
    };
  }

  const carrier =
    carriers.find((candidate) => candidate.id === (selectedCarrierId ?? account.carrierId)) ??
    carriers[0];
  if (!carrier) {
    return {
      node: el('div', null, emptyState('No carrier', 'No carrier is linked to this account.')),
    };
  }
  selectedCarrierId = carrier.id;
  const carrierName = carrier.vanityName || carrier.callsign;

  const now = Date.now();
  const rows = await summariesForCarrier(carrier.id, daysAgo(rangeDays, now), now);
  const chartRows =
    rows.length > 400
      ? rows.filter(
          (_, index) => index % Math.ceil(rows.length / 400) === 0 || index === rows.length - 1,
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
              rangeDays = days;
              requestRender();
            },
          },
        },
        `${days} days`,
      ),
    ),
  );

  const carrierSelect =
    carriers.length > 1
      ? el(
          'label',
          { class: 'inline-field' },
          el('span', null, 'Carrier'),
          el(
            'select',
            {
              on: {
                change: (event) => {
                  selectedCarrierId = (event.currentTarget as HTMLSelectElement).value;
                  requestRender();
                },
              },
            },
            ...carriers.map((candidate) =>
              el(
                'option',
                { value: candidate.id, selected: candidate.id === carrier.id },
                `${candidate.vanityName || candidate.callsign} · ${candidate.callsign}`,
              ),
            ),
          ),
        )
      : null;

  if (!rows.length) {
    return {
      node: el(
        'div',
        null,
        pageHeader('History', `${carrierName} · ${carrier.callsign}`, [rangeButtons, carrierSelect].filter(Boolean) as Child[]),
        emptyState('No history in this range', 'Sync the carrier to start building a timeline.', el('a', { class: 'btn', href: carrierHref(carrier.id) }, 'Open carrier')),
      ),
    };
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
      latest: last ? `${formatNumber(last.capacity.free)} t` : '—',
      delta: deltaLabel(first?.capacity?.free, last?.capacity?.free, deltaTons),
      color: 'var(--green)',
    },
    {
      title: 'Market all-time profit',
      values: chartRows.map((row) => row.metrics.market?.allTimeProfit ?? 0),
      latest: last ? formatCredits(last.market.allTimeProfit) : '—',
      delta: deltaLabel(first?.market?.allTimeProfit, last?.market?.allTimeProfit, deltaCredits),
      color: 'var(--violet)',
    },
  ];

  const stops = timeline(rows);
  const recent = [...rows].reverse().slice(0, 20);

  return {
    node: el(
      'div',
      null,
      pageHeader(
        'History',
        `${carrierName} · ${carrier.callsign} · ${rangeDays} days · ${rows.length} snapshots`,
        [rangeButtons, carrierSelect].filter(Boolean) as Child[],
      ),
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
        stat('Carrier', `${carrierName} · ${carrier.callsign}`),
      ),
    ),
  };
}
