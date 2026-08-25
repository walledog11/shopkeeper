import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { loadGatewayEnv } from '../config/load-env.js';

import { isRecord } from '../lib/typing.js';
loadGatewayEnv();

const EXECUTE = process.argv.includes('--execute');
const ORGANIZATION_ID = readArg('--org-id=');
const EXPECTED_MODE = readArg('--expected-mode=');
const MAX_WAIT_MS = 5 * 60 * 1000;
const POLL_MS = 2_000;
const HISTORICAL_MESSAGE_COUNT = 60;
const HISTORY_BODY_CHARS = 900;

function readArg(prefix: string): string | null {
  const raw = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length).trim();
  return raw || null;
}


async function main(): Promise<void> {
  if (!ORGANIZATION_ID || EXPECTED_MODE !== 'enforce') {
    throw new Error(
      'Usage: npx tsx apps/gateway/src/scripts/canary-context-budget.ts '
      + '--org-id=<uuid> --expected-mode=enforce [--execute]',
    );
  }

  const { db, SenderType } = await import('@shopkeeper/db');
  const { readAgentPlanCache } = await import('@shopkeeper/agent/plan-cache');
  const { buildBoundedClassifierConversation } = await import('@shopkeeper/agent/context-budget');
  const { getGatewayBullMqQueue, closeGatewayBullMqQueues } = await import('../clients/gateway-queues.js');
  const { closeGatewayRedisConnections } = await import('../clients/redis-client.js');
  const { QUEUE } = await import('../constants.js');
  const { enqueueAiSummaryJob } = await import('../message-handlers/inbound-persistence.js');

  try {
    const organization = await db.organization.findUniqueOrThrow({
      where: { id: ORGANIZATION_ID },
      select: {
        id: true,
        name: true,
        settings: true,
        _count: {
          select: {
            integrations: true,
            members: true,
            operatorContexts: true,
          },
        },
      },
    });
    const settings = isRecord(organization.settings) ? organization.settings : {};
    const actualMode = process.env.AGENT_CONTEXT_BUDGET_MODE ?? null;
    console.log(JSON.stringify({
      phase: 'preflight',
      organization: { id: organization.id, name: organization.name },
      counts: organization._count,
      modes: {
        actualContextBudget: actualMode,
        expectedContextBudget: EXPECTED_MODE,
        autoExecute: settings.autoExecuteMode ?? 'off(default)',
        planExecutionLedger: process.env.PLAN_EXECUTION_LEDGER_MODE ?? null,
      },
    }, null, 2));

    if (!EXECUTE) {
      console.log('Inspect-only. Re-run with --execute to create one controlled long-thread canary.');
      return;
    }
    if (
      organization._count.integrations !== 0
      || organization._count.members !== 0
      || organization._count.operatorContexts !== 0
    ) {
      throw new Error('Execute mode requires an isolated organization with no integrations, members, or operator contexts.');
    }
    if (settings.autoExecuteMode !== undefined && settings.autoExecuteMode !== 'off') {
      throw new Error(`Execute mode requires autoExecuteMode=off; received ${String(settings.autoExecuteMode)}`);
    }
    if (process.env.PLAN_EXECUTION_LEDGER_MODE !== 'enforce') {
      throw new Error('Execute mode requires PLAN_EXECUTION_LEDGER_MODE=enforce.');
    }
    if (actualMode !== EXPECTED_MODE) {
      throw new Error(`Expected AGENT_CONTEXT_BUDGET_MODE=${EXPECTED_MODE}; received ${String(actualMode)}`);
    }

    const runId = randomUUID();
    const baseTime = Date.now() - (HISTORICAL_MESSAGE_COUNT + 1) * 1_000;
    const priorSummaryMarker = `P2-02-prior-summary-${runId}`;
    const priorSummary = `${priorSummaryMarker}: Customer previously asked for basic candle safety guidance.`;
    const newestRequest = 'Please draft a concise reply with exactly three candle care tips: trim the wick, limit burn time, and keep the candle away from drafts.';
    const filler = ' Earlier messages are synthetic context for the bounded-context rollout canary.';
    const customer = await db.customer.create({
      data: {
        organizationId: organization.id,
        platformId: `context-budget-canary-${runId}@example.invalid`,
        name: 'Context budget canary',
      },
    });
    const thread = await db.thread.create({
      data: {
        organizationId: organization.id,
        customerId: customer.id,
        channelType: 'email',
        status: 'open',
        subject: `[CANARY P2-02] ${runId}`,
        aiSummary: priorSummary,
        filterStatus: 'genuine',
        filterDecidedAt: new Date(baseTime),
        filterReason: 'Controlled P2-02 rollout canary',
      },
    });

    await db.message.createMany({
      data: Array.from({ length: HISTORICAL_MESSAGE_COUNT }, (_, index) => {
        const prefix = index % 2 === 0
          ? `Synthetic customer history ${index + 1}.`
          : `Synthetic merchant response ${index + 1}.`;
        return {
          organizationId: organization.id,
          threadId: thread.id,
          senderType: index % 2 === 0 ? SenderType.customer : SenderType.agent,
          contentText: `${prefix}${filler.repeat(20)}`.slice(0, HISTORY_BODY_CHARS),
          sentAt: new Date(baseTime + index * 1_000),
          externalMessageId: `canary:p2-02:${runId}:history:${index}`,
        };
      }),
    });
    const newestMessage = await db.message.create({
      data: {
        organizationId: organization.id,
        threadId: thread.id,
        senderType: SenderType.customer,
        contentText: newestRequest,
        sentAt: new Date(baseTime + HISTORICAL_MESSAGE_COUNT * 1_000),
        externalMessageId: `canary:p2-02:${runId}:newest`,
      },
    });
    await db.thread.update({
      where: { id: thread.id },
      data: {
        lastMessageAt: newestMessage.sentAt,
        lastMessageSenderType: 'customer',
      },
    });

    const allMessages = await db.message.findMany({
      where: { threadId: thread.id },
      orderBy: [{ sentAt: 'asc' }, { id: 'asc' }],
      select: { senderType: true, contentText: true },
    });
    const boundedClassifier = buildBoundedClassifierConversation(allMessages, priorSummary);
    const legacyClassifierChars = allMessages
      .map((message) => `${message.senderType.toUpperCase()}: ${message.contentText}`)
      .join('\n')
      .length;

    const queue = getGatewayBullMqQueue(QUEUE.AI_SUMMARY);
    await enqueueAiSummaryJob(queue, {
      threadId: thread.id,
      organizationId: organization.id,
      sourceMessageId: newestMessage.id,
      customerName: customer.name,
      channelType: 'email',
      traceId: `canary:p2-02:${runId}`,
    });

    let jobs = await findCanaryJobs(queue, thread.id);
    const deadline = Date.now() + MAX_WAIT_MS;
    while (
      Date.now() < deadline
      && (
        jobs.length === 0
        || jobs.some((job) => job.state !== 'completed' && job.state !== 'failed')
      )
    ) {
      await delay(POLL_MS);
      jobs = await findCanaryJobs(queue, thread.id);
    }

    const finalThread = await db.thread.findUniqueOrThrow({
      where: { id: thread.id },
      select: {
        aiSummary: true,
        cachedPlan: true,
        cachedPlanMessageId: true,
        filterStatus: true,
      },
    });
    const cache = readAgentPlanCache(finalThread.cachedPlan);
    const stepTools = cache?.plan.steps.map((step) => step.tool) ?? [];
    const evidence = {
      phase: 'evidence',
      runId,
      mode: EXPECTED_MODE,
      organizationId: organization.id,
      customerId: customer.id,
      threadId: thread.id,
      newestMessageId: newestMessage.id,
      fixture: {
        historicalMessageCount: HISTORICAL_MESSAGE_COUNT,
        totalMessageCount: allMessages.length,
        legacyClassifierChars,
        boundedClassifierChars: boundedClassifier.text.length,
        expectedClassifierReductionPercent: Number(
          ((1 - boundedClassifier.text.length / legacyClassifierChars) * 100).toFixed(1),
        ),
        boundedIncludesPriorSummary: boundedClassifier.text.includes(priorSummaryMarker),
        boundedIncludesNewestRequest: boundedClassifier.text.includes(newestRequest),
      },
      result: {
        cachedPlanMessageId: finalThread.cachedPlanMessageId,
        filterStatus: finalThread.filterStatus,
        hasCachedPlan: cache !== null,
        stepTools,
        refreshedSummary: finalThread.aiSummary !== priorSummary,
      },
      jobs,
    };
    console.log(JSON.stringify(evidence, null, 2));

    const passed = jobs.length === 1
      && jobs[0]?.state === 'completed'
      && finalThread.cachedPlanMessageId === newestMessage.id
      && finalThread.filterStatus === 'genuine'
      && cache !== null
      && stepTools.includes('send_reply')
      && boundedClassifier.text.includes(priorSummaryMarker)
      && boundedClassifier.text.includes(newestRequest)
      && boundedClassifier.text.length < legacyClassifierChars * 0.8;
    if (!passed) {
      throw new Error('P2-02 canary failed: context, queue, or newest-plan evidence did not meet the rollout gate.');
    }

    console.log(`P2-02 ${EXPECTED_MODE} canary passed: prior summary and newest request are retained with a bounded send_reply plan.`);
  } finally {
    await closeGatewayBullMqQueues().catch(() => {});
    await closeGatewayRedisConnections().catch(() => {});
    await db.$disconnect().catch(() => {});
  }
}

async function findCanaryJobs(
  queue: Awaited<ReturnType<typeof import('../clients/gateway-queues.js')['getGatewayBullMqQueue']>>,
  threadId: string,
): Promise<Array<{ id: string | undefined; sourceMessageId: string | null; state: string }>> {
  const jobs = await queue.getJobs(['waiting', 'active', 'delayed', 'completed', 'failed'], 0, 999, true);
  const matching = jobs.filter((job) => isRecord(job.data) && job.data.threadId === threadId);
  return Promise.all(matching.map(async (job) => ({
    id: job.id,
    sourceMessageId: isRecord(job.data) && typeof job.data.sourceMessageId === 'string'
      ? job.data.sourceMessageId
      : null,
    state: await job.getState(),
  })));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
