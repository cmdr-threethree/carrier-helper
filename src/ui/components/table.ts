import { el, type Child } from '../dom';

export interface TableOptions {
  caption?: string;
  emptyText?: string;
  compact?: boolean;
}

export function dataTable(
  headers: string[],
  rows: Child[][],
  options: TableOptions = {},
): HTMLElement {
  const table = el(
    'table',
    { class: options.compact ? 'data-table compact' : 'data-table' },
    options.caption ? el('caption', null, options.caption) : null,
    el(
      'thead',
      null,
      el(
        'tr',
        null,
        ...headers.map((header) => el('th', { scope: 'col' }, header)),
      ),
    ),
    el(
      'tbody',
      null,
      ...(rows.length
        ? rows.map((row) => el('tr', null, ...row.map((cell) => el('td', null, cell))))
        : [
            el(
              'tr',
              null,
              el('td', { colspan: String(Math.max(1, headers.length)), class: 'muted' }, options.emptyText ?? 'No data'),
            ),
          ]),
    ),
  );
  return el('div', { class: 'table-wrap' }, table);
}

export function keyValueTable(
  entries: Array<[string, Child]>,
  options: TableOptions = {},
): HTMLElement {
  const table = el(
    'table',
    { class: 'kv-table' },
    el(
      'tbody',
      null,
      ...entries.map(([key, value]) =>
        el('tr', null, el('th', { scope: 'row' }, key), el('td', null, value)),
      ),
    ),
  );
  return options.caption
    ? el('div', { class: 'table-wrap' }, el('caption', { class: 'table-caption' }, options.caption), table)
    : el('div', { class: 'table-wrap' }, table);
}
