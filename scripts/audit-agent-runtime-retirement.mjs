// Read-only Gate E inventory. No recovery, provider calls, or row changes.
// SHOPKEEPER_DB_TARGET=prod npm run audit:agent-runtime-retirement -- --strict
import { loadLocalEnv } from './load-local-env.mjs';

loadLocalEnv();
const { db, Prisma } = await import('@shopkeeper/db');
const { AGENT_PLAN_CACHE_VERSION, readAgentPlanCacheRecordShape } = await import('@shopkeeper/agent/plan-cache-shape');

try {
  const report = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const [tasks, legacyProposals, unknownActions, threads] = await Promise.all([
      tx.agentTask.groupBy({ by: ['runtimeVersion', 'status'], _count: { _all: true } }),
      tx.agentProposal.groupBy({
        by: ['status'], where: { task: { runtimeVersion: { not: 2 } } }, _count: { _all: true },
      }),
      tx.$queryRaw`
        SELECT COALESCE(task.runtime_version::text, 'taskless') AS runtime,
               COUNT(*)::int AS count
        FROM agent_actions action
        LEFT JOIN agent_tasks task ON task.id = action.task_id
          AND task.organization_id = action.organization_id
        WHERE action.status = 'unknown'
        GROUP BY task.runtime_version
      `,
      tx.thread.findMany({
        where: { cachedPlan: { not: Prisma.DbNull } },
        select: {
          organizationId: true, status: true, deletedAt: true, archivedAt: true,
          cachedPlan: true, cachedPlanMessageId: true,
          messages: {
            where: { deletedAt: null, senderType: { not: 'note' } },
            orderBy: [{ sentAt: 'desc' }, { id: 'desc' }], take: 1,
            select: { id: true, senderType: true },
          },
        },
      }),
    ]);
    const cachedPlans = { total: threads.length, currentDurable: 0, currentTaskless: 0, historicalOrStale: 0 };
    for (const thread of threads) {
      const cache = readAgentPlanCacheRecordShape(thread.cachedPlan);
      const source = thread.messages[0];
      if (!cache?.planId || cache.version !== AGENT_PLAN_CACHE_VERSION
        || thread.status === 'closed' || thread.deletedAt || thread.archivedAt
        || source?.senderType !== 'customer' || source.id !== cache.lastCustomerMessageId
        || thread.cachedPlanMessageId !== source.id) {
        cachedPlans.historicalOrStale += 1;
        continue;
      }
      const proposal = await tx.agentProposal.findFirst({
        where: { id: cache.planId, organizationId: thread.organizationId }, select: { id: true },
      });
      cachedPlans[proposal ? 'currentDurable' : 'currentTaskless'] += 1;
    }
    const actionableLegacyTasks = tasks.filter(row => row.runtimeVersion !== 2
      && !['completed', 'failed', 'cancelled'].includes(row.status))
      .reduce((count, row) => count + row._count._all, 0);
    const legacyUnknownActions = unknownActions.filter(row => row.runtime !== '2')
      .reduce((count, row) => count + row.count, 0);
    return {
      generatedAt: new Date().toISOString(),
      environment: process.env.SHOPKEEPER_DB_TARGET === 'prod' ? 'production' : 'configured non-production database',
      privacy: 'Aggregate counts only; no identifiers, message bodies, credentials, or provider payloads.',
      tasks, legacyProposals, unknownActions, cachedPlans,
      actionableLegacyTasks, legacyUnknownActions,
      safeToRetireExecution: actionableLegacyTasks === 0 && legacyUnknownActions === 0,
      tasklessPlanDisposition: 'Preserve historical readers; require a fresh durable proposal and review before execution.',
    };
  }, { timeout: 30_000, isolationLevel: "RepeatableRead" });
  console.log(JSON.stringify(report, null, 2));
  if (process.argv.includes('--strict') && !report.safeToRetireExecution) process.exitCode = 1;
} finally {
  await db.$disconnect();
}
