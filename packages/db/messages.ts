import type { Message, Prisma } from '@prisma/client';
import { db } from './client.js';
import { SenderType } from './prisma-enums.js';

type MessageWriteClient = {
  thread: {
    findUnique(args: {
      where: { id: string };
      select: { organizationId: true };
    }): Promise<{ organizationId: string } | null>;
  };
  message: {
    create(args: { data: Prisma.MessageUncheckedCreateInput }): Promise<Message>;
  };
};

// Insert a message and atomically bump Thread.lastMessageAt so the inbox
// sort always reflects real conversation activity. Internal notes don't
// bump — they're metadata, not activity. `threadPatch` merges extra thread
// fields (e.g. resetting a cached plan) into the same write.
export type CreateMessageInput = Omit<Prisma.MessageUncheckedCreateInput, 'organizationId'> & {
  organizationId?: string;
};

async function resolveMessageOrganizationId(
  client: MessageWriteClient,
  data: CreateMessageInput,
): Promise<Prisma.MessageUncheckedCreateInput> {
  const thread = await client.thread.findUnique({
    where: { id: data.threadId },
    select: { organizationId: true },
  });
  if (!thread) {
    throw new Error(`Thread not found: ${data.threadId}`);
  }

  if (data.organizationId && data.organizationId !== thread.organizationId) {
    throw new Error('Message organization does not match its thread organization.');
  }

  return { ...data, organizationId: thread.organizationId };
}

/** Insert a message inside an existing transaction without bumping lastMessageAt. */
export async function createMessageInTransaction(
  tx: MessageWriteClient,
  data: CreateMessageInput,
): Promise<Message> {
  const resolvedData = await resolveMessageOrganizationId(tx, data);
  return tx.message.create({ data: resolvedData });
}

export async function createMessage(
  data: CreateMessageInput,
  threadPatch?: Prisma.ThreadUpdateInput,
): Promise<Message> {
  const resolvedData = await resolveMessageOrganizationId(db, data);
  const isConversation = resolvedData.senderType !== SenderType.note;
  const hasPatch = threadPatch && Object.keys(threadPatch).length > 0;

  if (!isConversation && !hasPatch) {
    return db.message.create({ data: resolvedData });
  }

  return db.$transaction(async (tx) => {
    const message = await tx.message.create({ data: resolvedData });
    await tx.thread.update({
      where: { id: message.threadId },
      data: {
        ...(threadPatch ?? {}),
        ...(isConversation ? { lastMessageAt: message.sentAt, lastMessageSenderType: message.senderType } : {}),
      },
    });
    return message;
  });
}
