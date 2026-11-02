/**
 * Frontier CAPI frequently returns numeric values as JSON strings, e.g.
 * `"balance": "1725609459"`. Coerce both representations safely.
 */
export function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function formatNumber(value: unknown, maximumFractionDigits = 0): string {
  const number = toFiniteNumber(value);
  if (number === null) return '—';
  return new Intl.NumberFormat(undefined, { maximumFractionDigits }).format(number);
}

export function formatCredits(value: unknown, maximumFractionDigits = 0): string {
  const number = toFiniteNumber(value);
  if (number === null) return '—';
  return `${formatNumber(number, maximumFractionDigits)} cr`;
}

export function formatCompact(value: unknown, maximumFractionDigits = 1): string {
  const number = toFiniteNumber(value);
  if (number === null) return '—';
  return new Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits,
  }).format(number);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = units[0] ?? 'KB';
  for (let index = 0; index < units.length; index += 1) {
    unit = units[index] ?? unit;
    if (value < 1024 || index === units.length - 1) break;
    value /= 1024;
  }
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value)} ${unit}`;
}

export function formatPercent(value: unknown, fractionDigits = 0): string {
  const number = toFiniteNumber(value);
  if (number === null) return '—';
  return `${new Intl.NumberFormat(undefined, {
    maximumFractionDigits: fractionDigits,
  }).format(number)}%`;
}

export function formatText(value: unknown, fallback = '—'): string {
  if (typeof value === 'string' && value.trim()) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return fallback;
}

export function humanizeKey(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
