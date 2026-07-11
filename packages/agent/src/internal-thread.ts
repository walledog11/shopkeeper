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
  } catch {
    // Unique (organizationId, operatorKey) race: a concurrent turn created it first.
    const raced = await db.thread.findFirstOrThrow({
      where: { organizationId: orgId, operatorKey },
      select: { id: true, channelType: true },
    });
    return { id: raced.id, channelType: raced.channelType };
  }
}
