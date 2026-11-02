import { accountLabel, isDemoAccount } from '../auth/accounts';
import type { AccountRecord } from '../storage/schema';
import { el, type Child } from './dom';
import { routeSection, type Route } from './route';

export function badge(text: string, tone: 'neutral' | 'ok' | 'warn' | 'danger' | 'accent' = 'neutral'): HTMLElement {
  return el('span', { class: `badge badge-${tone}` }, text);
}

function navLink(label: string, href: string, active: boolean): HTMLElement {
  return el(
    'a',
    {
      class: active ? 'nav-link active' : 'nav-link',
      href,
      'aria-current': active ? 'page' : null,
    },
    label,
  );
}

export function createHeader(input: {
  accounts: AccountRecord[];
  selectedAccount: AccountRecord | null;
  route: Route;
  onSelectAccount: (accountId: string) => void;
  onAddAccount: () => void;
}): HTMLElement {
  const { accounts, selectedAccount, route } = input;
  const section = routeSection(route);
  const select = el(
    'select',
    {
      class: 'account-select',
      'aria-label': 'Selected account',
      disabled: accounts.length === 0,
      on: {
        change: (event) => {
          const value = (event.currentTarget as HTMLSelectElement).value;
          if (value) input.onSelectAccount(value);
        },
      },
    },
    ...(accounts.length
      ? accounts.map((account) =>
          el(
            'option',
            { value: account.id, selected: account.id === selectedAccount?.id },
            `${accountLabel(account)}${isDemoAccount(account) ? ' (demo)' : ''}`,
          ),
        )
      : [el('option', { value: '' }, 'No accounts')]),
  );

  return el(
    'header',
    { class: 'site-header' },
    el(
      'div',
      { class: 'header-inner' },
      el(
        'a',
        { class: 'brand', href: '#/', 'aria-label': 'Carrier Helper home' },
        el('span', { class: 'brand-mark', 'aria-hidden': 'true' }, '◆'),
        el(
          'span',
          { class: 'brand-text' },
          el('strong', null, 'Carrier Helper'),
          el('small', null, 'Fleet carrier telemetry'),
        ),
      ),
      el(
        'nav',
        { class: 'main-nav', 'aria-label': 'Primary navigation' },
        navLink('Carriers', '#/', section === 'dashboard' || section === 'carrier'),
        navLink('History', '#/history', section === 'history'),
        navLink('Settings', '#/settings', section === 'settings'),
      ),
      el(
        'div',
        { class: 'header-actions' },
        accounts.length > 1
          ? el('label', { class: 'account-picker' }, el('span', null, 'Account'), select)
          : accounts.length === 1
            ? el('div', { class: 'account-picker' }, el('span', null, 'Account'), select)
            : null,
        el(
          'button',
          { class: 'btn btn-secondary btn-small', type: 'button', on: { click: input.onAddAccount } },
          '+ Connect',
        ),
      ),
    ),
  );
}

export function createFooter(): HTMLElement {
  return el(
    'footer',
    { class: 'site-footer' },
    el(
      'p',
      null,
      'Carrier Helper stores everything in this browser. Data is provided by the Frontier Companion API. ',
      el('a', { href: '#/settings' }, 'Privacy and data'),
    ),
  );
}

export function pageHeader(
  title: string,
  subtitle: string | null,
  actions: Child[] = [],
): HTMLElement {
  return el(
    'div',
    { class: 'page-header' },
    el('div', null, el('h1', null, title), subtitle ? el('p', { class: 'muted' }, subtitle) : null),
    actions.length ? el('div', { class: 'page-actions' }, ...actions) : null,
  );
}

export function section(title: string, ...children: Child[]): HTMLElement {
  return el(
    'section',
    { class: 'section' },
    el('h2', { class: 'section-title' }, title),
    ...children,
  );
}

export function stat(label: string, value: Child, hint?: Child): HTMLElement {
  return el(
    'div',
    { class: 'stat' },
    el('span', { class: 'stat-label' }, label),
    el('span', { class: 'stat-value' }, value),
    hint ? el('span', { class: 'stat-hint' }, hint) : null,
  );
}

export function infoGrid(entries: Array<[string, Child]>): HTMLElement {
  return el(
    'dl',
    { class: 'info-grid' },
    ...entries.flatMap(([label, value]) => [
      el('dt', null, label),
      el('dd', null, value),
    ]),
  );
}

export function emptyState(title: string, message: string, action?: Child): HTMLElement {
  return el(
    'div',
    { class: 'empty-state' },
    el('div', { class: 'empty-icon', 'aria-hidden': 'true' }, '◇'),
    el('h2', null, title),
    el('p', { class: 'muted' }, message),
    action ?? null,
  );
}
