import { isDemoAccount, reauthAccount } from '../../auth/accounts';
import { cooldownRemaining, countdownLabel } from '../../capi/cooldown';
import type { FleetCarrierResponse, SummaryMetrics } from '../../capi/types';
import { formatCredits, formatNumber, formatText, humanizeKey } from '../../lib/format';
import { carrierDisplayName } from '../../lib/hex';
import { formatDateTime, formatDuration, formatRelative, parseCapiDate } from '../../lib/time';
import { userMessage } from '../../lib/errors';
import {
  getAccount,
  getCarrier,
  latestSnapshotForCarrier,
  latestSummaryForCarrier,
} from '../../storage/repos';
import type { AccountRecord, CarrierRecord, SnapshotRecord } from '../../storage/schema';
import { el, type Child } from '../dom';
import { badge, emptyState, infoGrid, pageHeader, section, stat } from '../layout';
import { syncAndReport } from '../router';
import { dataTable, keyValueTable } from '../components/table';
import { showToast } from '../components/toast';
import { CARRIER_TABS, carrierHref, type CarrierTab } from '../route';
import type { PageContext, PageResult } from './types';

function dash(value: unknown): string {
  return formatText(value);
}

function num(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? formatNumber(value) : '—';
}

function credits(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? formatCredits(value) : '—';
}

function toneForState(state: string): 'ok' | 'warn' | 'danger' | 'neutral' {
  if (state === 'normalOperation') return 'ok';
  if (state === 'debtState') return 'danger';
  if (state === 'pendingDecommission') return 'warn';
  return 'neutral';
}

function tabLabel(tab: CarrierTab): string {
  return tab === 'raw' ? 'Raw JSON' : tab.charAt(0).toUpperCase() + tab.slice(1);
}

function syncAction(account: AccountRecord): HTMLElement {
  const remaining = cooldownRemaining(account.sync.nextAllowedAt);
  if (account.needsReauth && !isDemoAccount(account)) {
    return el(
      'button',
      {
        class: 'btn btn-primary btn-small',
        type: 'button',
        on: {
          click: () => {
            void reauthAccount(account.id).catch((error: unknown) =>
              showToast(userMessage(error), 'error'),
            );
          },
        },
      },
      'Reconnect account',
    );
  }
  return el(
    'button',
    {
      class: 'btn btn-primary btn-small',
      type: 'button',
      disabled: remaining > 0,
      dataset: { nextAllowed: account.sync.nextAllowedAt ?? 0 },
      on: {
        click: async (event) => {
          const button = event.currentTarget as HTMLButtonElement;
          button.disabled = true;
          button.textContent = 'Syncing…';
          await syncAndReport(account.id);
        },
      },
    },
    remaining > 0 ? `Sync in ${countdownLabel(account.sync.nextAllowedAt)}` : 'Sync now',
  );
}

