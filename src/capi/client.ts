import { AppError } from '../lib/errors';
import type { FleetCarrierResponse } from './types';

export type CapiResult =
  | { kind: 'ok'; status: 200; data: FleetCarrierResponse; fetchedAt: number }
  | { kind: 'no-carrier'; status: 204; fetchedAt: number }
  | { kind: 'auth'; status: 401 | 422; message: string }
  | { kind: 'maintenance'; status: 418; message: string }
  | { kind: 'rate-limited'; status: 429; retryAfterMs: number | null }
  | { kind: 'error'; status: number; message: string }
  | { kind: 'network'; error: unknown };

export interface CapiRequestOptions {
  baseUrl?: string;
  language?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export function parseRetryAfter(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.max(0, date - now);
  return null;
}

export function buildCapiUrl(
  baseUrl: string,
  language: string,
  origin = typeof window !== 'undefined' ? window.location.origin : 'https://localhost',
): URL {
  const base = /^https?:\/\//i.test(baseUrl)
    ? baseUrl
    : new URL(baseUrl, origin).toString();
  const url = new URL('fleetcarrier', base.endsWith('/') ? base : `${base}/`);
  if (language) url.searchParams.set('language', language);
  return url;
}

export async function fetchFleetCarrier(
  accessToken: string,
  tokenType: string,
  options: CapiRequestOptions = {},
): Promise<CapiResult> {
  const {
    baseUrl = '/api/capi',
    language = 'en',
    fetchImpl = fetch,
    now = Date.now,
  } = options;

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { kind: 'network', error: new AppError('network', 'The browser is offline.') };
  }

  const url = buildCapiUrl(baseUrl, language);

  let response: Response;
  try {
    response = await fetchImpl(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `${tokenType || 'Bearer'} ${accessToken}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
      credentials: 'omit',
    });
  } catch (error) {
    return { kind: 'network', error };
  }

  const fetchedAt = now();

  if (response.status === 200) {
    try {
      const data = (await response.json()) as FleetCarrierResponse;
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return { kind: 'error', status: 200, message: 'Unexpected response shape.' };
      }
      return { kind: 'ok', status: 200, data, fetchedAt };
    } catch (error) {
      return {
        kind: 'error',
        status: 200,
        message: error instanceof Error ? error.message : 'Invalid JSON.',
      };
    }
  }

  if (response.status === 204) {
    return { kind: 'no-carrier', status: 204, fetchedAt };
  }

  const body = await response.text().catch(() => '');
  const message = body.slice(0, 500) || response.statusText || `HTTP ${response.status}`;

  if (response.status === 401 || response.status === 422) {
    return { kind: 'auth', status: response.status, message };
  }
  if (response.status === 418) {
    return { kind: 'maintenance', status: 418, message };
  }
  if (response.status === 429) {
    return {
      kind: 'rate-limited',
      status: 429,
      retryAfterMs: parseRetryAfter(response.headers.get('Retry-After'), fetchedAt),
    };
  }

  return { kind: 'error', status: response.status, message };
}
