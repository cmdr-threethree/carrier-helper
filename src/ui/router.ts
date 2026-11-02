import { resolveSelectedAccount, setSelectedAccountId } from '../auth/accounts';
import { connectAccountWithPrompt } from './account-actions';
import { config } from '../config';
import { isAppError, toAppError, userMessage } from '../lib/errors';
import { log } from '../lib/log';
import { listAccounts } from '../storage/repos';
import { syncAccount } from '../sync';
import { el } from './dom';
import { showToast } from './components/toast';
import { RERENDER_EVENT } from './events';
import { createFooter, createHeader, emptyState } from './layout';
import { renderCarrier } from './pages/carrier';
import { renderDashboard } from './pages/dashboard';
import { renderHistory } from './pages/history';
import { renderSettings } from './pages/settings';
import type { PageContext, PageResult } from './pages/types';
import { parseRoute, type Route } from './route';

let cleanup: (() => void) | null = null;
let renderToken = 0;
let started = false;
let scheduled = false;

function scheduleRender(): void {
  if (scheduled) return;
  scheduled = true;
  window.setTimeout(() => {
    scheduled = false;
    void renderApp();
  }, 0);
}

export function navigate(hash: string): void {
  if (window.location.hash === hash) {
    void renderApp();
    return;
  }
  window.location.hash = hash;
}

function errorPage(error: unknown): HTMLElement {
  return el(
    'div',
    { class: 'page narrow' },
    emptyState(
      'Something went wrong',
      userMessage(error),
      el(
        'button',
        { class: 'btn', type: 'button', on: { click: () => void renderApp() } },
        'Try again',
      ),
    ),
  );
}

async function renderPage(context: PageContext): Promise<PageResult> {
  switch (context.route.name) {
    case 'carrier':
      return renderCarrier(context, context.route);
    case 'history':
      return renderHistory(context);
    case 'settings':
      return renderSettings(context);
    case 'dashboard':
    default:
      return renderDashboard(context);
  }
}

async function renderApp(): Promise<void> {
  const token = ++renderToken;
  const app = document.getElementById('app');
  if (!app) return;

  cleanup?.();
  cleanup = null;
  app.replaceChildren(el('div', { class: 'boot' }, 'Loading Carrier Helper…'));

  try {
    const accounts = await listAccounts();
    const selectedAccount = resolveSelectedAccount(accounts);
    if (token !== renderToken) return;

    const route = parseRoute(window.location.hash);
    const context: PageContext = {
      route,
      accounts,
      selectedAccount,
      navigate,
    };
    const page = await renderPage(context);
    if (token !== renderToken) return;

    cleanup = page.cleanup ?? null;
    const header = createHeader({
      accounts,
      selectedAccount,
      route,
      onSelectAccount: (accountId) => {
        setSelectedAccountId(accountId);
        if (route.name === 'carrier') navigate('#/');
        else scheduleRender();
      },
      onAddAccount: () => {
        void connectAccountWithPrompt()
          .then((account) => {
            if (account) scheduleRender();
          })
          .catch((error: unknown) => showToast(userMessage(error), 'error'));
      },
    });

    app.replaceChildren(
      header,
      el(
        'main',
        { class: 'page' },
        config.mockAuth ? el('div', { class: 'demo-banner' }, 'Demo mode: accounts and carrier data are generated locally.') : null,
        page.node,
      ),
      createFooter(),
    );
  } catch (error) {
    if (token !== renderToken) return;
    log.error('Render failed', error);
    app.replaceChildren(errorPage(error));
  }
}

export function startRouter(): void {
  if (started) return;
  started = true;
  window.addEventListener('hashchange', scheduleRender);
  window.addEventListener(RERENDER_EVENT, scheduleRender);
  window.addEventListener('carrier-helper:account-changed', scheduleRender);
  window.addEventListener('online', () => showToast('Back online.', 'success', 2500));
  window.addEventListener('offline', () => showToast('You are offline.', 'warning', 3500));
  void renderApp();
}

export async function syncAndReport(accountId: string): Promise<void> {
  try {
    const result = await syncAccount(accountId);
    if (result.status === 'success') {
      showToast('Carrier data updated.', 'success');
    } else if (result.status === 'cooldown') {
      showToast('Sync is still cooling down.', 'warning');
    } else if (result.status === 'no-carrier') {
      showToast('This account does not own a fleet carrier.', 'warning');
    } else if (result.error.code !== 'auth') {
      showToast(userMessage(result.error), 'error');
    }
    if (result.status === 'failed' && result.error.code === 'auth') {
      showToast(userMessage(result.error), 'error');
    }
    scheduleRender();
  } catch (error) {
    if (isAppError(error) && error.code === 'not_found') {
      showToast(userMessage(error), 'error');
    } else {
      showToast(userMessage(toAppError(error)), 'error');
    }
    scheduleRender();
  }
}

export function activeRoute(): Route {
  return parseRoute(window.location.hash);
}
