import { db } from "@shopkeeper/db";
import { CHANNEL_TYPE, SENDER_TYPE, THREAD_STATUS } from "../thread-constants.js";

/**
 * The open email ticket an email to `to` belongs on: `preferThreadId` when it
 * is one, else that address's most recently active one, else a new ticket
 * opened for them with no messages yet. Drafting an email and sending it read
 * the same ticket, so the approved draft goes out on the ticket it was reviewed
 * on. `replying` says whether the email continues a conversation there.
 */
export async function openEmailThreadFor(input: {
  organizationId: string;
  to: string;
  subject: string;
  preferThreadId?: string;
}): Promise<{ id: string; replying: boolean }> {
  const recipient = {
    organizationId: input.organizationId,
    channelType: CHANNEL_TYPE.EMAIL,
    status: THREAD_STATUS.OPEN,
    customer: { platformId: { equals: input.to, mode: "insensitive" as const } },
  };
  const select = {
    id: true,
    messages: {
      where: { deletedAt: null, senderType: { not: SENDER_TYPE.NOTE } },
      take: 1,
      select: { id: true },
    },
  };
  const existing = (input.preferThreadId
    ? await db.thread.findFirst({ where: { ...recipient, id: input.preferThreadId }, select })
    : null)
    ?? await db.thread.findFirst({ where: recipient, orderBy: { updatedAt: "desc" }, select });
  if (existing) return { id: existing.id, replying: existing.messages.length > 0 };

  const customerKey = { organizationId: input.organizationId, platformId: input.to };
  let customer = await db.customer.findUnique({ where: { organizationId_platformId: customerKey } });
  if (!customer) {
    try {
      customer = await db.customer.create({ data: customerKey });
    } catch (err) {
      if ((err as { code?: string }).code !== "P2002") throw err;
      customer = await db.customer.findUniqueOrThrow({ where: { organizationId_platformId: customerKey } });
    }
  }
  const thread = await db.thread.create({
    data: {
      organizationId: input.organizationId,
      customerId: customer.id,
      channelType: CHANNEL_TYPE.EMAIL,
      status: THREAD_STATUS.OPEN,
      subject: input.subject,
      tag: input.subject,
    },
    select: { id: true },
  });
  return { id: thread.id, replying: false };
}
