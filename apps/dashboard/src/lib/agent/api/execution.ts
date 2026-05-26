import { createMessage } from "@clerk/db";
import { buildContext, runAgent } from "@/lib/agent/runner";
import { resolveAgentSettings } from "@/lib/agent/settings";
import { serializeAgentTurn } from "@/lib/agent/api/turns";
import type { AgentActionApproval } from "@/lib/agent/api/agent-actions";
import { getRedis } from "@/lib/server/redis";
import { acquireThreadLock } from "@/lib/server/agent-lock";
import { ConflictError } from "@/lib/api/errors";
import type { OpsAlertCounterClient } from "@/lib/server/ops-alerts";
import type { AgentFailureAlertRoute } from "@/lib/server/agent-failure-alerts";
import type { OrgSettings, RawToolCall } from "@/types";

interface ExecuteAgentTurnParams {
  orgId: string;
  threadId: string;
  instruction: string;
  failureRoute?: AgentFailureAlertRoute;
  orgSettings?: Partial<OrgSettings> | null;
  approvedToolCalls?: RawToolCall[];
  persistUserMessage?: boolean;
  persistAgentMessage?: boolean;
  persistAuditNote?: boolean;
  persistAuditNoteWhenNoActions?: boolean;
  auditMode?: "human_approved" | "auto_executed" | "read_only";
  approval?: AgentActionApproval;
  auditMetadata?: {
    senderPhone?: string | null;
    clerkUserId?: string | null;
  };
}

export async function executeAgentTurn(params: ExecuteAgentTurnParams) {
  const lock = await acquireThreadLock(params.threadId);
  if (!lock) {
    throw new ConflictError("Agent is already running on this thread. Try again in a few seconds.");
  }

  try {
    const settings = resolveAgentSettings(params.orgSettings ?? null);
    let failureCounterClient: OpsAlertCounterClient | undefined;

    if (params.failureRoute) {
      try {
        failureCounterClient = getRedis();
      } catch {
        failureCounterClient = undefined;
      }
    }

    if (params.persistUserMessage) {
      await createMessage({
        threadId: params.threadId,
        senderType: "customer",
        contentText: params.instruction,
      });
    }

    const ctx = await buildContext(params.threadId, params.orgId);
    const result = await runAgent(
      ctx,
      params.instruction,
      params.approvedToolCalls,
      settings,
      {
        failureRoute: params.failureRoute,
        failureCounterClient,
        ...(params.auditMode ? { mode: params.auditMode } : {}),
        ...(params.approval ? { approval: params.approval } : {}),
      }
    );

    if (params.persistAgentMessage) {
      await createMessage({
        threadId: params.threadId,
        senderType: "agent",
        contentText: result.summary,
      });
    }

    if ((params.persistAuditNote ?? true) && ((params.persistAuditNoteWhenNoActions ?? true) || result.actionsPerformed.length > 0)) {
      await createMessage({
        threadId: params.threadId,
        senderType: "note",
        contentText: serializeAgentTurn({
          instruction: params.instruction,
          actions: result.actionsPerformed,
          summary: result.summary,
          error: null,
          ...(params.auditMode ? { mode: params.auditMode } : {}),
          senderPhone: params.auditMetadata?.senderPhone ?? null,
          clerkUserId: params.auditMetadata?.clerkUserId ?? null,
        }),
      });
    }

    return result;
  } finally {
    await lock.release();
  }
}
