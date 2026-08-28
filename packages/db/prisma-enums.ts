import { createRequire } from 'node:module';

import type { PrismaClient as PrismaClientType } from '@prisma/client';

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
  ThreadRequestDisposition: ThreadRequestDispositionRuntime,
} = prismaClient;

type DbChannelType = (typeof ChannelTypeRuntime)[keyof typeof ChannelTypeRuntime];
type DbThreadStatus = (typeof ThreadStatusRuntime)[keyof typeof ThreadStatusRuntime];
type DbSenderType = (typeof SenderTypeRuntime)[keyof typeof SenderTypeRuntime];
type DbThreadFilterStatus = (typeof ThreadFilterStatusRuntime)[keyof typeof ThreadFilterStatusRuntime];
type DbThreadFilterFeedback = (typeof ThreadFilterFeedbackRuntime)[keyof typeof ThreadFilterFeedbackRuntime];
type DbEmailProvider = (typeof EmailProviderRuntime)[keyof typeof EmailProviderRuntime];
type DbThreadRequestDisposition =
  (typeof ThreadRequestDispositionRuntime)[keyof typeof ThreadRequestDispositionRuntime];

export {
  PrismaClient,
  PrismaRuntime as Prisma,
  SenderTypeRuntime as SenderType,
  ChannelTypeRuntime as ChannelType,
  ThreadStatusRuntime as ThreadStatus,
  ThreadFilterStatusRuntime as ThreadFilterStatus,
  ThreadFilterFeedbackRuntime as ThreadFilterFeedback,
  EmailProviderRuntime as EmailProvider,
  ThreadRequestDispositionRuntime as ThreadRequestDisposition,
};
export type {
  PrismaClientType,
  DbChannelType,
  DbThreadStatus,
  DbSenderType,
  DbThreadFilterStatus,
  DbThreadFilterFeedback,
  DbEmailProvider,
  DbThreadRequestDisposition,
};
export type ChannelType = DbChannelType;
export type ThreadStatus = DbThreadStatus;
export type SenderType = DbSenderType;
export type ThreadFilterStatus = DbThreadFilterStatus;
export type ThreadFilterFeedback = DbThreadFilterFeedback;
export type EmailProvider = DbEmailProvider;
