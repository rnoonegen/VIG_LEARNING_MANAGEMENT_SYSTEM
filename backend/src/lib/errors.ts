/**
 * Every failure the API returns deliberately goes through AppError so the
 * response envelope stays `{ error: { code, message, details? } }` (§6).
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'BAD_REQUEST', message, details);

export const unauthorized = (message = 'You need to sign in to continue.') =>
  new AppError(401, 'UNAUTHORIZED', message);

export const forbidden = (message = 'You do not have access to this.') =>
  new AppError(403, 'FORBIDDEN', message);

export const notFound = (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found.`);

export const conflict = (message: string, details?: unknown) =>
  new AppError(409, 'CONFLICT', message, details);

export const serviceUnavailable = (message: string) =>
  new AppError(503, 'SERVICE_UNAVAILABLE', message);
