import { randomUUID } from 'node:crypto';
import type { AgentPlan } from '@shopkeeper/agent/types';
import { buildAgentPlanCacheRecord } from '@shopkeeper/agent/plan-cache';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import { AGENT_NOTE_PREFIX } from '@shopkeeper/agent/thread-constants';
import { agentTurnMessageFilter } from '@shopkeeper/agent/turns';
import { isRecord } from '@shopkeeper/agent/guards';

type Surface = 'dashboard' | 'gateway';
type ExpectedMode = 'shadow' | 'enforce';

const SURFACE = readArg('--surface=') as Surface | null;
const EXECUTE = process.argv.includes('--execute');
const ORGANIZATION_ID = readArg('--org-id=');
const EXPECTED_MODE = (readArg('--expected-mode=') ?? 'shadow') as ExpectedMode;

const SURFACE_CONFIG: Record<Surface, {
  host: Surface;
  customerName: string;
  platformIdPrefix: string;
  subjectPrefix: string;
  filterReason: string;
  messageContent: string;
  toolNotePrefix: string;
  instruction: string;
  failureRoute: string;
  approverClerkId: string;
}> = {
  dashboard: {
    host: 'dashboard',
    customerName: 'Dashboard ledger canary',
    platformIdPrefix: 'dashboard-ledger-canary',
    subjectPrefix: '[CANARY P1-02 dashboard ledger]',
    filterReason: 'Controlled dashboard-host ledger canary',
    messageContent: 'Controlled dashboard ledger canary: record an internal audit note only.',
    toolNotePrefix: '[CANARY P1-02 dashboard ledger]',
    instruction: 'Record the controlled dashboard ledger canary as an internal note.',
    failureRoute: '/api/agent',
    approverClerkId: 'canary_dashboard_ledger',
  },
  gateway: {
    host: 'gateway',
    customerName: 'Gateway ledger canary',
    platformIdPrefix: 'gateway-ledger-canary',
    subjectPrefix: '[CANARY P1-02 gateway ledger]',
    filterReason: 'Controlled gateway-host ledger canary',
    messageContent: 'Controlled gateway ledger canary: record an internal audit note only.',
    toolNotePrefix: '[CANARY P1-02 gateway ledger]',
    instruction: 'Record the controlled gateway ledger canary as an internal note.',
    failureRoute: 'canary:gateway-ledger',
    approverClerkId: 'canary_gateway_ledger',
  },
};

function readArg(prefix: string): string | null {
  const raw = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length).trim();
  return raw || null;
}

function usage(): string {
  return 'Usage: npx tsx scripts/canary-plan-ledger.ts --surface=dashboard|gateway '
    + '--org-id=<uuid> [--expected-mode=shadow|enforce] [--execute]';
}

async function bootstrap(surface: Surface): Promise<void> {
  if (surface === 'gateway') {
    const { loadGatewayEnv } = await import('../apps/gateway/src/config/load-env.js');
    loadGatewayEnv();
  }
}

async function executeApprovedPlan(
  surface: Surface,
  params: {
    orgId: string;
    threadId: string;
    settings: ReturnType<typeof resolveAgentSettings>;
    approvedToolCalls: AgentPlan['rawToolCalls'];
    failureRoute: string;
    approverClerkId: string;
    expectedIdentity: { planId: string | null; sourceMessageId: string };
  },
) {
  const baseParams = {
    orgId: params.orgId,
    threadId: params.threadId,
    settings: params.settings,
    executionIntent: 'merchant_approved' as const,
    failureRoute: params.failureRoute,
    approvedToolCalls: params.approvedToolCalls,
    approver: {
      clerkUserId: params.approverClerkId,
      displayName: 'Rollout Canary',
    },
    expectedIdentity: params.expectedIdentity,
  };

  if (surface === 'dashboard') {
    const { executeCurrentCachedHomePlan } = await import(
      '../apps/dashboard/src/lib/agent/api/plan-execution.js'
    );
    return executeCurrentCachedHomePlan(baseParams);
  }

  const { executeCurrentCachedHomePlan } = await import('@shopkeeper/agent/plan-execution');
  const { buildGatewayPlanExecutionDeps } = await import(
    '../apps/gateway/src/message-handlers/agent-turn-deps.js'
  );
  return executeCurrentCachedHomePlan(baseParams, buildGatewayPlanExecutionDeps());
}

