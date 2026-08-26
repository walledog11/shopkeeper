import type { PrismaClient } from '@prisma/client';

declare const helpers: {
  ChannelType: typeof import('@prisma/client').ChannelType;
  SenderType: typeof import('@prisma/client').SenderType;
  cleanupTestData: (orgId: string) => Promise<void>;
  clearRateLimitKey: (key: string, windowSecs?: number) => Promise<void>;
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
  deleteTestCustomers: (customerIds: string[]) => Promise<void>;
  disconnectDb: () => Promise<void>;
  ensureE2EEmailIntegration: (orgId: string) => Promise<{ externalAccountId: string }>;
  getE2EOrg: () => Promise<{ id: string }>;
  seedEmailThreadWithCachedPlan: (input: {
    orgId: string;
    customerEmail?: string;
    customerName?: string;
    inboundText: string;
    replyText: string;
    instruction?: string;
    tag?: string;
  }) => Promise<{
    customer: { id: string; platformId: string };
    customerMessage: { id: string };
    plan: {
      instruction: string;
      steps: Array<{ id: string; tool: string; label: string; description: string; category: string; enabled: boolean }>;
      rawToolCalls: Array<{ id: string; name: string; input: unknown }>;
    };
    thread: { id: string };
  }>;
  waitForAgentAuditNote: (input: {
    threadId: string;
    textIncludes: string;
    timeoutMs?: number;
    intervalMs?: number;
  }) => Promise<{ contentText: string | null }>;
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
