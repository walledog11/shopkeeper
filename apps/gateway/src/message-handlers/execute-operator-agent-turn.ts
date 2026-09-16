import { executeAgentTurn } from '@shopkeeper/agent/turn';
import { resolveOperatorThread } from '@shopkeeper/agent/internal-thread';
import {
  executeCurrentCachedHomePlan,
  formatApproverId,
  type ExpectedPlanIdentity,
} from '@shopkeeper/agent/plan-execution';
import { hashInstruction } from '@shopkeeper/agent/agent-actions';
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
  agentRequestId?: string;
  agentTaskId?: string;
  assertExecutionAllowed?: () => void;
  senderPhone?: string;
  clerkUserId?: string;
  // Free-form turns resolve the merchant's single durable operator thread from
  // this member key. Reviewed-plan execution must use
  // executeOperatorApprovedCachedPlan so it cannot bypass the durable claim.
  operatorKey: string;
  operatorLedger?: string;
  operatorDeskMode?: boolean;
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
    executionIntent: 'merchant_approved',
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

  const [org, approver] = await Promise.all([
    db.organization.findUniqueOrThrow({
      where: { id: params.orgId },
      select: { settings: true },
    }),
    resolveClerkUserApprover(params.clerkUserId),
  ]);
  const resolvedThread = await resolveOperatorThread(params.orgId, params.operatorKey);

  // The merchant typed this instruction, so a named human authorized the turn
  // and the audit rows say which one. `approvedPlanHash` is deliberately absent:
  // they authorized the instruction, not a drafted set of tool calls they read
  // first, and that difference is what distinguishes these rows from an approved
  // plan's. Without this the turn fell through to the unstated-mode default.
  const approval = approver
    ? {
        approverId: formatApproverId(approver),
        approvedAt: new Date(),
        instructionHash: hashInstruction(params.instruction),
      }
    : undefined;

  const result = await executeAgentTurn({
    orgId: params.orgId,
    threadId: resolvedThread.id,
    orgSettings: resolveAgentSettings(org.settings),
    instruction: params.instruction,
    ...(approval ? { auditMode: 'human_approved' as const, approval } : {}),
    ...(params.turnId ? { turnId: params.turnId } : {}),
    ...(params.agentRequestId ? { agentRequestId: params.agentRequestId } : {}),
    ...(params.agentTaskId ? { agentTaskId: params.agentTaskId } : {}),
    ...(params.assertExecutionAllowed ? { assertExecutionAllowed: params.assertExecutionAllowed } : {}),
    failureRoute: FAILURE_ROUTE,
    ...(params.operatorLedger ? { operatorLedger: params.operatorLedger } : {}),
    ...(params.operatorDeskMode ? { operatorDeskMode: params.operatorDeskMode } : {}),
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
