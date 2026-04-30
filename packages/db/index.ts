import { createRequire } from 'node:module';
import type { Message, Prisma, PrismaClient as PrismaClientType } from '@prisma/client';

const require = createRequire(import.meta.url);
const prismaClient = require('@prisma/client') as typeof import('@prisma/client');
const {
  PrismaClient,
  Prisma: PrismaRuntime,
  SenderType: SenderTypeRuntime,
  ChannelType: ChannelTypeRuntime,
  ThreadFilterStatus: ThreadFilterStatusRuntime,
  ThreadFilterFeedback: ThreadFilterFeedbackRuntime,
} = prismaClient;

type DbChannelType = (typeof ChannelTypeRuntime)[keyof typeof ChannelTypeRuntime];
type DbSenderType = (typeof SenderTypeRuntime)[keyof typeof SenderTypeRuntime];
type DbThreadFilterStatus = (typeof ThreadFilterStatusRuntime)[keyof typeof ThreadFilterStatusRuntime];
type DbThreadFilterFeedback = (typeof ThreadFilterFeedbackRuntime)[keyof typeof ThreadFilterFeedbackRuntime];

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClientType | undefined;
};

function createClient(): PrismaClientType {
  const log = (process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error']) as ('query' | 'error' | 'warn')[];
  if (process.env.NEON_SERVERLESS_HTTP === 'true' && process.env.NODE_ENV !== 'test') {
    const { PrismaNeon } = require('@prisma/adapter-neon') as typeof import('@prisma/adapter-neon');
    const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
    return new PrismaClient({ adapter, log });
  }
  return new PrismaClient({ log });
}

const shouldCacheClient = process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test';

export const db = shouldCacheClient
  ? (globalForPrisma.prisma ?? createClient())
  : createClient();

if (shouldCacheClient) globalForPrisma.prisma = db;

// Insert a message and atomically bump Thread.lastMessageAt so the inbox
// sort always reflects real conversation activity. Internal notes don't
// bump — they're metadata, not activity. `threadPatch` merges extra thread
// fields (e.g. resetting a cached plan) into the same write.
export async function createMessage(
  data: Prisma.MessageUncheckedCreateInput,
  threadPatch?: Prisma.ThreadUpdateInput,
): Promise<Message> {
  const isConversation = data.senderType !== SenderTypeRuntime.note;
  const hasPatch = threadPatch && Object.keys(threadPatch).length > 0;

  if (!isConversation && !hasPatch) {
    return db.message.create({ data });
  }

  return db.$transaction(async (tx) => {
    const message = await tx.message.create({ data });
    await tx.thread.update({
      where: { id: message.threadId },
      data: {
        ...(threadPatch ?? {}),
        ...(isConversation ? { lastMessageAt: message.sentAt } : {}),
      },
    });
    return message;
  });
}

export {
  PrismaRuntime as Prisma,
  SenderTypeRuntime as SenderType,
  ChannelTypeRuntime as ChannelType,
  ThreadFilterStatusRuntime as ThreadFilterStatus,
  ThreadFilterFeedbackRuntime as ThreadFilterFeedback,
};
export type { PrismaClientType as PrismaClient, DbChannelType, DbSenderType, DbThreadFilterStatus, DbThreadFilterFeedback };
