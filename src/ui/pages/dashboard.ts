import {
  accountLabel,
  authorizationWarning,
  connectAccount,
  isDemoAccount,
  reauthAccount,
} from '../../auth/accounts';
import { cooldownRemaining, countdownLabel } from '../../capi/cooldown';
import type { SummaryRecord } from '../../storage/schema';
import type { AccountRecord, CarrierRecord } from '../../storage/schema';
import { configurationProblem, config } from '../../config';
import { userMessage } from '../../lib/errors';
import { formatCompact, formatNumber, humanizeKey } from '../../lib/format';
import { formatRelative } from '../../lib/time';
import {
  latestSummaryForCarrier,
  listCarriers,
} from '../../storage/repos';
import { el } from '../dom';
import { requestRender } from '../events';
import { badge, emptyState, pageHeader, stat } from '../layout';
import { syncAndReport } from '../router';
import { showToast } from '../components/toast';
import type { PageContext, PageResult } from './types';

interface AccountView {
  account: AccountRecord;
  carrier: CarrierRecord | null;
  summary: SummaryRecord | null;
}

function stateTone(state: string): 'ok' | 'warn' | 'danger' | 'neutral' {
  if (state === 'normalOperation') return 'ok';
  if (state === 'debtState') return 'danger';
  if (state === 'pendingDecommission') return 'warn';
  return 'neutral';
}

