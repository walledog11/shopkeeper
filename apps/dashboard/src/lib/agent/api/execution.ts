import { db } from "@clerk/db";
import { buildContext, runAgent } from "@/lib/agent/runner";
import { resolveAgentSettings } from "@/lib/agent/settings";
import { serializeAgentTurn } from "@/lib/agent/api/turns";
import type { OrgSettings, RawToolCall } from "@/types";

interface ExecuteAgentTurnParams {
  orgId: string;
  threadId: string;
  instruction: string;
  orgSettings?: Partial<OrgSettings> | null;
  approvedToolCalls?: RawToolCall[];
  persistUserMessage?: boolean;
  persistAgentMessage?: boolean;
  persistAuditNote?: boolean;
  persistAuditNoteWhenNoActions?: boolean;
  auditMetadata?: {
    senderPhone?: string | null;
    clerkUserId?: string | null;
  };
}

export async function executeAgentTurn(params: ExecuteAgentTurnParams) {
  const settings = resolveAgentSettings(params.orgSettings ?? null);

  if (params.persistUserMessage) {
    await db.message.create({
      data: {
        threadId: params.threadId,
        senderType: "customer",
        contentText: params.instruction,
      },
    });
  }

  const ctx = await buildContext(params.threadId, params.orgId);
  const result = await runAgent(
    ctx,
    params.instruction,
    params.approvedToolCalls,
    settings
  );

  if (params.persistAgentMessage) {
    await db.message.create({
      data: {
        threadId: params.threadId,
        senderType: "agent",
        contentText: result.summary,
      },
    });
  }

  if ((params.persistAuditNote ?? true) && ((params.persistAuditNoteWhenNoActions ?? true) || result.actionsPerformed.length > 0)) {
    await db.message.create({
      data: {
        threadId: params.threadId,
        senderType: "note",
        contentText: serializeAgentTurn({
          instruction: params.instruction,
          actions: result.actionsPerformed,
          summary: result.summary,
          error: null,
          senderPhone: params.auditMetadata?.senderPhone ?? null,
          clerkUserId: params.auditMetadata?.clerkUserId ?? null,
        }),
      },
    });
  }

  return result;
}
