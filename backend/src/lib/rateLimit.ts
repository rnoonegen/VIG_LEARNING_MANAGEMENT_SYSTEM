import type { RequestHandler } from 'express';
import { AppError } from './errors.js';

/**
 * Minimal fixed-window limiter, in process memory.
 *
 * Sized for a single-instance school deployment with fewer than ten staff. If
 * this ever runs multi-instance, swap the Map for Redis — the call sites do not
 * change.
 */
export function rateLimit(options: { windowMs: number; max: number; message?: string }): RequestHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return (req, _res, next) => {
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    const entry = hits.get(key);

    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + options.windowMs });
      return next();
    }

    entry.count += 1;
    if (entry.count > options.max) {
      return next(
        new AppError(429, 'RATE_LIMITED', options.message ?? 'Too many attempts. Please try again later.'),
      );
    }
    next();
  };
}
