import { PrismaClient } from '@prisma/client';
import { env } from './env.js';

/**
 * One PrismaClient for the process. `tsx watch` reloads the module graph on every
 * save, so the instance is parked on globalThis to avoid exhausting the connection
 * pool during development.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/** The transaction client type, for services that accept either. */
export type Tx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;
