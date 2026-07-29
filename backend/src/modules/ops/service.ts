import type { AiUsageReportDto, AiUsageWorkflowDto, AiWorkflow } from '@vig/shared';
import { AI_WORKFLOWS } from '@vig/shared';
import { prisma } from '../../prisma.js';

/**
 * AI spend reporting (spec §6 Ops, §8.3 budget).
 *
 * The table is empty in this build because no AI is wired (D4) — the endpoint
 * still ships so the budget alert exists on day one of Phase 2 rather than
 * being remembered afterwards. `status` tells the caller which world it is in,
 * so an empty report reads as "deferred", not "nothing happened this month".
 */

/** First day of the current calendar month, in ISO date form. */
function monthStart(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

function today(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export async function report(range: { from?: string; to?: string }): Promise<AiUsageReportDto> {
  const from = range.from ?? monthStart();
  const to = range.to ?? today();

  // `to` is inclusive of the whole day, so compare against the following midnight.
  const toExclusive = new Date(`${to}T00:00:00.000Z`);
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);

  const [rows, settings] = await Promise.all([
    prisma.aiUsageLog.groupBy({
      by: ['workflow'],
      where: { createdAt: { gte: new Date(`${from}T00:00:00.000Z`), lt: toExclusive } },
      _count: { _all: true },
      _sum: {
        inputTokens: true,
        outputTokens: true,
        audioSeconds: true,
        costMicros: true,
      },
    }),
    prisma.schoolSettings.findUnique({ where: { id: 1 }, select: { aiMonthlyBudgetCents: true } }),
  ]);

  const bySource = new Map(rows.map((r) => [r.workflow as AiWorkflow, r]));

  // Every workflow is listed even at zero, so the report shape is stable and the
  // UI does not have to distinguish "no rows" from "no such workflow".
  const byWorkflow: AiUsageWorkflowDto[] = AI_WORKFLOWS.map((workflow) => {
    const row = bySource.get(workflow);
    return {
      workflow,
      calls: row?._count._all ?? 0,
      inputTokens: row?._sum.inputTokens ?? 0,
      outputTokens: row?._sum.outputTokens ?? 0,
      audioSeconds: row?._sum.audioSeconds ?? 0,
      costMicros: row?._sum.costMicros ?? 0,
    };
  });

  const totalCostMicros = byWorkflow.reduce((sum, w) => sum + w.costMicros, 0);
  const budgetCents = settings?.aiMonthlyBudgetCents ?? 3000;
  // 1 cent = 10,000 micros.
  const budgetMicros = budgetCents * 10_000;
  const budgetUsed = budgetMicros > 0 ? totalCostMicros / budgetMicros : 0;

  return {
    status: totalCostMicros > 0 ? 'active' : 'deferred',
    from,
    to,
    totalCostMicros,
    budgetCents,
    budgetUsed,
    // The soft alert from §8.3. A hard stop belongs with the provider call,
    // which does not exist yet.
    alert: budgetUsed >= 0.8,
    byWorkflow,
  };
}
