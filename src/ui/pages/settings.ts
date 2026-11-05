import {
  accountLabel,
  authorizationWarning,
  deleteAccountData,
  disconnectAccount,
  isDemoAccount,
  reauthAccount,
} from '../../auth/accounts';
import { connectAccountWithPrompt, renameAccountWithPrompt } from '../account-actions';
import { importBackup, parseBackupFile, previewBackup, type ImportMode } from '../../backup/import';
import { downloadBackup, exportAllData } from '../../backup/export';
import type { BackupV1 } from '../../backup/validate';
import { configurationProblem, config } from '../../config';
import { userMessage } from '../../lib/errors';
import { formatBytes } from '../../lib/format';
import { formatDateTime, formatRelative } from '../../lib/time';
import { clearDataStores, listAccounts, storageUsage } from '../../storage/repos';
import { el, type Child } from '../dom';
import { requestRender } from '../events';
import { badge, infoGrid, pageHeader, section } from '../layout';
import { showToast } from '../components/toast';
import type { AccountRecord } from '../../storage/schema';
import type { PageContext, PageResult } from './types';

function accountActions(account: AccountRecord): Child[] {
  const actions: Child[] = [
    el(
      'button',
      {
        class: 'btn btn-ghost btn-small',
        type: 'button',
        on: {
          click: () => {
            void renameAccountWithPrompt(account).then((changed) => {
              if (changed) requestRender();
            });
          },
        },
      },
      'Rename',
    ),
  ];
  if (!isDemoAccount(account)) {
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
        account.needsReauth ? 'Reconnect' : 'Re-authorize',
      ),
    );
  }
  if (account.tokens) {
    actions.push(
      el(
        'button',
        {
          class: 'btn btn-ghost btn-small',
          type: 'button',
          on: {
            click: () => {
              if (!window.confirm(`Disconnect ${accountLabel(account)}? Historical data stays in this browser.`)) return;
              void disconnectAccount(account.id)
                .then(() => {
                  showToast('Account disconnected. History kept.', 'success');
                  requestRender();
                })
                .catch((error: unknown) => showToast(userMessage(error), 'error'));
            },
          },
        },
        'Disconnect',
      ),
    );
  }
  actions.push(
    el(
      'button',
      {
        class: 'btn btn-danger btn-small',
        type: 'button',
        on: {
          click: () => {
            if (!window.confirm(`Delete ${accountLabel(account)} and all of its carrier history? This cannot be undone.`)) return;
            void deleteAccountData(account.id)
              .then(() => {
                showToast('Account data deleted.', 'success');
                requestRender();
              })
              .catch((error: unknown) => showToast(userMessage(error), 'error'));
          },
        },
      },
      'Delete data',
    ),
  );
  return actions;
}

function accountRows(accounts: AccountRecord[]): HTMLElement {
  return el(
    'div',
    { class: 'account-list' },
    ...accounts.map((account) =>
      el(
        'div',
        { class: 'account-row' },
        el(
          'div',
          { class: 'account-row-main' },
          el(
            'div',
            null,
            el('strong', null, accountLabel(account)),
            isDemoAccount(account) ? el('span', { class: 'pill pill-demo' }, 'demo') : null,
          ),
          el(
            'span',
            { class: 'muted small' },
            `ID ${account.id} · ${account.platform} · last sync ${formatRelative(account.sync.lastSuccessAt)}`,
          ),
          isDemoAccount(account)
            ? badge('Local demo', 'accent')
            : account.needsReauth
              ? badge('Reconnect required', 'danger')
              : badge('Authorized', 'ok'),
          authorizationWarning(account)
            ? el('span', { class: 'inline-warning small' }, authorizationWarning(account))
            : null,
        ),
        el('div', { class: 'account-row-actions' }, ...accountActions(account)),
      ),
    ),
  );
}

