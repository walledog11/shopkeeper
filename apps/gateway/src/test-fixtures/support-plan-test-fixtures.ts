import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';
import { ChannelType, db } from '@shopkeeper/db';
import {
  createTestCustomer,
  createTestMessage,
  createTestOrg,
  createTestThread,
} from '@shopkeeper/db/test-helpers';
import { TOOL_CATEGORIES } from '@shopkeeper/agent/tools';
import type { AgentPlan, RawToolCall } from '@shopkeeper/agent/types';

/** Production-compatible rollout shape for durable task integration tests. */
export function stubDurableAgentRuntimeEnv() {
  vi.stubEnv('AGENT_RUNTIME_VERSION', '2');
  vi.stubEnv('AGENT_CAPABILITY_DISCOVERY_MODE', 'off');
  vi.stubEnv('AGENT_PROPOSAL_SUSPENSION_MODE', 'off');
  vi.stubEnv('PLAN_EXECUTION_LEDGER_MODE', 'enforce');
}

export function agentPlanFromRawToolCalls(
  calls: RawToolCall[],
  overrides: Partial<AgentPlan> = {},
): AgentPlan {
  return {
    instruction: 'Handle this customer\'s latest request',
    rawToolCalls: calls,
    steps: calls
      .filter(call => TOOL_CATEGORIES[call.name] !== 'read')
      .map(call => ({
        id: call.id,
        tool: call.name,
        label: call.name,
        description: call.name,
        category: TOOL_CATEGORIES[call.name] ?? 'internal',
        enabled: true,
      })),
    validation: { status: 'valid', issues: [] },
    routingEvidence: { classifierState: 'aligned', codes: [] },
    ...overrides,
  };
}

export async function seedGuardedRefundSupportThread() {
  const org = await createTestOrg();
  await db.organization.update({
    where: { id: org.id },
    data: {
      settings: {
        autonomyTier: 'guarded',
        autoExecuteMode: 'off',
        maxRefundAmount: 100,
      },
    },
  });
  const customer = await createTestCustomer(org.id, randomUUID());
  const thread = await createTestThread(org.id, customer.id, 'ig_dm');
  const message = await createTestMessage(thread.id, 'Can I get a refund?');
  return {
    organizationId: org.id,
    threadId: thread.id,
    customerId: customer.id,
    messageId: message.id,
  };
}

export function operatorPlanNotificationIdentity(sourceMessageId: string) {
  return {
    planId: '00000000-0000-4000-8000-0000000000c1',
    sourceMessageId,
    planHash: 'c'.repeat(64),
    instructionHash: 'd'.repeat(64),
  };
}

/** Classifier v4 thread without requestFacts — still rendered in production notifications. */
export async function seedLegacyClassifierV4Thread(orgId: string, sourceText: string | null) {
  const customer = await createTestCustomer(orgId, `legacy_${Date.now()}`, { name: 'Dana Reyes' });
  const thread = await createTestThread(orgId, customer.id, ChannelType.email);
  const message = sourceText === null ? null : await createTestMessage(thread.id, sourceText);
  await db.thread.update({
    where: { id: thread.id },
    data: {
      classifierSignals: { version: 4, language: 'en', intents: {} } as never,
      requestSourceMessageId: message?.id ?? null,
    },
  });
  return { thread, messageId: message?.id ?? null };
}
