import { el } from '../dom';

type ToastKind = 'info' | 'success' | 'error' | 'warning';

let container: HTMLElement | null = null;

function getContainer(): HTMLElement {
  if (!container || !container.isConnected) {
    container = el('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.append(container);
  }
  return container;
}

export function showToast(message: string, kind: ToastKind = 'info', timeout = 6000): void {
  const toast = el(
    'div',
    { class: `toast toast-${kind}` },
    el('span', { class: 'toast-message' }, message),
    el(
      'button',
      {
        type: 'button',
        class: 'toast-close',
        'aria-label': 'Dismiss',
        on: {
          click: () => toast.remove(),
        },
      },
      '×',
    ),
  );
  getContainer().append(toast);
  window.setTimeout(() => toast.remove(), timeout);
}
