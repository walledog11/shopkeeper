import type { PrismaClient } from '@prisma/client';

declare const helpers: {
  ChannelType: typeof import('@prisma/client').ChannelType;
  cleanupTestData: (orgId: string) => Promise<void>;
  createTestIntegration: (
    orgId: string,
    input?: {
      platform?: import('@prisma/client').ChannelType;
      externalAccountId?: string;
      accessToken?: string | null;
      fromEmail?: string | null;
    },
  ) => Promise<unknown>;
  createTestOrg: () => Promise<{ id: string }>;
  db: PrismaClient;
  disconnectDb: () => Promise<void>;
  ensureE2EEmailIntegration: (orgId: string) => Promise<{ externalAccountId: string }>;
  getE2EOrg: () => Promise<{ id: string }>;
  waitForAgentMessage: (input: {
    threadId: string;
    textIncludes: string;
    timeoutMs?: number;
    intervalMs?: number;
  }) => Promise<unknown>;
  waitForEmailThread: (input: {
    orgId: string;
    customerEmail: string;
    textIncludes: string;
    timeoutMs?: number;
    intervalMs?: number;
  }) => Promise<{ id: string }>;
};

export = helpers;
