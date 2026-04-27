import { NextResponse } from "next/server";
import { createMessage } from "@clerk/db";
import { getOrCreateOrg } from "@/lib/server/org";
import { handleApiError } from "@/lib/api/errors";
import { requireOrgThread } from "@/lib/agent/api/auth";
import { parseAgentAskBody } from "@/lib/agent/api/validation";
import { buildContext, hashInstructionForLog, runAgent } from "@/lib/agent/runner";
import { resolveAgentSettings } from "@/lib/agent/settings";
import { serializeAgentTurn } from "@/lib/agent/api/turns";
import { rateLimit, tooManyRequests } from "@/lib/server/rate-limit";
import logger from "@/lib/server/logger";
import type { OrgSettings } from "@/types";

export const maxDuration = 60;

export async function POST(request: Request) {
  const startedAt = Date.now();

  try {
    const org = await getOrCreateOrg();
    const rl = await rateLimit(`agent:ask:${org.id}`, 20, 60);
    if (!rl.success) return tooManyRequests(rl.reset);

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
    const result = await runAgent(ctx, instruction, undefined, settings, { readOnly: true });

    await createMessage({
      threadId,
      senderType: "note",
      contentText: serializeAgentTurn({
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
  } catch (error) {
    logger.error({ err: error }, "[agent:ask] error");
    return handleApiError(error, "Agent ask POST", "Failed to answer composer question");
  }
}
