import type { AgentContext } from "./agent-context.js";
import { shouldHydrateAgentMessageImages } from "./image-attachments.js";
import { currentRequestSignals } from "./planner-safety/request.js";
import { isOperatorChannel } from "./thread-constants.js";
import type { RequestFacts } from "./classifier-signals.js";
import type { OrgSettings } from "./types.js";

export { AWAIT_CUSTOMER_PHOTO_TOOL } from "./tools/registry/index.js";

/**
 * Where a damage claim stands on the photo the store requires before any
 * compensation. The prompt section, the planner's tool set, the review signal
 * and the routing code all read this one answer, so they cannot disagree about
 * which state a conversation is in.
 */
export type DamageEvidenceState =
  /** The channel cannot carry a photo, so the merchant handles the claim. */
  | { kind: "photo_impossible" }
  /** Nothing sent and nothing asked yet: ask once. */
  | { kind: "ask" }
  /** Asked, and the customer replied without one: the merchant takes over. */
  | { kind: "asked_without_photo" }
  /** Photos are on the thread: compensation may be proposed, for the merchant to review. */
  | { kind: "photos"; photos: string[] };

/**
 * Null unless this is a customer's damage claim and the store requires a photo.
 * `resumedRequest` is a request the conversation is returning to after the
 * customer confirmed their order: the message that confirmed it is not the claim.
 */
export function damageEvidenceState(
  ctx: AgentContext,
  settings: Pick<OrgSettings, "damageEvidence">,
  resumedRequest?: RequestFacts | null,
): DamageEvidenceState | null {
  if (settings.damageEvidence !== "photo_required") return null;
  if (isOperatorChannel(ctx.thread.channelType)) return null;
  const evidence = ctx.requestEvidence ?? { customerImages: [], photoRequestedAt: null };
  const reason = currentRequestSignals(ctx)?.requestFacts?.reason ?? resumedRequest?.reason;
  // A reply that is only the photo may not read as a damage claim by itself, so
  // a pending request keeps the conversation one.
  if (reason !== "damaged" && reason !== "defective" && evidence.photoRequestedAt === null) return null;
  if (evidence.customerImages.length > 0) return { kind: "photos", photos: evidence.customerImages };
  // The channels whose customer images the model is shown are the ones a photo
  // can arrive on at all.
  if (!shouldHydrateAgentMessageImages(ctx.thread.channelType)) return { kind: "photo_impossible" };
  return evidence.photoRequestedAt !== null ? { kind: "asked_without_photo" } : { kind: "ask" };
}
