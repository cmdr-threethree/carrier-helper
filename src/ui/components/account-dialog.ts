import { el } from '../dom';

export interface AccountNameDialogOptions {
  title: string;
  message?: string;
  initial?: string;
  submitLabel?: string;
  placeholder?: string;
}

let dialogCounter = 0;

export function promptAccountName(
  options: AccountNameDialogOptions,
): Promise<string | null> {
  if (typeof document === 'undefined') return Promise.resolve(null);

  if (typeof HTMLDialogElement === 'undefined') {
    const answer = window.prompt(options.title, options.initial ?? '');
    const trimmed = answer?.trim() ?? '';
    return Promise.resolve(trimmed || null);
  }

  return new Promise((resolve) => {
    dialogCounter += 1;
    const titleId = `account-dialog-title-${dialogCounter}`;
    const messageId = `account-dialog-message-${dialogCounter}`;
    let result: string | null = null;

    const input = el('input', {
      class: 'text-input',
      type: 'text',
      value: options.initial ?? '',
      placeholder: options.placeholder ?? 'e.g. CMDR Jameson',
      maxlength: '64',
      autocomplete: 'off',
      spellcheck: 'false',
      'aria-label': 'Commander name',
    }) as HTMLInputElement;

    const error = el('p', { class: 'modal-error', 'aria-live': 'polite' });

    const form = el(
      'form',
      {
        class: 'modal-form',
        method: 'dialog',
        on: {
          submit: (event) => {
            event.preventDefault();
            const name = input.value.trim();
            if (!name) {
              error.textContent = 'Enter a commander name.';
              input.focus();
              return;
            }
            result = name;
            dialog.close();
          },
        },
      },
      el('h2', { id: titleId, class: 'modal-title' }, options.title),
      options.message
        ? el('p', { id: messageId, class: 'modal-message' }, options.message)
        : null,
      el('label', { class: 'field-label', for: `account-dialog-input-${dialogCounter}` }, 'Commander name'),
      input,
      error,
      el(
        'div',
        { class: 'modal-actions' },
        el(
          'button',
          {
            class: 'btn btn-ghost',
            type: 'button',
            on: {
              click: () => {
                result = null;
                dialog.close();
              },
            },
          },
          'Cancel',
        ),
        el(
          'button',
          { class: 'btn btn-primary', type: 'submit' },
          options.submitLabel ?? 'Save',
        ),
      ),
    );

    input.id = `account-dialog-input-${dialogCounter}`;

    const dialog = el(
      'dialog',
      {
        class: 'modal',
        'aria-labelledby': titleId,
        'aria-describedby': options.message ? messageId : null,
      },
      form,
    ) as HTMLDialogElement;

    dialog.addEventListener('close', () => {
      dialog.remove();
      resolve(result);
    });

    document.body.append(dialog);
    dialog.showModal();
    input.focus();
    input.select();
  });
}
