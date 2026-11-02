export type AppErrorCode =
  | 'config'
  | 'auth'
  | 'network'
  | 'cooldown'
  | 'rate_limited'
  | 'maintenance'
  | 'no_carrier'
  | 'server'
  | 'invalid_data'
  | 'quota'
  | 'not_found'
  | 'unknown';

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly cause?: unknown;

  constructor(code: AppErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.cause = cause;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function toAppError(error: unknown): AppError {
  if (isAppError(error)) return error;
  if (error instanceof Error) return new AppError('unknown', error.message, error);
  return new AppError('unknown', String(error), error);
}

export function userMessage(error: unknown): string {
  const appError = toAppError(error);
  switch (appError.code) {
    case 'config':
      return appError.message;
    case 'auth':
      return 'Frontier authorization has expired. Reconnect the account to continue.';
    case 'network':
      return 'Could not reach Frontier. Check your connection and try again.';
    case 'cooldown':
      return appError.message;
    case 'rate_limited':
      return 'Frontier is rate limiting requests. Wait for the cooldown before syncing again.';
    case 'maintenance':
      return 'The Frontier Companion API is under maintenance. Try again later.';
    case 'no_carrier':
      return 'This account does not own a fleet carrier.';
    case 'server':
      return 'Frontier returned an unexpected error. Try again later.';
    case 'invalid_data':
      return 'Frontier returned data that could not be understood.';
    case 'quota':
      return 'Browser storage is full. Export a backup, then remove old data.';
    case 'not_found':
      return 'The requested item was not found.';
    default:
      return appError.message || 'Something went wrong.';
  }
}
