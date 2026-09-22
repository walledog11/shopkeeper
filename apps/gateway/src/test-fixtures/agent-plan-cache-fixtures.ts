import { buildAgentPlanCacheRecord } from '@shopkeeper/agent/plan-cache';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import type { AgentPlan, PlanStep, RawToolCall } from '@shopkeeper/agent/types';

function buildTestPlanCache(params: {
  instruction: string;
  lastCustomerMessageId: string;
  steps: PlanStep[];
  rawToolCalls: RawToolCall[];
  settings?: unknown;
}) {
  const settings = params.settings ?? resolveAgentSettings(null);
  const plan: AgentPlan = {
    instruction: params.instruction,
    steps: params.steps,
    rawToolCalls: params.rawToolCalls,
  };
  return buildAgentPlanCacheRecord({
    instruction: params.instruction,
    lastCustomerMessageId: params.lastCustomerMessageId,
    settings,
    plan,
  });
}

/** Cached plan whose only executable move is a customer reply. */
export function testReplyPlanCache(instruction: string, lastCustomerMessageId: string) {
  return buildTestPlanCache({
    instruction,
    lastCustomerMessageId,
    steps: [{
      id: 'step-1',
      tool: 'send_reply',
      label: 'Send reply',
      description: 'Send reply',
      category: 'communication',
      enabled: true,
    }],
    rawToolCalls: [{ id: 'step-1', name: 'send_reply', input: { text: 'On its way.' } }],
  });
}

/** Refund plus confirmation reply — the shape digest tests treat as needing approval. */
export function testRefundAndReplyPlanCache(instruction: string, lastCustomerMessageId: string) {
  return buildTestPlanCache({
    instruction,
    lastCustomerMessageId,
    steps: [
      { id: 'refund-1', tool: 'create_refund', label: 'Refund', description: 'Issue refund', category: 'action', enabled: true },
      { id: 'send-1', tool: 'send_reply', label: 'Send reply', description: 'Confirm refund', category: 'communication', enabled: true },
    ],
    rawToolCalls: [
      { id: 'refund-1', name: 'create_refund', input: { order_id: '1001', amount: 12, currency: 'USD' } },
      { id: 'send-1', name: 'send_reply', input: { text: 'I issued your refund.' } },
    ],
  });
}

/** Operator review via ask_operator — classifies as needing merchant input when stale. */
export function testAskOperatorPlanCache(
  lastCustomerMessageId: string,
  instruction = 'Refund policy question',
) {
  return buildTestPlanCache({
    instruction,
    lastCustomerMessageId,
    steps: [{
      id: 'step-1',
      tool: 'ask_operator',
      label: 'Ask operator',
      description: 'Ask operator',
      category: 'internal',
      enabled: true,
    }],
    rawToolCalls: [{ id: 'step-1', name: 'ask_operator', input: { question: 'Can we refund?' } }],
  });
}

/** Single refund step — plan recovery and inactive-thread sweep fixtures. */
export function testRefundOnlyPlanCache(
  lastCustomerMessageId: string,
  instruction = 'Issue refund',
  amount: number | string = 20,
) {
  return buildTestPlanCache({
    instruction,
    lastCustomerMessageId,
    steps: [{
      id: 'step-1',
      tool: 'create_refund',
      label: 'Issue refund',
      description: 'Issue refund',
      category: 'action',
      enabled: true,
    }],
    rawToolCalls: [{ id: 'step-1', name: 'create_refund', input: { amount } }],
  });
}

/** Quick reply only — plan recovery scan for threads missing cached plans. */
export function testQuickReplyPlanCache(
  lastCustomerMessageId: string,
  instruction = 'Answer the question',
  replyText = 'Here you go.',
) {
  return buildTestPlanCache({
    instruction,
    lastCustomerMessageId,
    steps: [{
      id: 'reply',
      tool: 'send_reply',
      label: 'Reply',
      description: 'Reply',
      category: 'communication',
      enabled: true,
    }],
    rawToolCalls: [{ id: 'reply', name: 'send_reply', input: { text: replyText } }],
  });
}
