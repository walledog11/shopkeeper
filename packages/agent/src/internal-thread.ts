import { db } from "@shopkeeper/db";
import { requireOrgThread } from "./thread-auth.js";

interface ResolveInternalAgentThreadParams {
  orgId: string;
  threadId: string;
}

// Plan approval targets the ticket thread the plan was drafted against; the
// caller resolves it by id. (Freeform turns use resolveOperatorThread instead.)
export async function resolveInternalAgentThread(params: ResolveInternalAgentThreadParams): Promise<{ id: string; channelType: string }> {
  const thread = await requireOrgThread(params.threadId, params.orgId);
  return { id: thread.id, channelType: thread.channelType };
}

// The operator key identifies the *person*, not the device they happened to text
// from. Telegram, iMessage and the dashboard Concierge all resolve to the same
// key for one OrgMember, so they share one durable thread and one pending queue.
export function memberOperatorKey(orgMemberId: string): string {
  return `member:${orgMemberId}`;
}

// The merchant's single durable operator thread. Every freeform turn and mirrored
// notification for that person lands here — never sharded per transport or per
// order, and never auto-closed by session logic.
export async function resolveOperatorThread(
  orgId: string,
  operatorKey: string,
): Promise<{ id: string; channelType: string }> {
  // Read before write: a merchant whose thread was re-keyed by the Phase 2
  // backfill still hangs off their original per-binding customer, and upserting
  // first would leave a stray operator customer behind on every turn.
  const existing = await db.thread.findFirst({
    where: { organizationId: orgId, operatorKey },
    select: { id: true, channelType: true },
  });
  if (existing) return { id: existing.id, channelType: existing.channelType };

  const customer = await db.customer.upsert({
    where: { organizationId_platformId: { organizationId: orgId, platformId: operatorKey } },
    update: {},
    create: { organizationId: orgId, platformId: operatorKey },
  });

  try {
    const created = await db.thread.create({
      data: {
        organizationId: orgId,
        customerId: customer.id,
        channelType: "sms_agent",
        status: "open",
        operatorKey,
      },
      select: { id: true, channelType: true },
    });
    return { id: created.id, channelType: created.channelType };
  } catch (err) {
    // Unique (organizationId, operatorKey) race: a concurrent turn created it
    // first. Re-read by operatorKey; if that too finds nothing the create failed
    // for another reason — surface it rather than masking as "record not found".
    const raced = await db.thread.findFirst({
      where: { organizationId: orgId, operatorKey },
      select: { id: true, channelType: true },
    });
    if (raced) return { id: raced.id, channelType: raced.channelType };
    throw err;
  }
}
