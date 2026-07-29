import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { loadGatewayEnv } from '../config/load-env.js';

loadGatewayEnv();

const EXECUTE = process.argv.includes('--execute');
const ORGANIZATION_ID = readArg('--org-id=');
const MAX_WAIT_MS = 5 * 60 * 1000;
const POLL_MS = 2_000;

function readArg(prefix: string): string | null {
  const raw = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length).trim();
  return raw || null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

async function main(): Promise<void> {
  if (!ORGANIZATION_ID) {
    throw new Error('Usage: npx tsx apps/gateway/src/scripts/canary-agent-rollout.ts --org-id=<uuid> [--execute]');
  }

  const { db } = await import('@shopkeeper/db');
  const { getGatewayBullMqQueue, closeGatewayBullMqQueues } = await import('../clients/gateway-queues.js');
  const { closeGatewayRedisConnections } = await import('../clients/redis-client.js');
  const { QUEUE } = await import('../constants.js');
  const { processInboundMessage } = await import('../message-handlers/inbound-persistence.js');

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
    const preflight = {
      organization: { id: organization.id, name: organization.name },
      counts: organization._count,
      modes: {
        agentContextBudget: process.env.AGENT_CONTEXT_BUDGET_MODE ?? null,
        autoExecute: settings.autoExecuteMode ?? 'off(default)',
        planExecutionLedger: process.env.PLAN_EXECUTION_LEDGER_MODE ?? null,
      },
    };
    console.log(JSON.stringify({ phase: 'preflight', ...preflight }, null, 2));

    if (!EXECUTE) {
      console.log('Inspect-only. Re-run with --execute to create controlled inbound canary traffic.');
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
    if (process.env.PLAN_EXECUTION_LEDGER_MODE !== 'shadow') {
      throw new Error('Execute mode requires PLAN_EXECUTION_LEDGER_MODE=shadow.');
    }
    if (process.env.AGENT_CONTEXT_BUDGET_MODE !== 'shadow') {
      throw new Error('Execute mode requires AGENT_CONTEXT_BUDGET_MODE=shadow.');
    }

    const runId = randomUUID();
    const platformId = `agent-rollout-canary-${runId}@example.invalid`;
    const subject = `[CANARY P2-01] ${runId}`;
    const firstExternalId = `canary:p2-01:${runId}:first`;
    const secondExternalId = `canary:p2-01:${runId}:second`;
    const firstReceivedAt = new Date();
    const secondReceivedAt = new Date(firstReceivedAt.getTime() + 1_000);

    const customer = await db.customer.create({
      data: {
        organizationId: organization.id,
        platformId,
        name: 'Agent rollout canary',
      },
    });
    const thread = await db.thread.create({
      data: {
        organizationId: organization.id,
        customerId: customer.id,
        channelType: 'email',
        status: 'open',
        subject,
        filterDecidedAt: new Date(),
        filterReason: 'Controlled P2-01 rollout canary',
      },
    });

    const queue = getGatewayBullMqQueue(QUEUE.AI_SUMMARY);
    // Deliberately process the provider-newer message first, then let the older
    // timestamped message enqueue last. This forces BullMQ's replace-on-debounce
    // payload to be stale and proves the worker reconciles it against database
    // message order before planning.
    const secondInbound = processInboundMessage(
      organization.id,
      platformId,
      'email',
      'Controlled rollout canary, final message. Draft a short reply with three candle care tips and treat this as the latest request.',
      queue,
      {
        customerName: 'Agent rollout canary',
        externalMessageId: secondExternalId,
        receivedAt: secondReceivedAt,
        lockAsGenuine: true,
        isRealCustomerMessage: false,
      },
    );
    const firstInbound = delay(40).then(() => processInboundMessage(
      organization.id,
      platformId,
      'email',
      'Controlled rollout canary, first message. I need candle care guidance; wait for my follow-up.',
      queue,
      {
        customerName: 'Agent rollout canary',
        externalMessageId: firstExternalId,
        receivedAt: firstReceivedAt,
        lockAsGenuine: true,
        isRealCustomerMessage: false,
      },
    ));

    const [firstResult, secondResult] = await Promise.all([firstInbound, secondInbound]);
    if (!firstResult || !secondResult || firstResult.thread.id !== thread.id || secondResult.thread.id !== thread.id) {
      throw new Error('Both inbound messages did not correlate to the pre-created canary thread.');
    }

    const messages = await db.message.findMany({
      where: {
        organizationId: organization.id,
        externalMessageId: { in: [firstExternalId, secondExternalId] },
      },
      select: { id: true, externalMessageId: true, sentAt: true },
      orderBy: { sentAt: 'asc' },
    });
    const firstMessage = messages.find((message) => message.externalMessageId === firstExternalId);
    const secondMessage = messages.find((message) => message.externalMessageId === secondExternalId);
    if (!firstMessage || !secondMessage) {
      throw new Error('Could not resolve both persisted canary messages.');
    }

    let matchingJobs = await findCanaryJobs(queue, thread.id);
    const deadline = Date.now() + MAX_WAIT_MS;
    while (
      Date.now() < deadline
      && (
        matchingJobs.length === 0
        || matchingJobs.some((job) => job.state !== 'completed' && job.state !== 'failed')
      )
    ) {
      await delay(POLL_MS);
      matchingJobs = await findCanaryJobs(queue, thread.id);
    }

    const finalThread = await db.thread.findUniqueOrThrow({
      where: { id: thread.id },
      select: {
        cachedPlan: true,
        cachedPlanMessageId: true,
        filterStatus: true,
        lastMessageAt: true,
        lastMessageSenderType: true,
      },
    });
    const finalJobs = await findCanaryJobs(queue, thread.id);
    const evidence = {
      runId,
      organizationId: organization.id,
      customerId: customer.id,
      threadId: thread.id,
      firstMessageId: firstMessage.id,
      secondMessageId: secondMessage.id,
      finalThread: {
        cachedPlanMessageId: finalThread.cachedPlanMessageId,
        filterStatus: finalThread.filterStatus,
        hasCachedPlan: finalThread.cachedPlan !== null,
        lastMessageAt: finalThread.lastMessageAt,
        lastMessageSenderType: finalThread.lastMessageSenderType,
      },
      queuedNewestMessage: finalJobs.some((job) => job.sourceMessageId === secondMessage.id),
      queuedStaleMessage: finalJobs.some((job) => job.sourceMessageId === firstMessage.id),
      jobs: finalJobs,
    };
    console.log(JSON.stringify({ phase: 'evidence', ...evidence }, null, 2));

    // One job is expected when debounce replacement wins before processing.
    // Two are bounded and valid when the first job is already active and the
    // trailing debounce job runs afterward. In either case, force at least one
    // stale payload and prove the worker leaves the newest message in cache.
    const passed = finalJobs.length >= 1
      && finalJobs.length <= 2
      && finalJobs.every((job) => job.state === 'completed')
      && finalJobs.some((job) => job.sourceMessageId === firstMessage.id)
      && finalThread.cachedPlanMessageId === secondMessage.id
      && finalThread.cachedPlan !== null
      && finalThread.filterStatus === 'genuine';
    if (!passed) {
      throw new Error('P2-01 canary failed: newest-message queue/cache evidence did not agree.');
    }

    console.log('P2-01 canary passed: bounded AI-summary jobs included a stale payload and left the newest message in cache.');
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
