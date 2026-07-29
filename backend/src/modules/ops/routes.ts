import { Router } from 'express';
import { aiUsageQuerySchema } from '@vig/shared';
import { handler, ok, validateQuery } from '../../lib/http.js';
import { requireRole } from '../../auth/middleware.js';
import * as service from './service.js';

export const opsRouter = Router();

/** Spend is school-operations information: admin only. */
opsRouter.use(requireRole('ADMIN'));

opsRouter.get(
  '/ai-usage',
  validateQuery(aiUsageQuerySchema),
  handler(async (_req, res) => ok(res, await service.report(res.locals.query))),
);