function overview(
  carrier: CarrierRecord,
  data: FleetCarrierResponse | null,
  summary: SummaryMetrics | null,
): Child[] {
  const metrics = summary;
  const finance = data?.finance;
  const capacity = data?.capacity;
  const itinerary = data?.itinerary;

  return [
    el(
      'div',
      { class: 'stat-row' },
      stat('Carrier balance', credits(metrics?.balance ?? data?.balance)),
      stat('Fuel', `${num(metrics?.fuel ?? data?.fuel)} / 1,000 t`),
      stat('Free capacity', `${num(metrics?.capacity?.free ?? capacity?.freeSpace)} t`),
      stat('Weekly upkeep', credits(finance?.maintenance ?? metrics?.finance?.maintenance)),
    ),
    el(
      'div',
      { class: 'two-column' },
      section(
        'Carrier',
        infoGrid([
          ['Callsign', carrier.callsign],
          ['Name', carrier.vanityName],
          ['System', dash(carrier.currentSystem)],
          ['State', humanizeKey(dash(data?.state ?? metrics?.state))],
          ['Theme', dash(data?.theme)],
          ['Docking access', humanizeKey(dash(data?.dockingAccess))],
          ['Notorious access', data?.notoriousAccess === undefined ? '—' : data.notoriousAccess ? 'Yes' : 'No'],
          ['Current jump', dash(itinerary?.currentJump ?? metrics?.currentJump)],
          ['Total distance', `${formatNumber(itinerary?.totalDistanceJumpedLY ?? metrics?.totalDistanceLY ?? 0)} ly`],
        ]),
      ),
      section(
        'Capacity',
        infoGrid([
          ['Total capacity', `${num(metrics?.capacity?.total)} t`],
          ['Free space', `${num(capacity?.freeSpace ?? metrics?.capacity?.free)} t`],
          ['Cargo for sale', `${num(capacity?.cargoForSale ?? metrics?.capacity?.cargoForSale)} t`],
          ['Cargo not for sale', `${num(capacity?.cargoNotForSale ?? metrics?.capacity?.cargoNotForSale)} t`],
          ['Reserved for purchases', `${num(capacity?.cargoSpaceReserved ?? metrics?.capacity?.reserved)} t`],
          ['Ship packs', `${num(capacity?.shipPacks)} t`],
          ['Module packs', `${num(capacity?.modulePacks)} t`],
          ['Crew', `${num(capacity?.crew)} t`],
        ]),
      ),
    ),
    section(
      'Finances',
      infoGrid([
        ['Bank balance', credits(finance?.bankBalance ?? metrics?.finance?.bankBalance)],
        ['Reserved balance', credits(finance?.bankReservedBalance ?? metrics?.finance?.reserved)],
        ['Core upkeep', credits(finance?.coreCost ?? metrics?.finance?.coreCost)],
        ['Services upkeep', credits(finance?.servicesCost ?? metrics?.finance?.servicesCost)],
        ['Jump costs this week', credits(finance?.jumpsCost ?? metrics?.finance?.jumpsCost)],
        ['Debt threshold', credits(finance?.debtThreshold ?? metrics?.finance?.debtThreshold)],
        ['Market cargo value', credits(data?.marketFinances?.cargoTotalValue ?? metrics?.market?.cargoTotalValue)],
        ['Market all-time profit', credits(data?.marketFinances?.allTimeProfit ?? metrics?.market?.allTimeProfit)],
      ]),
    ),
  ];
}

function marketTab(data: FleetCarrierResponse): Child[] {
  const commodities = Array.isArray(data.market?.commodities) ? data.market.commodities : [];
  const orders = data.orders?.commodities;
  const micro = data.orders?.onfootmicroresources;
  const microSales = Array.isArray(micro?.sales)
    ? micro.sales
    : micro?.sales && typeof micro.sales === 'object'
      ? Object.values(micro.sales)
      : [];
  const sales = Array.isArray(orders?.sales) ? orders.sales : [];
  const purchases = Array.isArray(orders?.purchases) ? orders.purchases : [];
  const microPurchases = Array.isArray(micro?.purchases) ? micro.purchases : [];

  return [
    section(
      'Commodity market',
      dataTable(
        ['Commodity', 'Stock', 'Buy', 'Sell', 'Demand', 'Category'],
        commodities.map((item) => [
          item.locName || item.name || '—',
          num(item.stock),
          credits(item.buyPrice),
          credits(item.sellPrice),
          num(item.demand),
          dash(item.categoryname),
        ]),
        { emptyText: 'No commodity market data in this snapshot.' },
      ),
    ),
    section(
      'Sell orders',
      dataTable(
        ['Commodity', 'Stock', 'Price', 'Black market'],
        sales.map((order) => [
          dash(order.name),
          num(order.stock),
          credits(order.price),
          order.blackmarket ? 'Yes' : 'No',
        ]),
        { emptyText: 'No sell orders.' },
      ),
    ),
    section(
      'Buy orders',
      dataTable(
        ['Commodity', 'Total', 'Outstanding', 'Price'],
        purchases.map((order) => [
          dash(order.name),
          num(order.total),
          num(order.outstanding),
          credits(order.price),
        ]),
        { emptyText: 'No buy orders.' },
      ),
    ),
    section(
      'Micro-resource sell orders',
      dataTable(
        ['Resource', 'Stock', 'Price'],
        microSales.map((order) => [
          order.locName || order.name || '—',
          num(order.stock),
          credits(order.price),
        ]),
        { emptyText: 'No micro-resource sell orders.' },
      ),
    ),
    section(
      'Micro-resource buy orders',
      dataTable(
        ['Resource', 'Total', 'Outstanding', 'Price'],
        microPurchases.map((order) => [
          order.locName || order.name || '—',
          num(order.total),
          num(order.outstanding),
          credits(order.price),
        ]),
        { emptyText: 'No micro-resource buy orders.' },
      ),
    ),
  ];
}