async function cleanup(surface: Surface): Promise<void> {
  if (surface === 'gateway') {
    const { closeGatewayRedisConnections } = await import('../apps/gateway/src/clients/redis-client.js');
    await closeGatewayRedisConnections().catch(() => {});
  }
}

async function main(): Promise<void> {
  if (!SURFACE || (SURFACE !== 'dashboard' && SURFACE !== 'gateway')) {
    throw new Error(usage());
  }
  if (!ORGANIZATION_ID || (EXPECTED_MODE !== 'shadow' && EXPECTED_MODE !== 'enforce')) {
    throw new Error(usage());
  }

  await bootstrap(SURFACE);
  const config = SURFACE_CONFIG[SURFACE];
  const { db, SenderType } = await import('@shopkeeper/db');

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
    const orgSettings = resolveAgentSettings(organization.settings);
    const rawSettings = isRecord(organization.settings) ? organization.settings : {};
    console.log(JSON.stringify({
      phase: 'preflight',
      organization: { id: organization.id, name: organization.name },
      counts: organization._count,
      modes: {
        autoExecute: rawSettings.autoExecuteMode ?? 'off(default)',
        planExecutionLedger: process.env.PLAN_EXECUTION_LEDGER_MODE ?? null,
        expectedPlanExecutionLedger: EXPECTED_MODE,
      },
      action: 'add_internal_note',
      surface: SURFACE,
    }, null, 2));

    if (!EXECUTE) {
      console.log(
        `Inspect-only. Re-run with --execute to create one controlled ${SURFACE}-host `
        + `${EXPECTED_MODE} ledger observation.`,
      );
      return;
    }
    if (
      organization._count.integrations !== 0
      || organization._count.members !== 0
      || organization._count.operatorContexts !== 0
    ) {
      throw new Error('Execute mode requires an isolated organization with no integrations, members, or operator contexts.');
    }
    if (rawSettings.autoExecuteMode !== undefined && rawSettings.autoExecuteMode !== 'off') {
      throw new Error(`Execute mode requires autoExecuteMode=off; received ${String(rawSettings.autoExecuteMode)}`);
    }
    if (process.env.PLAN_EXECUTION_LEDGER_MODE !== EXPECTED_MODE) {
      throw new Error(
        `Execute mode requires PLAN_EXECUTION_LEDGER_MODE=${EXPECTED_MODE}; `
        + `received ${String(process.env.PLAN_EXECUTION_LEDGER_MODE)}`,
      );
    }

    const runId = randomUUID();
    const customer = await db.customer.create({
      data: {
        organizationId: organization.id,
        platformId: `${config.platformIdPrefix}-${runId}@example.invalid`,
        name: config.customerName,
      },
    });
    const thread = await db.thread.create({
      data: {
        organizationId: organization.id,
        customerId: customer.id,
        channelType: 'email',
        status: 'open',
        subject: `${config.subjectPrefix} ${runId}`,
        filterStatus: 'genuine',
        filterDecidedAt: new Date(),
        filterReason: config.filterReason,
      },
    });
    const message = await db.message.create({
      data: {
        organizationId: organization.id,
        threadId: thread.id,
        senderType: SenderType.customer,
        contentText: config.messageContent,
        externalMessageId: `canary:p1-02:${runId}:source`,
      },
    });
    await db.thread.update({
      where: { id: thread.id },
      data: {
        lastMessageAt: message.sentAt,
        lastMessageSenderType: SenderType.customer,
      },
    });

    const toolCall = {
      id: `canary_${runId}`,
      name: 'add_internal_note',
      input: { text: `${config.toolNotePrefix} ${runId}` },
    };
    const plan: AgentPlan = {
      instruction: config.instruction,
      steps: [{
        id: toolCall.id,
        tool: toolCall.name,
        label: 'Record internal rollout note',
        description: 'Add a synthetic internal note; do not contact a customer or operator.',
        category: 'internal',
        enabled: true,
      }],
      rawToolCalls: [toolCall],
    };
    const cache = buildAgentPlanCacheRecord({
      instruction: plan.instruction,
      lastCustomerMessageId: message.id,
      settings: orgSettings,
      plan,
    });
    await db.thread.update({
      where: { id: thread.id },
      data: {
        cachedPlanMessageId: message.id,
        cachedPlan: cache as object,
      },
    });

    const result = await executeApprovedPlan(SURFACE, {
      orgId: organization.id,
      threadId: thread.id,
      settings: orgSettings,
      approvedToolCalls: plan.rawToolCalls,
      failureRoute: config.failureRoute,
      approverClerkId: config.approverClerkId,
      expectedIdentity: {
        planId: cache.planId,
        sourceMessageId: message.id,
      },
    });

    if (!result.execution.id) {
      throw new Error(`P1-02 ${SURFACE} canary failed: ledger did not return an execution ID.`);
    }
    const [execution, internalNoteCount, auditNoteCount] = await Promise.all([
      db.planExecution.findUniqueOrThrow({
        where: { id: result.execution.id },
        select: {
          id: true,
          status: true,
          mode: true,
          observationCount: true,
          threadId: true,
          sourceMessageId: true,
          claimedAt: true,
          completedAt: true,
          lastError: true,
          actions: {
            select: {
              tool: true,
              status: true,
              mode: true,
              executionId: true,
            },
          },
        },
      }),
      db.message.count({
        where: {
          threadId: thread.id,
          senderType: SenderType.note,
          contentText: {
            startsWith: AGENT_NOTE_PREFIX,
            contains: runId,
          },
        },
      }),
      db.message.count({
        where: {
          threadId: thread.id,
          senderType: SenderType.note,
          contentText: {
            startsWith: `${agentTurnMessageFilter.contentText.startsWith}{`,
            contains: runId,
          },
        },
      }),
    ]);
    const evidence = {
      phase: 'evidence',
      runId,
      host: config.host,
      organizationId: organization.id,
      customerId: customer.id,
      threadId: thread.id,
      sourceMessageId: message.id,
      execution,
      internalNoteCount,
      auditNoteCount,
      result: {
        executionOutcome: result.execution.status,
        summary: result.result.summary,
        actionTools: result.result.actionsPerformed.map((action) => action.tool),
        actionStatuses: result.result.actionsPerformed.map((action) => action.status),
      },
    };
    console.log(JSON.stringify(evidence, null, 2));

    const action = execution.actions[0];
    const ledgerStatePassed = EXPECTED_MODE === 'shadow'
      ? execution.status === 'pending'
        && execution.observationCount === 1
        && execution.claimedAt === null
        && execution.completedAt === null
      : execution.status === 'committed'
        && execution.observationCount === 0
        && execution.claimedAt !== null
        && execution.completedAt !== null;
    const passed = ledgerStatePassed
      && execution.mode === 'human_approved'
      && execution.lastError === null
      && execution.threadId === thread.id
      && execution.sourceMessageId === message.id
      && execution.actions.length === 1
      && action?.tool === 'add_internal_note'
      && action.status === 'success'
      && action.mode === 'human_approved'
      && action.executionId === execution.id
      && internalNoteCount === 1
      && auditNoteCount === 1
      && result.execution.status === 'committed';
    if (!passed) {
      throw new Error(`P1-02 ${SURFACE} canary failed: ledger, action, or internal-note evidence did not agree.`);
    }

    console.log(
      `P1-02 ${SURFACE} canary passed: one internal-only approved action produced one linked `
      + `${EXPECTED_MODE} ledger execution.`,
    );
  } finally {
    await cleanup(SURFACE);
    const { db } = await import('@shopkeeper/db');
    await db.$disconnect().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
