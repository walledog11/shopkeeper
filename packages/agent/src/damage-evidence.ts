import type { AgentContext } from "./agent-context.js";
import { shouldHydrateAgentMessageImages } from "./image-attachments.js";
import { currentRequestSignals } from "./planner-safety/request.js";
import { isOperatorChannel } from "./thread-constants.js";
import type { OrgSettings } from "./types.js";

/** The internal step that records a photo request (registry `thread.ts`). */
export const AWAIT_CUSTOMER_PHOTO_TOOL = "await_customer_photo";

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
  | { kind: "photos"; count: number };

/** Null unless this is a customer's damage claim and the store requires a photo. */
export function damageEvidenceState(
  ctx: AgentContext,
  settings: Pick<OrgSettings, "damageEvidence">,
): DamageEvidenceState | null {
  if (settings.damageEvidence !== "photo_required") return null;
  if (isOperatorChannel(ctx.thread.channelType)) return null;
  const evidence = ctx.requestEvidence ?? { customerImages: 0, photoRequestedAt: null };
  const reason = currentRequestSignals(ctx)?.requestFacts?.reason;
  // A reply that is only the photo may not read as a damage claim by itself, so
  // a pending request keeps the conversation one.
  if (reason !== "damaged" && reason !== "defective" && evidence.photoRequestedAt === null) return null;
  if (evidence.customerImages > 0) return { kind: "photos", count: evidence.customerImages };
  // The channels whose customer images the model is shown are the ones a photo
  // can arrive on at all.
  if (!shouldHydrateAgentMessageImages(ctx.thread.channelType)) return { kind: "photo_impossible" };
  return evidence.photoRequestedAt !== null ? { kind: "asked_without_photo" } : { kind: "ask" };
}
