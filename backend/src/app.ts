import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env, supabaseConfigured } from './env.js';
import { errorMiddleware, handler, ok } from './lib/http.js';
import { requireAuth, requirePasswordChanged } from './auth/middleware.js';
import { adminUsersRouter, authRouter } from './auth/routes.js';
import { curriculumRouter } from './modules/curriculum/routes.js';
import { teachersRouter } from './modules/teachers/routes.js';
import { studentsRouter } from './modules/students/routes.js';
import { classesRouter, occurrencesRouter, scheduleRouter } from './modules/scheduling/routes.js';
import { attentionRouter, homeRouter, setupRouter } from './modules/home/routes.js';
import {
  classRecordsRouter,
  occurrenceRecordRouter,
  teacherRouter,
} from './modules/classrecord/routes.js';
import { learningRouter } from './modules/learning/routes.js';
import { developmentAreasRouter, studentDevelopmentRouter } from './modules/development/routes.js';
import { momentsRouter, studentMomentsRouter } from './modules/moments/routes.js';
import { parentRouter } from './modules/parent/routes.js';
import { parentsRouter } from './modules/parents/routes.js';
import { weeklyRouter } from './modules/weekly/routes.js';
import { notificationsRouter } from './modules/notifications/routes.js';
import { opsRouter } from './modules/ops/routes.js';
import { prisma } from './prisma.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()), credentials: true }));
  app.use(express.json({ limit: '1mb' }));

  const api = express.Router();

  // --- Open routes ----------------------------------------------------------

  api.get(
    '/health',
    handler(async (_req, res) => {
      const db = await prisma.$queryRaw`SELECT 1`.then(() => 'up').catch(() => 'down');
      return ok(res, {
        status: db === 'up' ? 'ok' : 'degraded',
        database: db,
        supabase: supabaseConfigured ? 'configured' : 'missing credentials',
        aiPhase: 'deferred-to-phase-2',
      });
    }),
  );

  // Auth mounts ahead of the forced-password-change gate so a user holding a
  // temporary password can still sign in and replace it.
  api.use('/auth', authRouter);

  // --- Everything below requires an active session and a replaced password ---

  api.use(requireAuth, requirePasswordChanged);

  api.use('/admin/users', adminUsersRouter);
  api.use('/curriculum', curriculumRouter);
  api.use('/teachers', teachersRouter);

  // Student-scoped routers share the /students prefix; Express tries them in
  // order and the more specific paths are registered first.
  api.use('/students', learningRouter);
  api.use('/students', studentDevelopmentRouter);
  api.use('/students', studentMomentsRouter);
  api.use('/students', studentsRouter);

  api.use('/schedule', scheduleRouter);
  api.use('/classes', classesRouter);
  api.use('/occurrences', occurrenceRecordRouter);
  api.use('/occurrences', occurrencesRouter);
  api.use('/class-records', classRecordsRouter);
  api.use('/teacher', teacherRouter);

  api.use('/home', homeRouter);
  api.use('/attention', attentionRouter);
  api.use('/setup', setupRouter);

  api.use('/development', developmentAreasRouter);
  api.use('/moments', momentsRouter);
  api.use('/parent', parentRouter);
  // Admin-facing parent administration; /parent above is the parent's own API.
  api.use('/parents', parentsRouter);
  api.use('/weekly-updates', weeklyRouter);
  api.use('/notifications', notificationsRouter);
  api.use('/admin', opsRouter);

  app.use('/api/v1', api);

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No such endpoint.' } });
  });

  app.use(errorMiddleware);

  return app;
}
