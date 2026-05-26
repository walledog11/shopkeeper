import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createMessage } from "@clerk/db";
import { withOrgRoute } from "@/lib/api/route";
import { requireOrgThread } from "@/lib/agent/api/auth";
import { parseAgentAskBody } from "@/lib/agent/api/validation";
import { buildContext, hashInstructionForLog, runAgent } from "@/lib/agent/runner";
import { resolveAgentSettings } from "@/lib/agent/settings";
import { serializeAgentTurn } from "@/lib/agent/api/turns";
import logger from "@/lib/server/logger";
import type { OrgSettings } from "@/types";

export const maxDuration = 60;

export const POST = withOrgRoute(
  {
    context: "Agent ask POST",
    errorMessage: "Failed to answer composer question",
    rateLimit: { key: "agent:ask", limit: 20, windowSecs: 60 },
    onError: (error) => {
      logger.error({ err: error }, "[agent:ask] error");
    },
  },
  async ({ org, request }) => {
    const startedAt = Date.now();
    const { threadId, instruction } = parseAgentAskBody(await request.json());
    const instructionHash = hashInstructionForLog(instruction);
    await requireOrgThread(threadId, org.id);

    logger.info({
      orgId: org.id,
      threadId,
      instructionLength: instruction.length,
      instructionHash,
    }, "[agent:ask] POST");

    const settings = resolveAgentSettings(org.settings as Partial<OrgSettings> | null);
    const ctx = await buildContext(threadId, org.id);
    const turnId = randomUUID();
    const result = await runAgent(ctx, instruction, undefined, settings, { readOnly: true, turnId });

    await createMessage({
      threadId,
      senderType: "note",
      contentText: serializeAgentTurn({
        id: turnId,
        instruction,
        actions: result.actionsPerformed,
        summary: result.summary,
        error: null,
      }),
    });

    logger.info({
      orgId: org.id,
      threadId,
      durationMs: Date.now() - startedAt,
      actionCount: result.actionsPerformed.length,
      instructionHash,
    }, "[agent:ask] result");

    return NextResponse.json(result);
  },
);
