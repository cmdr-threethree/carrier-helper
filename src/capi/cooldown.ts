import { config } from '../config';

export const SYNC_COOLDOWN_MS = config.cooldownMs;

export function cooldownRemaining(nextAllowedAt: number | undefined | null, now = Date.now()): number {
  if (!nextAllowedAt) return 0;
  return Math.max(0, nextAllowedAt - now);
}

export function isCoolingDown(
  nextAllowedAt: number | undefined | null,
  now = Date.now(),
): boolean {
  return cooldownRemaining(nextAllowedAt, now) > 0;
}

export function reserveSyncSlot(now = Date.now()): number {
  return now + SYNC_COOLDOWN_MS;
}

export function nextAllowedAfterRateLimit(
  retryAfterMs: number | null,
  reservedUntil: number,
  now = Date.now(),
): number {
  return Math.max(reservedUntil, now + (retryAfterMs ?? SYNC_COOLDOWN_MS));
}

export function countdownLabel(nextAllowedAt: number | undefined | null, now = Date.now()): string {
  const remaining = cooldownRemaining(nextAllowedAt, now);
  if (remaining <= 0) return 'Ready';
  const seconds = Math.ceil(remaining / 1000);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
}
