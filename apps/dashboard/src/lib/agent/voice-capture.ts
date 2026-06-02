import { db, isMeaningfulVoiceEdit } from "@clerk/db";
import { extractCachedDraftReply } from "./plan-cache-shape";

// Records one brand-voice learning sample when an operator sends a customer
// reply that meaningfully diverges from the agent's cached draft. The cached
// plan is the agent's proposed reply for this thread; if the operator sent
// something different, that difference is the voice signal we want to learn.
// Best-effort: callers should never let this block or fail a message send.
export async function captureVoiceEdit(params: {
  organizationId: string;
  threadId: string;
  cachedPlan: unknown;
  tag: string | null;
  sentText: string;
}): Promise<boolean> {
  const draft = extractCachedDraftReply(params.cachedPlan);
  if (!draft || !isMeaningfulVoiceEdit(draft, params.sentText)) return false;

  await db.voiceEdit.create({
    data: {
      organizationId: params.organizationId,
      threadId: params.threadId,
      aiDraft: draft,
      finalText: params.sentText,
      tag: params.tag,
    },
  });
  return true;
}
