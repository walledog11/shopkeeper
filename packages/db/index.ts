import { createRequire } from 'node:module';
import type { Message, Prisma, PrismaClient as PrismaClientType } from '@prisma/client';
import { decryptToken, encryptToken } from './crypto.js';

const require = createRequire(import.meta.url);
const prismaClient = require('@prisma/client') as typeof import('@prisma/client');
const {
  PrismaClient,
  Prisma: PrismaRuntime,
  SenderType: SenderTypeRuntime,
  ChannelType: ChannelTypeRuntime,
  ThreadStatus: ThreadStatusRuntime,
  ThreadFilterStatus: ThreadFilterStatusRuntime,
  ThreadFilterFeedback: ThreadFilterFeedbackRuntime,
  EmailProvider: EmailProviderRuntime,
} = prismaClient;

type DbChannelType = (typeof ChannelTypeRuntime)[keyof typeof ChannelTypeRuntime];
type DbThreadStatus = (typeof ThreadStatusRuntime)[keyof typeof ThreadStatusRuntime];
type DbSenderType = (typeof SenderTypeRuntime)[keyof typeof SenderTypeRuntime];
type DbThreadFilterStatus = (typeof ThreadFilterStatusRuntime)[keyof typeof ThreadFilterStatusRuntime];
type DbThreadFilterFeedback = (typeof ThreadFilterFeedbackRuntime)[keyof typeof ThreadFilterFeedbackRuntime];
type DbEmailProvider = (typeof EmailProviderRuntime)[keyof typeof EmailProviderRuntime];

type ClerkDb = ReturnType<typeof createClient>;

const globalForPrisma = globalThis as typeof globalThis & {
  prisma: ClerkDb | undefined;
};

const TOKEN_FIELDS = ['accessToken', 'refreshToken'] as const;

function encryptFieldInput(value: unknown): unknown {
  if (value === null) return null;
  if (typeof value === 'string') return encryptToken(value);
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const op = value as Record<string, unknown>;
    if ('set' in op) {
      return { ...op, set: typeof op.set === 'string' ? encryptToken(op.set) : op.set };
    }
  }
  return value;
}

function encryptTokenFieldsInPayload<T extends Record<string, unknown> | undefined>(payload: T): T {
  if (!payload) return payload;
  const next: Record<string, unknown> = { ...payload };
  for (const field of TOKEN_FIELDS) {
    if (field in next) next[field] = encryptFieldInput(next[field]);
  }
  return next as T;
}

function transformWriteArgs(operation: string, args: unknown): unknown {
  if (!args || typeof args !== 'object') return args;
  const obj = args as Record<string, unknown>;
  if (operation === 'create' || operation === 'update' || operation === 'updateMany') {
    if ('data' in obj) {
      const data = obj.data;
      const nextData = Array.isArray(data)
        ? data.map((row) => encryptTokenFieldsInPayload(row as Record<string, unknown>))
        : encryptTokenFieldsInPayload(data as Record<string, unknown>);
      return { ...obj, data: nextData };
    }
  }
  if (operation === 'createMany') {
    if ('data' in obj) {
      const data = obj.data;
      const nextData = Array.isArray(data)
        ? data.map((row) => encryptTokenFieldsInPayload(row as Record<string, unknown>))
        : encryptTokenFieldsInPayload(data as Record<string, unknown>);
      return { ...obj, data: nextData };
    }
  }
  if (operation === 'upsert') {
    return {
      ...obj,
      ...(obj.create ? { create: encryptTokenFieldsInPayload(obj.create as Record<string, unknown>) } : {}),
      ...(obj.update ? { update: encryptTokenFieldsInPayload(obj.update as Record<string, unknown>) } : {}),
    };
  }
  return args;
}

function decryptIntegrationRow(row: unknown): void {
  if (!row || typeof row !== 'object') return;
  const obj = row as Record<string, unknown>;
  for (const field of TOKEN_FIELDS) {
    if (field in obj && typeof obj[field] === 'string') {
      obj[field] = decryptToken(obj[field] as string);
    }
  }
}

function decryptResultRows(result: unknown): unknown {
  if (result == null) return result;
  if (Array.isArray(result)) {
    for (const row of result) decryptIntegrationRow(row);
    return result;
  }
  if (typeof result === 'object') {
    decryptIntegrationRow(result);
  }
  return result;
}