function configSection(): HTMLElement {
  const problem = configurationProblem();
  return section(
    'Configuration',
    problem ? el('div', { class: 'notice notice-warn' }, problem) : null,
    infoGrid([
      ['Frontier Client ID', config.clientId || 'Not configured'],
      ['Redirect URI', config.redirectUri || 'Not configured'],
      ['Mode', config.mockAuth ? 'Demo mode (generated data)' : 'Frontier OAuth'],
      ['CAPI language', config.language],
    ]),
    el(
      'p',
      { class: 'muted small' },
      'Client ID and redirect URI are build-time values. Set VITE_FRONTIER_CLIENT_ID and VITE_FRONTIER_REDIRECT_URI when building. The redirect URI must match the Frontier developer application exactly.',
    ),
  );
}

async function storageSection(): Promise<HTMLElement> {
  const usage = await storageUsage();
  let quotaText = 'Not available';
  let persistedText = 'Not available';
  try {
    const estimate = await navigator.storage?.estimate?.();
    quotaText =
      estimate?.usage !== undefined && estimate.quota !== undefined
        ? `${formatBytes(estimate.usage)} of ${formatBytes(estimate.quota)}`
        : 'Not available';
    const persisted = (await navigator.storage?.persisted?.()) ?? false;
    persistedText = persisted ? 'Granted' : 'Not granted';
  } catch {
    // Storage APIs are optional.
  }

  const exportAllButton = el(
    'button',
    {
      class: 'btn btn-secondary btn-small',
      type: 'button',
      on: {
        click: () => {
          void exportAllData()
            .then((backup) => {
              downloadBackup(backup);
              showToast('Backup downloaded. Tokens are never included.', 'success');
            })
            .catch((error: unknown) => showToast(userMessage(error), 'error'));
        },
      },
    },
    'Export all data',
  );

  const preview = el('p', { class: 'muted small' }, 'No backup file selected.');
  let pending: BackupV1 | null = null;
  let pendingName = '';

  const mergeButton = el(
    'button',
    { class: 'btn btn-primary btn-small', type: 'button', disabled: true },
    'Merge import',
  ) as HTMLButtonElement;
  const replaceButton = el(
    'button',
    { class: 'btn btn-danger btn-small', type: 'button', disabled: true },
    'Replace all',
  ) as HTMLButtonElement;

  const runImport = async (mode: ImportMode): Promise<void> => {
    if (!pending) return;
    if (mode === 'replace' && !window.confirm('Replace all local data with this backup? Existing tokens are not in the backup, so accounts will need reconnect.')) {
      return;
    }
    try {
      const result = await importBackup(pending, mode);
      showToast(
        `Import complete: ${result.importedAccounts} accounts, ${result.importedCarriers} carriers, ${result.importedSnapshots} snapshots, ${result.importedSummaries} summaries.`,
        'success',
      );
      requestRender();
    } catch (error) {
      showToast(userMessage(error), 'error');
    }
  };

  mergeButton.addEventListener('click', () => void runImport('merge'));
  replaceButton.addEventListener('click', () => void runImport('replace'));

  const fileInput = el('input', {
    type: 'file',
    accept: 'application/json,.json',
    class: 'file-input',
    'aria-label': 'Backup file',
    on: {
      change: () => {
        const file = (fileInput as HTMLInputElement).files?.[0];
        pending = null;
        pendingName = '';
        mergeButton.disabled = true;
        replaceButton.disabled = true;
        if (!file) {
          preview.textContent = 'No backup file selected.';
          return;
        }
        void parseBackupFile(file)
          .then((backup) => {
            pending = backup;
            pendingName = file.name;
            const counts = previewBackup(backup);
            preview.textContent = `${pendingName}: ${counts.accounts} accounts, ${counts.carriers} carriers, ${counts.snapshots} snapshots, ${counts.summaries} summaries${
              counts.earliest ? `, ${formatDateTime(counts.earliest)} to ${formatDateTime(counts.latest)}` : ''
            }.`;
            mergeButton.disabled = false;
            replaceButton.disabled = false;
          })
          .catch((error: unknown) => {
            preview.textContent = userMessage(error);
          });
      },
    },
  }) as HTMLInputElement;

  const persistenceButton = el(
    'button',
    {
      class: 'btn btn-secondary btn-small',
      type: 'button',
      on: {
        click: () => {
          if (!navigator.storage?.persist) {
            showToast('Persistent storage is not available in this browser.', 'warning');
            return;
          }
          void navigator.storage
            .persist()
            .then((granted) => {
              showToast(granted ? 'Persistent storage granted.' : 'Browser declined persistent storage.', granted ? 'success' : 'warning');
              requestRender();
            })
            .catch((error: unknown) => showToast(userMessage(error), 'error'));
        },
      },
    },
    'Request persistent storage',
  );

  return section(
    'Storage and data',
    infoGrid([
      ['Accounts', String(usage.accountCount)],
      ['Carriers', String(usage.carrierCount)],
      ['Raw snapshots', `${usage.snapshotCount} · ${formatBytes(usage.snapshotBytes)}`],
      ['Summaries', String(usage.summaryCount)],
      ['Browser quota used', quotaText],
      ['Persistent storage', persistedText],
      ['Retention', 'Raw 7 days (latest kept); summaries 90 days'],
      ['Raw snapshot cap', formatBytes(config.rawStorageCapBytes)],
    ]),
    el('div', { class: 'button-row' }, exportAllButton, persistenceButton),
    el(
      'div',
      { class: 'import-box' },
      el('h3', null, 'Import backup'),
      el('p', { class: 'muted small' }, 'Backups never contain OAuth tokens. Imported accounts must be reconnected.'),
      fileInput,
      preview,
      el('div', { class: 'button-row' }, mergeButton, replaceButton),
    ),
    el(
      'div',
      { class: 'danger-zone' },
      el('h3', null, 'Danger zone'),
      el('p', { class: 'muted small' }, 'Delete all accounts, carriers, snapshots, and summaries from this browser. Backups are not affected.'),
      el(
        'button',
        {
          class: 'btn btn-danger btn-small',
          type: 'button',
          on: {
            click: () => {
              if (!window.confirm('Delete all Carrier Helper data in this browser? This cannot be undone.')) return;
              void clearDataStores()
                .then(() => {
                  showToast('All local data deleted.', 'success');
                  requestRender();
                })
                .catch((error: unknown) => showToast(userMessage(error), 'error'));
            },
          },
        },
        'Delete all data',
      ),
    ),
  );
}

