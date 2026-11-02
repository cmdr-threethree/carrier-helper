const isDevelopment = import.meta.env.DEV;

export const log = {
  debug(...args: unknown[]): void {
    if (isDevelopment) console.debug('[carrier-helper]', ...args);
  },
  info(...args: unknown[]): void {
    if (isDevelopment) console.info('[carrier-helper]', ...args);
  },
  warn(...args: unknown[]): void {
    console.warn('[carrier-helper]', ...args);
  },
  error(...args: unknown[]): void {
    console.error('[carrier-helper]', ...args);
  },
};
