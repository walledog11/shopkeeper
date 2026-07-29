import { randomUUID } from 'node:crypto';
import type { AgentPlan } from '@shopkeeper/agent/types';
import { db, SenderType } from '@shopkeeper/db';
import { buildAgentPlanCacheRecord } from '@shopkeeper/agent/plan-cache';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import { AGENT_NOTE_PREFIX } from '@shopkeeper/agent/thread-constants';
import { agentTurnMessageFilter } from '@shopkeeper/agent/turns';
import { executeCurrentCachedHomePlan } from '@/lib/agent/api/plan-execution';

const EXECUTE = process.argv.includes('--execute');
const ORGANIZATION_ID = readArg('--org-id=');
const EXPECTED_MODE = readArg('--expected-mode=') ?? 'shadow';

function readArg(prefix: string): string | null {
  const raw = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length).trim();
  return raw || null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

async function main(): Promise<void> {
  if (!ORGANIZATION_ID || (EXPECTED_MODE !== 'shadow' && EXPECTED_MODE !== 'enforce')) {
    throw new Error(
      'Usage: npx tsx apps/dashboard/src/scripts/canary-dashboard-ledger.ts '
      + '--org-id=<uuid> [--expected-mode=shadow|enforce] [--execute]',
    );
  }

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
    }, null, 2));

    if (!EXECUTE) {
      console.log(`Inspect-only. Re-run with --execute to create one controlled dashboard-host ${EXPECTED_MODE} ledger observation.`);
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
        platformId: `dashboard-ledger-canary-${runId}@example.invalid`,
        name: 'Dashboard ledger canary',
      },
    });
    const thread = await db.thread.create({
      data: {
        organizationId: organization.id,
        customerId: customer.id,
        channelType: 'email',
        status: 'open',
        subject: `[CANARY P1-02 dashboard ledger] ${runId}`,
        filterStatus: 'genuine',
        filterDecidedAt: new Date(),
        filterReason: 'Controlled dashboard-host ledger canary',
      },
    });
    const message = await db.message.create({
      data: {
        organizationId: organization.id,
        threadId: thread.id,
        senderType: SenderType.customer,
        contentText: 'Controlled dashboard ledger canary: record an internal audit note only.',
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
      input: { text: `[CANARY P1-02 dashboard ledger] ${runId}` },
    };
    const plan: AgentPlan = {
      instruction: 'Record the controlled dashboard ledger canary as an internal note.',
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

    const result = await executeCurrentCachedHomePlan({
      orgId: organization.id,
      threadId: thread.id,
      settings: orgSettings,
      allowedKinds: ['quick_reply', 'needs_review', 'auto_execute'],
      failureRoute: '/api/agent',
      approvedToolCalls: plan.rawToolCalls,
      approver: {
        clerkUserId: 'canary_dashboard_ledger',
        displayName: 'Rollout Canary',
      },
      expectedIdentity: {
        planId: cache.planId,
        sourceMessageId: message.id,
      },
    });

    if (!result.execution.id) {
      throw new Error('P1-02 dashboard canary failed: ledger did not return an execution ID.');
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
      host: 'dashboard',
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
      throw new Error('P1-02 dashboard canary failed: ledger, action, or internal-note evidence did not agree.');
    }

    console.log(
      `P1-02 dashboard canary passed: one internal-only approved action produced one linked ${EXPECTED_MODE} ledger execution.`,
    );
  } finally {
    await db.$disconnect().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
