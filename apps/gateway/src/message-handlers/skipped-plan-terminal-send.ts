import { db } from '@shopkeeper/db';
import { buildContext } from '@shopkeeper/agent/build-context';
import {
  findTerminalSendTool,
  refreshTerminalSendAfterSkip,
} from '@shopkeeper/agent/planner-skip-reply';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import type { RawToolCall } from '@shopkeeper/agent/types';
import { gatewayThreadSink } from './agent-thread-sink.js';

export async function refreshSkippedPlanTerminalSend(
  organizationId: string,
  threadId: string,
  instruction: string,
  approvedToolCalls: RawToolCall[],
): Promise<RawToolCall[]> {
  if (!findTerminalSendTool(approvedToolCalls)) {
    return approvedToolCalls;
  }

  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });
  const settings = resolveAgentSettings(org?.settings);
  const ctx = await buildContext(threadId, organizationId, gatewayThreadSink);

  return refreshTerminalSendAfterSkip({
    ctx,
    instruction,
    approvedToolCalls,
    settings,
  });
}