function aboutSection(): HTMLElement {
  return section(
    'About and privacy',
    el(
      'p',
      { class: 'muted' },
      'Carrier Helper is a static browser application. Account tokens, carrier snapshots, and history stay in IndexedDB in this browser. There is no backend, analytics, or telemetry. Requests go only to Frontier’s OAuth and Companion API servers.',
    ),
    el(
      'p',
      { class: 'muted' },
      'Backups are JSON files created by you and never include OAuth tokens. Frontier’s CAPI and Elite Dangerous are trademarks of Frontier Developments plc. This is an unofficial community tool.',
    ),
  );
}

export async function renderSettings(_context: PageContext): Promise<PageResult> {
  const accounts = await listAccounts();
  const addButton = el(
    'button',
    {
      class: 'btn btn-primary btn-small',
      type: 'button',
      on: {
        click: () => {
          void connectAccountWithPrompt()
            .then((account) => {
              if (account) requestRender();
            })
            .catch((error: unknown) => showToast(userMessage(error), 'error'));
        },
      },
    },
    config.mockAuth ? 'Create demo account' : 'Connect another account',
  );

  const accountsContent = accounts.length
    ? accountRows(accounts)
    : el('p', { class: 'muted' }, 'No accounts connected.');

  return {
    node: el(
      'div',
      { class: 'settings-page' },
      pageHeader('Settings', 'Accounts, storage, backups, and privacy'),
      section(
        'Accounts',
        accountsContent,
        el(
          'p',
          { class: 'muted small' },
          'To add a different Frontier account, sign out of Frontier first or use a private window if the browser reuses the current login session.',
        ),
        el('div', { class: 'button-row' }, addButton),
      ),
      configSection(),
      await storageSection(),
      aboutSection(),
    ),
  };
}