function createClient() {
  const log = (process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error']) as ('query' | 'error' | 'warn')[];
  let base: PrismaClientType;
  if (process.env.NEON_SERVERLESS_HTTP === 'true' && process.env.NODE_ENV !== 'test') {
    const { PrismaNeon } = require('@prisma/adapter-neon') as typeof import('@prisma/adapter-neon');
    const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
    base = new PrismaClient({ adapter, log });
  } else {
    base = new PrismaClient({ log });
  }

  return base.$extends({
    query: {
      integration: {
        async $allOperations({ args, query, operation }) {
          const nextArgs = transformWriteArgs(operation, args);
          const result = await query(nextArgs as never);
          return decryptResultRows(result) as never;
        },
      },
    },
  });
}

const shouldCacheClient = process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test';

export const db: ClerkDb = shouldCacheClient
  ? (globalForPrisma.prisma ?? createClient())
  : createClient();

if (shouldCacheClient) globalForPrisma.prisma = db;

// Insert a message and atomically bump Thread.lastMessageAt so the inbox
// sort always reflects real conversation activity. Internal notes don't
// bump — they're metadata, not activity. `threadPatch` merges extra thread
// fields (e.g. resetting a cached plan) into the same write.
export type CreateMessageInput = Omit<Prisma.MessageUncheckedCreateInput, 'organizationId'> & {
  organizationId?: string;
};

async function resolveMessageOrganizationId(
  data: CreateMessageInput,
): Promise<Prisma.MessageUncheckedCreateInput> {
  const thread = await db.thread.findUnique({
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

export async function createMessage(
  data: CreateMessageInput,
  threadPatch?: Prisma.ThreadUpdateInput,
): Promise<Message> {
  const resolvedData = await resolveMessageOrganizationId(data);
  const isConversation = resolvedData.senderType !== SenderTypeRuntime.note;
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

export {
  PrismaRuntime as Prisma,
  SenderTypeRuntime as SenderType,
  ChannelTypeRuntime as ChannelType,
  ThreadStatusRuntime as ThreadStatus,
  ThreadFilterStatusRuntime as ThreadFilterStatus,
  ThreadFilterFeedbackRuntime as ThreadFilterFeedback,
  EmailProviderRuntime as EmailProvider,
};
export type {
  PrismaClientType as PrismaClient,
  DbChannelType,
  DbThreadStatus,
  DbSenderType,
  DbThreadFilterStatus,
  DbThreadFilterFeedback,
  DbEmailProvider,
};
export type ChannelType = DbChannelType;
export type ThreadStatus = DbThreadStatus;
export type SenderType = DbSenderType;
export type ThreadFilterStatus = DbThreadFilterStatus;
export type ThreadFilterFeedback = DbThreadFilterFeedback;
export type EmailProvider = DbEmailProvider;
export { encryptToken, decryptToken, isEncrypted } from './crypto.js';
export {
  computeTenantConsistencyReport,
  type TenantConsistencyCheckResult,
  type TenantConsistencyMismatch,
  type TenantConsistencyReport,
} from './tenant-consistency.js';
export {
  DEFAULT_DAILY_LLM_SPEND_CAP_USD,
  LLM_PRICING,
  NANO_DOLLARS_PER_USD,
  SpendCapError,
  isSpendCapError,
  nanoDollarsToUsd,
  usageToNanoDollars,
  usdToNanoDollars,
  utcDayString,
} from './llm-spend.js';
export type { LlmTokenPriceNanoUsd, LlmUsageTokens } from './llm-spend.js';
export { getDailyLlmSpendNano, recordDailyLlmSpend } from './spend-store.js';
export {
  commitDailyRefundSpendReservation,
  getDailyRefundSpendCents,
  incrementDailyRefundSpendCents,
  markDailyRefundSpendReservationUnknown,
  releaseDailyRefundSpendReservation,
  reserveDailyRefundSpend,
} from './refund-spend.js';
export type {
  ReserveDailyRefundSpendParams,
  ReserveDailyRefundSpendResult,
} from './refund-spend.js';
export {
  ORG_MEMBER_BIND_TOKEN_TTL_SECONDS,
  createOrgMemberBindToken,
  deleteOrgMemberBindToken,
  findOrgMemberBindToken,
  looksLikeOrgMemberBindToken,
} from './operator-bind.js';
export type { OrgMemberBindTokenPayload } from './operator-bind.js';
export {
  BRAND_VOICE_MAX_CHARS,
  VOICE_RATIONALE_MAX_CHARS,
  VOICE_SYNTHESIS_MIN_EDITS,
  VOICE_SYNTHESIS_MAX_EDITS,
  boundVoiceProposal,
  isMeaningfulVoiceEdit,
  parseVoiceProposal,
} from './voice.js';
export type { VoiceProposal } from './voice.js';
export {
  ensureReturnWatchFromDelivery,
  listOpenReturnWatches,
  markReturnWatchPlanPushed,
  markReturnWatchSkipped,
  recordReturnWatch,
  type RecordReturnWatchParams,
  type ReturnWatchTool,
} from './return-watch.js';
export {
  getShipmentWatch,
  isTerminalShipmentWatchStatus,
  markShipmentWatchPlanPushed,
  markShipmentWatchSkipped,
  recordShipmentWatch,
  type RecordShipmentWatchParams,
  type ShipmentWatchHandle,
  type ShipmentWatchIssueType,
  type ShipmentWatchStatus,
} from './shipment-watch.js';
export {
  isTerminalFollowUpWatchStatus,
  listOpenFollowUpWatchCandidates,
  markFollowUpWatchNotified,
  markFollowUpWatchSkipped,
  recordFollowUpWatch,
  type FollowUpWatchCandidate,
  type FollowUpWatchKind,
  type FollowUpWatchStatus,
  type RecordFollowUpWatchParams,
} from './follow-up-watch.js';
