import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodSchema } from 'zod';
import { AppError } from './errors.js';
import { env } from '../env.js';

/** Wraps an async handler so a rejected promise reaches the error middleware. */
export function handler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

/** Success envelope. */
export function ok<T>(res: Response, data: T, meta?: Record<string, unknown>, status = 200) {
  return res.status(status).json(meta ? { data, meta } : { data });
}

/** Validates `req.body` and replaces it with the parsed value. */
export function validateBody(schema: ZodSchema): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) return next(zodToAppError(result.error));
    req.body = result.data;
    next();
  };
}

/** Validates `req.query` and stashes the parsed value on `res.locals.query`. */
export function validateQuery(schema: ZodSchema): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) return next(zodToAppError(result.error));
    res.locals.query = result.data;
    next();
  };
}

function zodToAppError(error: ZodError): AppError {
  return new AppError(
    400,
    'VALIDATION_ERROR',
    error.issues[0]?.message ?? 'Some fields need attention.',
    error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  );
}

/** Terminal error middleware. Must be registered last. */
export function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }

  if (err instanceof ZodError) {
    const appError = zodToAppError(err);
    res
      .status(appError.status)
      .json({ error: { code: appError.code, message: appError.message, details: appError.details } });
    return;
  }

  /**
   * A dropped database connection is not a bug in the request.
   *
   * Pooled Postgres closes idle connections; the pool can hand out a socket the
   * server has already gone away from, which arrives here as P1001/P1002/P1017
   * (or, on Windows, "An existing connection was forcibly closed by the remote
   * host"). Retrying genuinely works, so the response says so instead of
   * reporting a fault the admin cannot act on.
   */
  const prismaCode = (err as { code?: string })?.code;
  if (prismaCode && ['P1001', 'P1002', 'P1017'].includes(prismaCode)) {
    console.error('[api] database connection error:', prismaCode, String(err).split('\n')[0]);
    res.status(503).json({
      error: {
        code: 'DATABASE_UNAVAILABLE',
        message: 'The database connection dropped. Please try that again.',
      },
    });
    return;
  }

  // Prisma's unique-constraint violation is the one runtime error common enough
  // to deserve a readable message rather than a generic 500.
  if (prismaCode === 'P2002') {
    res.status(409).json({
      error: { code: 'CONFLICT', message: 'That already exists. Try a different value.' },
    });
    return;
  }
  if (prismaCode === 'P2025') {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Resource not found.' } });
    return;
  }

  console.error('[api] unhandled error:', err);
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong on our side. Please try again.',
      details: env.NODE_ENV === 'development' ? String(err) : undefined,
    },
  });
}
