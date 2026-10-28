// Read-only Gate E inventory. No recovery, provider calls, or row changes.
// SHOPKEEPER_DB_TARGET=prod npm run audit:agent-runtime-retirement -- --strict
//
// Each `licenses` flag names the compatibility it allows retiring and is true
// only when no stored row still needs it; --strict fails unless all are.
import { loadLocalEnv } from './load-local-env.mjs';

loadLocalEnv();
const { db, Prisma } = await import('@shopkeeper/db');
const { readAgentPlanCacheRecordShape } = await import('@shopkeeper/agent/plan-cache-shape');
const { decideAutonomy } = await import('@shopkeeper/agent/autonomy');
const { resolveAgentSettings } = await import('@shopkeeper/agent/settings');

try {
  const report = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const [tasks, legacyProposals, unknownActions, cacheVersions, threads] = await Promise.all([
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
      // From the stored JSON, not the decoder, which reads only the current
      // version and so cannot count the ones it no longer reads.
      tx.$queryRaw`
        SELECT COALESCE(cached_plan->>'version', '(none)') AS version, COUNT(*)::int AS count
        FROM threads WHERE cached_plan IS NOT NULL
        GROUP BY 1 ORDER BY 1
      `,
      tx.thread.findMany({
        where: { cachedPlan: { not: Prisma.DbNull } },
        select: {
          organizationId: true, status: true, deletedAt: true, archivedAt: true,
          filterStatus: true, escalatedAt: true,
          cachedPlan: true, cachedPlanMessageId: true,
          organization: { select: { settings: true } },
          messages: {
            where: { deletedAt: null, senderType: { not: 'note' } },
            orderBy: [{ sentAt: 'desc' }, { id: 'desc' }], take: 1,
            select: { id: true },
          },
        },
      }),
    ]);
    const cachedPlans = { total: threads.length, currentDurable: 0, currentTasklessApprovable: 0, currentTasklessOther: 0, historicalOrStale: 0 };
    for (const thread of threads) {
      const cache = readAgentPlanCacheRecordShape(thread.cachedPlan);
      // Current exactly as the execution claim decides it: the plan's source is
      // still the conversation's latest message, whoever sent either.
      const latestId = thread.messages[0]?.id ?? null;
      if (!cache?.planId || thread.status === 'closed' || thread.deletedAt || thread.archivedAt
        || cache.lastCustomerMessageId !== latestId || thread.cachedPlanMessageId !== latestId) {
        cachedPlans.historicalOrStale += 1;
        continue;
      }
      const proposal = await tx.agentProposal.findFirst({
        where: { id: cache.planId, organizationId: thread.organizationId }, select: { id: true },
      });
      if (proposal) {
        cachedPlans.currentDurable += 1;
        continue;
      }
      // Only a card a merchant could be asked to approve needs a proposal; one
      // that escalates or needs nothing has none by design.
      const verdict = decideAutonomy(cache.plan, resolveAgentSettings(thread.organization.settings), {
        filterStatus: thread.filterStatus, threadEscalated: Boolean(thread.escalatedAt),
      });
      cachedPlans[verdict.kind === 'needs_review' && verdict.approvalAllowed
        ? 'currentTasklessApprovable' : 'currentTasklessOther'] += 1;
    }
    const actionableLegacyTasks = tasks.filter(row => row.runtimeVersion !== 2
      && !['completed', 'failed', 'cancelled'].includes(row.status))
      .reduce((count, row) => count + row._count._all, 0);
    const legacyUnknownActions = unknownActions.filter(row => row.runtime !== '2')
      .reduce((count, row) => count + row.count, 0);
    const licenses = {
      // requireDurableAgentRuntime's refusals, and AGENT_RUNTIME_VERSION on
      // Railway once no pre-#165 revision can be a rollback target.
      runtimeOneExecution: actionableLegacyTasks === 0 && legacyUnknownActions === 0,
      // The "predates durable approvals" refusal of a taskless card.
      tasklessApproval: cachedPlans.currentTasklessApprovable === 0,
    };
    return {
      generatedAt: new Date().toISOString(),
      environment: process.env.SHOPKEEPER_DB_TARGET === 'prod' ? 'production' : 'configured non-production database',
      privacy: 'Aggregate counts only; no identifiers, message bodies, credentials, or provider payloads.',
      tasks, legacyProposals, unknownActions, cacheVersions, cachedPlans,
      actionableLegacyTasks, legacyUnknownActions, licenses,
      tasklessPlanDisposition: 'Preserve historical readers; require a fresh durable proposal and review before execution.',
    };
  }, { timeout: 30_000, isolationLevel: "RepeatableRead" });
  console.log(JSON.stringify(report, null, 2));
  if (process.argv.includes('--strict') && !Object.values(report.licenses).every(Boolean)) process.exitCode = 1;
} finally {
  await db.$disconnect();
}
