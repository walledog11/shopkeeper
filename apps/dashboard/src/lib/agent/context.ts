// Host wrapper — buildContext moved to @shopkeeper/agent (Track 2 extraction). The
// dashboard injects the thread I/O sink (Postmark/IG/email via ./tools/thread)
// so the shared package never imports a message provider. Postmark/outbound
// delivery stays here; the package owns the data assembly + sink wiring.
import { buildContext as coreBuildContext, type BuildContextOptions } from "@shopkeeper/agent/build-context";
import {
  escalateToHuman,
  askOperator,
  addInternalNote,
  sendReply,
  sendEmail,
  updateThreadStatus,
  updateThreadTag,
} from "./tools/thread";
import type { AgentContext } from "@shopkeeper/agent/context";

export function buildContext(
  threadId: string,
  orgId: string,
  options?: BuildContextOptions,
): Promise<AgentContext> {
  return coreBuildContext(threadId, orgId, {
    escalateToHuman,
    askOperator,
    addInternalNote,
    sendReply,
    sendEmail,
    updateThreadStatus,
    updateThreadTag,
  }, options);
}

export type { BuildContextOptions } from "@shopkeeper/agent/build-context";
export type { AgentContext, BaseAgentContext, SupportContext, ShopifyOrderSummary } from "@shopkeeper/agent/context";
