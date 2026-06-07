// Host wrapper — buildContext moved to @shopkeeper/agent (Track 2 extraction). The
// dashboard injects the thread I/O sink (Postmark/IG/email via ./tools/thread)
// so the shared package never imports a message provider. Postmark/outbound
// delivery stays here; the package owns the data assembly + sink wiring.
import { buildContext as coreBuildContext } from "@shopkeeper/agent/build-context";
import {
  escalateToHuman,
  addInternalNote,
  sendReply,
  sendEmail,
  updateThreadStatus,
  updateThreadTag,
} from "./tools/thread";
import type { AgentContext } from "@shopkeeper/agent/context";

export function buildContext(threadId: string, orgId: string): Promise<AgentContext> {
  return coreBuildContext(threadId, orgId, {
    escalateToHuman,
    addInternalNote,
    sendReply,
    sendEmail,
    updateThreadStatus,
    updateThreadTag,
  });
}

export type { AgentContext, BaseAgentContext, SupportContext, ShopifyOrderSummary } from "@shopkeeper/agent/context";
