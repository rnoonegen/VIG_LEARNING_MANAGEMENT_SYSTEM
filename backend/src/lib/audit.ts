import type { Prisma } from '@prisma/client';
import { prisma } from '../prisma.js';
import type { Tx } from '../prisma.js';

/**
 * Appends an audit row. Audit writes must never fail a business operation, so
 * errors are swallowed and logged (BR-09 keeps the real history in the domain
 * tables; this log is for operator forensics).
 */
export async function audit(
  entry: {
    actorId: string | null;
    action: string;
    entity: string;
    entityId?: string | null;
    before?: Prisma.InputJsonValue | null;
    after?: Prisma.InputJsonValue | null;
  },
  tx: Tx = prisma,
): Promise<void> {
  try {
    await tx.auditLog.create({
      data: {
        actorId: entry.actorId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        before: entry.before ?? undefined,
        after: entry.after ?? undefined,
      },
    });
  } catch (err) {
    console.warn('[audit] failed to write entry', entry.action, err);
  }
}
