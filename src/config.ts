const env = import.meta.env;

const configuredRedirect = (env.VITE_FRONTIER_REDIRECT_URI ?? '').trim();
const browserRedirect =
  typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname}`
    : '';

export const config = {
  appName: 'carrier-helper',
  schemaVersion: 1,
  clientId: (env.VITE_FRONTIER_CLIENT_ID ?? '').trim(),
  redirectUri: configuredRedirect || browserRedirect,
  mockAuth: env.VITE_MOCK_AUTH === 'true',
  language: (env.VITE_CAPI_LANGUAGE ?? 'en').trim() || 'en',
  authBase: 'https://auth.frontierstore.net',
  capiBase: 'https://companion.orerve.net',
  scopes: 'auth capi',
  cooldownMs: 15 * 60 * 1000,
  rawRetentionMs: 7 * 24 * 60 * 60 * 1000,
  summaryRetentionMs: 90 * 24 * 60 * 60 * 1000,
  rawStorageCapBytes: 100 * 1024 * 1024,
  importSizeLimitBytes: 100 * 1024 * 1024,
} as const;

export function hasAuthConfig(): boolean {
  return config.mockAuth || Boolean(config.clientId && config.redirectUri);
}

export function configurationProblem(): string | null {
  if (config.mockAuth) return null;
  if (!config.clientId) {
    return 'Frontier Client ID is not configured. Set VITE_FRONTIER_CLIENT_ID at build time.';
  }
  if (!config.redirectUri) {
    return 'Frontier redirect URI is not configured. Set VITE_FRONTIER_REDIRECT_URI at build time.';
  }
  return null;
}