function financesTab(data: FleetCarrierResponse): Child[] {
  const finance = data.finance ?? {};
  const market = data.marketFinances ?? {};
  const blackmarket = data.blackmarketFinances ?? {};
  const taxation = finance.service_taxation ?? {};

  return [
    el(
      'div',
      { class: 'two-column' },
      section(
        'Carrier finance',
        infoGrid([
          ['Bank balance', credits(finance.bankBalance)],
          ['Reserved balance', credits(finance.bankReservedBalance)],
          ['Taxation', `${num(finance.taxation)}%`],
          ['Installed services', num(finance.numServices)],
          ['Optional services', num(finance.numOptionalServices)],
          ['Core cost', credits(finance.coreCost)],
          ['Services cost', credits(finance.servicesCost)],
          ['Jumps cost', credits(finance.jumpsCost)],
          ['Jumps this week', num(finance.numJumps)],
          ['Maintenance', credits(finance.maintenance)],
          ['Maintenance to date', credits(finance.maintenanceToDate)],
          ['Debt threshold', credits(finance.debtThreshold)],
        ]),
      ),
      section(
        'Market finance',
        keyValueTable([
          ['Cargo total value', credits(market.cargoTotalValue)],
          ['All-time profit', credits(market.allTimeProfit)],
          ['Commodities for sale', num(market.numCommodsForSale)],
          ['Purchase orders', num(market.numCommodsPurchaseOrders)],
          ['Allocated for purchases', credits(market.balanceAllocForPurchaseOrders)],
          ['Black market profit', credits(blackmarket.allTimeProfit)],
        ]),
      ),
    ),
    section(
      'Service taxation',
      dataTable(
        ['Service', 'Tax rate'],
        Object.entries(taxation).map(([key, value]) => [humanizeKey(key), `${num(value)}%`]),
        { emptyText: 'No service taxation data.' },
      ),
    ),
  ];
}

function cargoTab(data: FleetCarrierResponse): Child[] {
  const cargo = Array.isArray(data.cargo) ? data.cargo : [];
  const locker = data.carrierLocker ?? {};
  const assets = Array.isArray(locker.assets) ? locker.assets : [];
  const goods = Array.isArray(locker.goods) ? locker.goods : [];
  const dataItems = Array.isArray(locker.data) ? locker.data : [];
  return [
    section(
      'Cargo',
      dataTable(
        ['Commodity', 'Quantity', 'Unit value', 'Stolen', 'Mission'],
        cargo.map((line) => [
          line.locName || line.commodity || '—',
          num(line.qty),
          credits(line.value),
          line.stolen ? 'Yes' : 'No',
          line.mission ? 'Yes' : 'No',
        ]),
        { emptyText: 'No cargo aboard.' },
      ),
    ),
    section(
      'Carrier locker',
      dataTable(
        ['Type', 'Resource', 'Quantity'],
        [
          ...assets.map((item) => ['Asset', item.locName || item.name || '—', num(item.quantity)]),
          ...goods.map((item) => ['Good', item.locName || item.name || '—', num(item.quantity)]),
          ...dataItems.map((item) => ['Data', item.locName || item.name || '—', num(item.quantity)]),
        ],
        { emptyText: 'No micro-resources stored.' },
      ),
    ),
  ];
}

