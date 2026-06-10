import { executeAgentTurn } from '@shopkeeper/agent/turn';
import { resolveInternalAgentThread } from '@shopkeeper/agent/internal-thread';
import { formatApproverId } from '@shopkeeper/agent/plan-execution';
import { hashInstruction } from '@shopkeeper/agent/agent-actions';
import { isOperatorChannel } from '@shopkeeper/agent/thread-constants';
import type { RawToolCall } from '@shopkeeper/agent/types';
import type { AgentActionResult } from './planning-types.js';
import { assertBillingWriteAllowedForOrgId } from '../billing/write-gate.js';
import { resolveClerkUserApprover } from '../clients/clerk-approver.js';
import { buildGatewayTurnDeps } from './agent-turn-deps.js';

const FAILURE_ROUTE = 'gateway:operator-turn';

export interface ExecuteOperatorAgentTurnParams {
  orgId: string;
  instruction: string;
  orderNumber?: string;
  senderPhone?: string;
  clerkUserId?: string;
  threadId?: string;
  approvedToolCalls?: RawToolCall[];
}

export interface ExecuteOperatorAgentTurnResult {
  summary: string;
  threadId: string;
  actionsPerformed: AgentActionResult[];
}

// In-process operator agent turn: billing gate, thread resolution, then
// executeAgentTurn with the gateway lock provider and hop-back ThreadSink.
export async function executeOperatorAgentTurn(
  params: ExecuteOperatorAgentTurnParams,
): Promise<ExecuteOperatorAgentTurnResult> {
  await assertBillingWriteAllowedForOrgId(params.orgId);

  const resolvedThread = await resolveInternalAgentThread({
    orgId: params.orgId,
    threadId: params.threadId,
    orderNumber: params.orderNumber,
    senderPhone: params.senderPhone,
  });

  const approver = params.approvedToolCalls?.length
    ? await resolveClerkUserApprover(params.clerkUserId)
    : undefined;

  const persistOperatorExchange = isOperatorChannel(resolvedThread.channelType)
    && !params.approvedToolCalls?.length;

  const result = await executeAgentTurn({
    orgId: params.orgId,
    threadId: resolvedThread.id,
    instruction: params.instruction,
    failureRoute: FAILURE_ROUTE,
    approvedToolCalls: params.approvedToolCalls,
    ...(persistOperatorExchange ? { persistUserMessage: true, persistAgentMessage: true } : {}),
    persistAuditNote: true,
    ...(params.approvedToolCalls?.length ? { auditMode: 'human_approved' as const } : {}),
    ...(approver ? {
      approval: {
        approverId: formatApproverId(approver),
        approvedAt: new Date(),
        instructionHash: hashInstruction(params.instruction),
      },
    } : {}),
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
