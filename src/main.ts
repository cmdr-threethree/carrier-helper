import './styles.css';
import { cleanAuthUrl, completeAuthCallback } from './auth/accounts';
import { config } from './config';
import { userMessage } from './lib/errors';
import { log } from './lib/log';
import { el } from './ui/dom';
import { emptyState } from './ui/layout';
import { startRouter } from './ui/router';
import { showToast } from './ui/components/toast';
import { applyRetention } from './storage/retention';

function authErrorPage(error: unknown): HTMLElement {
  return el(
    'div',
    { class: 'page narrow auth-error' },
    emptyState(
      'Authorization failed',
      userMessage(error),
      el(
        'button',
        {
          class: 'btn',
          type: 'button',
          on: {
            click: () => {
              startRouter();
              showToast('Returned to Carrier Helper.', 'info');
            },
          },
        },
        'Continue',
      ),
    ),
    el('p', { class: 'muted small' }, `Redirect URI: ${config.redirectUri || 'not configured'}`),
  );
}

async function bootstrap(): Promise<void> {
  const app = document.getElementById('app');
  if (!app) return;

  const params = new URLSearchParams(window.location.search);
  const isCallback =
    params.has('code') || params.has('error') || params.has('error_description');

  if (isCallback) {
    try {
      const { pending } = await completeAuthCallback();
      cleanAuthUrl(pending.returnTo);
      startRouter();
      showToast('Frontier account connected.', 'success');
    } catch (error) {
      cleanAuthUrl('#/');
      app.replaceChildren(authErrorPage(error));
    }
    return;
  }

  startRouter();
  void applyRetention().catch((error: unknown) => log.warn('Startup retention failed', error));
}

window.addEventListener('unhandledrejection', (event) => {
  console.error('[carrier-helper] Unhandled rejection', event.reason);
  showToast(userMessage(event.reason), 'error');
});

void bootstrap();