function itineraryTab(data: FleetCarrierResponse): Child[] {
  const itinerary = data.itinerary;
  const completed = Array.isArray(itinerary?.completed) ? [...itinerary.completed] : [];
  completed.reverse();
  return [
    el(
      'div',
      { class: 'stat-row' },
      stat('Current jump', dash(itinerary?.currentJump)),
      stat('Total distance', `${formatNumber(itinerary?.totalDistanceJumpedLY ?? 0)} ly`),
      stat('Recorded jumps', completed.length),
    ),
    section(
      'Jump history',
      dataTable(
        ['System', 'Arrival', 'Departure', 'Visit'],
        completed.map((entry) => [
          dash(entry.starsystem),
          formatDateTime(parseCapiDate(entry.arrivalTime) ?? entry.arrivalTime),
          formatDateTime(parseCapiDate(entry.departureTime) ?? entry.departureTime),
          formatDuration((entry.visitDurationSeconds ?? 0) * 1000),
        ]),
        { emptyText: 'No completed jumps in this snapshot.' },
      ),
    ),
  ];
}

function servicesTab(data: FleetCarrierResponse): Child[] {
  const services = data.servicesCrew ?? {};
  const rows = Object.entries(services)
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => [
      humanizeKey(key),
      value?.crewMember?.name || '—',
      value?.crewMember?.enabled === undefined
        ? '—'
        : value.crewMember.enabled === true || value.crewMember.enabled === 'YES'
          ? 'Yes'
          : 'No',
      credits(value?.crewMember?.salary),
      dash(value?.status),
    ]);

  return [
    section(
      'Services and crew',
      dataTable(['Service', 'Crew member', 'Enabled', 'Weekly salary', 'Status'], rows, {
        emptyText: 'No service crew data.',
      }),
    ),
    section(
      'Reputation',
      dataTable(
        ['Major faction', 'Score'],
        (Array.isArray(data.reputation) ? data.reputation : []).map((entry) => [
          humanizeKey(dash(entry.majorFaction)),
          num(entry.score),
        ]),
        { emptyText: 'No reputation data.' },
      ),
    ),
  ];
}