function accountCard(view: AccountView): HTMLElement {
  const { account, carrier, summary } = view;
  const metrics = summary?.metrics;
  const remaining = cooldownRemaining(account.sync.nextAllowedAt);
  const needsReauth = account.needsReauth && !isDemoAccount(account);
  const syncDisabled = remaining > 0 || needsReauth;

  const syncButton = el(
    'button',
    {
      class: 'btn btn-primary btn-small sync-button',
      type: 'button',
      disabled: syncDisabled,
      dataset: {
        nextAllowed: account.sync.nextAllowedAt ?? 0,
        accountId: account.id,
      },
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

  const actions: Node[] = [];
  if (needsReauth) {
    actions.push(
      el(
        'button',
        {
          class: 'btn btn-secondary btn-small',
          type: 'button',
          on: {
            click: () => {
              void reauthAccount(account.id).catch((error: unknown) =>
                showToast(userMessage(error), 'error'),
              );
            },
          },
        },
        'Reconnect',
      ),
    );
  }
  actions.push(syncButton);

  if (carrier) {
    actions.push(
      el(
        'a',
        { class: 'btn btn-ghost btn-small', href: `#/carrier/${encodeURIComponent(carrier.id)}` },
        'Open carrier',
      ),
    );
  }

  const status = needsReauth
    ? badge('Reconnect required', 'danger')
    : metrics
      ? badge(humanizeKey(metrics.state || 'unknown'), stateTone(metrics.state || 'unknown'))
      : badge('No data yet', 'neutral');

  return el(
    'article',
    { class: 'carrier-card' },
    el(
      'div',
      { class: 'carrier-card-head' },
      el(
        'div',
        null,
        el(
          'h2',
          { class: 'carrier-name' },
          carrier ? carrier.vanityName || carrier.callsign : accountLabel(account),
        ),
        el(
          'p',
          { class: 'carrier-meta' },
          carrier ? carrier.callsign : 'No carrier linked',
          carrier ? ' · ' : '',
          carrier ? carrier.currentSystem : '',
          isDemoAccount(account) ? el('span', { class: 'pill pill-demo' }, 'demo') : null,
        ),
      ),
      status,
    ),
    metrics
      ? el(
          'div',
          { class: 'stat-row' },
          stat('Balance', `${formatCompact(metrics.balance)} cr`),
          stat('Fuel', `${formatNumber(metrics.fuel)} / 1,000 t`),
          stat('Market profit', `${formatCompact(metrics.market?.allTimeProfit ?? 0)} cr`),
          stat('Free space', `${formatNumber(metrics.capacity?.free ?? 0)} t`),
        )
      : el(
          'p',
          { class: 'muted card-note' },
          needsReauth
            ? 'Reconnect this account to fetch carrier data.'
            : 'No carrier snapshot has been stored yet. Run a sync when the cooldown allows.',
        ),
    account.sync.lastError
      ? el('p', { class: 'inline-error' }, account.sync.lastError)
      : null,
    authorizationWarning(account)
      ? el('p', { class: 'inline-warning' }, authorizationWarning(account))
      : null,
    el(
      'div',
      { class: 'carrier-card-foot' },
      el(
        'span',
        { class: 'muted small' },
        `Last sync: ${formatRelative(account.sync.lastSuccessAt)}`,
      ),
      el('div', { class: 'card-actions' }, ...actions),
    ),
  );
}

export async function renderDashboard(context: PageContext): Promise<PageResult> {
  const views: AccountView[] = await Promise.all(
    context.accounts.map(async (account) => {
      const carriers = await listCarriers(account.id);
      const carrier =
        carriers.find((candidate) => candidate.id === account.carrierId) ?? carriers[0] ?? null;
      const summary = carrier ? await latestSummaryForCarrier(carrier.id) : null;
      return { account, carrier, summary };
    }),
  );

  const problem = configurationProblem();
  const addButton = el(
    'button',
    {
      class: 'btn btn-primary',
      type: 'button',
      on: {
        click: () => {
          void connectAccount()
            .then((account) => {
              if (account) requestRender();
            })
            .catch((error: unknown) => showToast(userMessage(error), 'error'));
        },
      },
    },
    config.mockAuth ? 'Create demo account' : 'Connect Frontier account',
  );

  let content: Node;
  if (!context.accounts.length) {
    content = emptyState(
      config.mockAuth ? 'Try Carrier Helper with demo data' : 'Connect your first Frontier account',
      problem ??
        (config.mockAuth
          ? 'Demo mode creates local accounts with 30 days of generated carrier history. No Frontier login is required.'
          : 'Carrier Helper uses Frontier OAuth with PKCE. Your tokens stay in this browser and are never uploaded.'),
      el(
        'div',
        { class: 'empty-actions' },
        addButton,
        config.mockAuth
          ? null
          : el(
              'a',
              { class: 'btn btn-ghost', href: '#/settings' },
              'Configuration help',
            ),
      ),
    );
  } else {
    content = el(
      'div',
      { class: 'dashboard' },
      problem ? el('div', { class: 'notice notice-warn' }, problem) : null,
      el('div', { class: 'carrier-grid' }, ...views.map(accountCard)),
      el(
        'div',
        { class: 'dashboard-footer' },
        el(
          'p',
          { class: 'muted small' },
          'Frontier CAPI requests are limited to one per commander every 15 minutes. Use each carrier’s Sync button when the countdown reaches zero.',
        ),
        addButton,
      ),
    );
  }

  const updateCountdowns = (): void => {
    const now = Date.now();
    document.querySelectorAll<HTMLButtonElement>('.sync-button').forEach((button) => {
      const nextAllowed = Number(button.dataset.nextAllowed ?? 0);
      const remaining = cooldownRemaining(nextAllowed, now);
      const accountId = button.dataset.accountId;
      const account = views.find((view) => view.account.id === accountId)?.account;
      if (remaining > 0) {
        button.disabled = true;
        button.textContent = `Sync in ${countdownLabel(nextAllowed, now)}`;
      } else {
        button.disabled = Boolean(account?.needsReauth && !isDemoAccount(account));
        button.textContent = 'Sync now';
      }
    });
  };
  const interval = window.setInterval(updateCountdowns, 1000);

  return {
    node: el(
      'div',
      null,
      pageHeader(
        'Fleet carriers',
        `${context.accounts.length} connected account${context.accounts.length === 1 ? '' : 's'} · local-first storage`,
      ),
      content,
    ),
    cleanup: () => window.clearInterval(interval),
  };
}
