import { executeAgentTurn } from '@shopkeeper/agent/turn';
import { resolveOperatorThread } from '@shopkeeper/agent/internal-thread';
import {
  executeCurrentCachedHomePlan,
  type ExpectedPlanIdentity,
} from '@shopkeeper/agent/plan-execution';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import type { RawToolCall } from '@shopkeeper/agent/types';
import type { AgentToolDefinition } from '@shopkeeper/agent/tools';
import { db } from '@shopkeeper/db';
import type { AgentActionResult } from './planning-types.js';
import { assertBillingWriteAllowedForOrgId } from '../billing/write-gate.js';
import { resolveClerkUserApprover } from '../clients/clerk-approver.js';
import { buildGatewayPlanExecutionDeps, buildGatewayTurnDeps } from './agent-turn-deps.js';

const FAILURE_ROUTE = 'gateway:operator-turn';

export interface ExecuteOperatorAgentTurnParams {
  orgId: string;
  instruction: string;
  turnId?: string;
  senderPhone?: string;
  clerkUserId?: string;
  // Free-form turns resolve the merchant's single durable operator thread from
  // this binding key. Reviewed-plan execution must use
  // executeOperatorApprovedCachedPlan so it cannot bypass the durable claim.
  operatorKey: string;
  operatorLedger?: string;
  moduleTools?: Record<string, AgentToolDefinition>;
}

export interface ExecuteOperatorAgentTurnResult {
  summary: string;
  threadId: string;
  actionsPerformed: AgentActionResult[];
}

export async function executeOperatorApprovedCachedPlan(params: {
  orgId: string;
  threadId: string;
  instruction: string;
  clerkUserId?: string;
  approvedToolCalls: RawToolCall[];
  expectedIdentity?: ExpectedPlanIdentity;
}): Promise<ExecuteOperatorAgentTurnResult> {
  await assertBillingWriteAllowedForOrgId(params.orgId);
  const [org, approver] = await Promise.all([
    db.organization.findUnique({
      where: { id: params.orgId },
      select: { settings: true },
    }),
    resolveClerkUserApprover(params.clerkUserId),
  ]);
  const executed = await executeCurrentCachedHomePlan({
    orgId: params.orgId,
    threadId: params.threadId,
    settings: resolveAgentSettings(org?.settings),
    allowedKinds: ['quick_reply', 'needs_review', 'auto_execute'],
    failureRoute: FAILURE_ROUTE,
    approvedToolCalls: params.approvedToolCalls,
    ...(params.expectedIdentity ? { expectedIdentity: params.expectedIdentity } : {}),
    ...(approver ? { approver } : {}),
  }, buildGatewayPlanExecutionDeps());

  return {
    summary: executed.result.summary,
    actionsPerformed: executed.result.actionsPerformed,
    threadId: params.threadId,
  };
}

// In-process operator agent turn: billing gate, thread resolution, then
// executeAgentTurn with the gateway lock provider and hop-back ThreadSink.
export async function executeOperatorAgentTurn(
  params: ExecuteOperatorAgentTurnParams,
): Promise<ExecuteOperatorAgentTurnResult> {
  await assertBillingWriteAllowedForOrgId(params.orgId);

  const resolvedThread = await resolveOperatorThread(params.orgId, params.operatorKey);

  const result = await executeAgentTurn({
    orgId: params.orgId,
    threadId: resolvedThread.id,
    instruction: params.instruction,
    ...(params.turnId ? { turnId: params.turnId } : {}),
    failureRoute: FAILURE_ROUTE,
    ...(params.operatorLedger ? { operatorLedger: params.operatorLedger } : {}),
    ...(params.moduleTools ? { moduleTools: params.moduleTools } : {}),
    persistUserMessage: true,
    persistAgentMessage: true,
    persistAuditNote: true,
    auditMetadata: {
      senderPhone: params.senderPhone,
      clerkUserId: params.clerkUserId,
    },
  }, buildGatewayTurnDeps());

  return {
    summary: result.summary,
    actionsPerformed: result.actionsPerformed,
    threadId: resolvedThread.id,
  };
}