async function rawTab(snapshot: SnapshotRecord | null): Promise<Child[]> {
  if (!snapshot) {
    return [
      el(
        'p',
        { class: 'muted' },
        'No full snapshot is retained. Raw snapshots expire after 7 days, but the latest snapshot per carrier is normally kept.',
      ),
    ];
  }
  const json = JSON.stringify(snapshot.raw, null, 2);
  return [
    el(
      'div',
      { class: 'raw-actions' },
      el(
        'button',
        {
          class: 'btn btn-secondary btn-small',
          type: 'button',
          on: {
            click: () => {
              if (!navigator.clipboard) {
                showToast('Clipboard access is not available in this browser.', 'error');
                return;
              }
              void navigator.clipboard
                .writeText(json)
                .then(() => showToast('Raw JSON copied.', 'success'))
                .catch(() => showToast('Could not copy JSON.', 'error'));
            },
          },
        },
        'Copy JSON',
      ),
      el(
        'button',
        {
          class: 'btn btn-secondary btn-small',
          type: 'button',
          on: {
            click: () => {
              const blob = new Blob([json], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const anchor = el('a', { href: url, download: `${snapshot.carrierId}.json` });
              document.body.append(anchor);
              anchor.click();
              anchor.remove();
              window.setTimeout(() => URL.revokeObjectURL(url), 1000);
            },
          },
        },
        'Download JSON',
      ),
    ),
    el('pre', { class: 'raw-json' }, json),
  ];
}

export async function renderCarrier(
  _context: PageContext,
  route: Extract<PageContext['route'], { name: 'carrier' }>,
): Promise<PageResult> {
  const carrier = await getCarrier(route.carrierId);
  if (!carrier) {
    return {
      node: el(
        'div',
        null,
        emptyState('Carrier not found', 'It may have been removed with its account.', el('a', { class: 'btn', href: '#/' }, 'Back to carriers')),
      ),
    };
  }

  const [account, snapshot, summaryRecord] = await Promise.all([
    getAccount(carrier.accountId),
    latestSnapshotForCarrier(carrier.id),
    latestSummaryForCarrier(carrier.id),
  ]);
  const data = snapshot?.raw ?? null;
  const summary = summaryRecord?.metrics ?? null;
  const displayName =
    carrier.vanityName || carrier.callsign || carrierDisplayName(data?.name) || 'Unknown carrier';

  const tabNav = el(
    'nav',
    { class: 'tabs', 'aria-label': 'Carrier sections' },
    ...CARRIER_TABS.map((tab) =>
      el(
        'a',
        {
          class: tab === route.tab ? 'tab active' : 'tab',
          href: carrierHref(carrier.id, tab),
          'aria-current': tab === route.tab ? 'page' : null,
        },
        tabLabel(tab),
      ),
    ),
  );

  let tabContent: Child[];
  switch (route.tab) {
    case 'market':
      tabContent = data ? marketTab(data) : [emptyState('No snapshot', 'Sync this carrier to fetch market data.')];
      break;
    case 'finances':
      tabContent = data ? financesTab(data) : [emptyState('No snapshot', 'Sync this carrier to fetch finance data.')];
      break;
    case 'cargo':
      tabContent = data ? cargoTab(data) : [emptyState('No snapshot', 'Sync this carrier to fetch cargo data.')];
      break;
    case 'itinerary':
      tabContent = data ? itineraryTab(data) : [emptyState('No snapshot', 'Sync this carrier to fetch itinerary data.')];
      break;
    case 'services':
      tabContent = data ? servicesTab(data) : [emptyState('No snapshot', 'Sync this carrier to fetch service data.')];
      break;
    case 'raw':
      tabContent = await rawTab(snapshot);
      break;
    case 'overview':
    default:
      tabContent = overview(carrier, data, summary);
      break;
  }

  const actions: Child[] = [
    el('a', { class: 'btn btn-ghost btn-small', href: '#/' }, 'Back'),
  ];
  if (account) actions.push(syncAction(account));

  const interval = window.setInterval(() => {
    document.querySelectorAll<HTMLButtonElement>('.page-actions .btn-primary').forEach((button) => {
      const nextAllowed = Number(button.dataset.nextAllowed ?? 0);
      if (!nextAllowed) return;
      const remaining = cooldownRemaining(nextAllowed);
      if (remaining > 0) {
        button.disabled = true;
        button.textContent = `Sync in ${countdownLabel(nextAllowed)}`;
      } else {
        button.disabled = false;
        button.textContent = 'Sync now';
      }
    });
  }, 1000);

  return {
    node: el(
      'div',
      null,
      pageHeader(displayName, `${carrier.callsign} · ${carrier.currentSystem}`, actions),
      el(
        'div',
        { class: 'carrier-status-line' },
        data
          ? badge(humanizeKey(data.state || 'unknown'), toneForState(data.state || 'unknown'))
          : null,
        data?.theme ? badge(data.theme, 'accent') : null,
        summary ? badge(`Updated ${formatRelative(summaryRecord?.fetchedAt)}`, 'neutral') : badge('No data', 'neutral'),
        account?.needsReauth && !isDemoAccount(account)
          ? badge('Reconnect required', 'danger')
          : null,
      ),
      tabNav,
      el('div', { class: 'tab-panel' }, ...tabContent),
    ),
    cleanup: () => window.clearInterval(interval),
  };
}
