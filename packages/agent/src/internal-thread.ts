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

// The merchant's single durable operator thread for one binding. `operatorKey`
// is the binding ref (`imessage:<senderId>` / `telegram:<chatId>`), so every
// freeform turn and mirrored notification from that binding lands on one thread
// — never sharded per order and never auto-closed by session logic.
export async function resolveOperatorThread(
  orgId: string,
  operatorKey: string,
): Promise<{ id: string; channelType: string }> {
  const customer = await db.customer.upsert({
    where: { organizationId_platformId: { organizationId: orgId, platformId: operatorKey } },
    update: {},
    create: { organizationId: orgId, platformId: operatorKey },
  });

  const existing = await db.thread.findFirst({
    where: { organizationId: orgId, operatorKey },
    select: { id: true, channelType: true },
  });
  if (existing) return { id: existing.id, channelType: existing.channelType };

  // Adopt a pre-Phase-B operator thread for this binding: before operatorKey
  // existed, the merchant's operator conversation was a plain open sms_agent
  // thread on this same (operator) customer. Reuse it — creating a second open
  // thread would violate the one-open-thread-per-customer-per-channel index.
  const legacy = await db.thread.findFirst({
    where: {
      organizationId: orgId,
      customerId: customer.id,
      channelType: "sms_agent",
      status: "open",
      operatorKey: null,
    },
    select: { id: true, channelType: true },
  });
  if (legacy) {
    await db.thread.update({ where: { id: legacy.id }, data: { operatorKey } });
    return { id: legacy.id, channelType: legacy.channelType };
  }

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
