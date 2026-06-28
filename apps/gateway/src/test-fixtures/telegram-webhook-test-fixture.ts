/* eslint-disable @typescript-eslint/no-unused-vars */
import { beforeEach, afterEach, vi } from 'vitest';
import { ChannelType, db } from '@shopkeeper/db';
import {
  createTestOrg,
  createTestCustomer,
  createTestThread,
  createTestMessage,
  cleanupTestData,
} from '@shopkeeper/db/test-helpers';
import { updateContext, getContext } from '../operator-context.js';
import {
  clearMockLogger,
  createRegisteredWebhookRouterApp,
} from './webhook-route-test-helpers.js';

// ── Mocks ─────────────────────────────────────────────────────────────────────
// In-memory backing store for the ioredis mock used by rate limiting.
const {
  mockLogger,
  redisStore,
  incrStore,
  sendMessageSpy,
  sendChatActionSpy,
  setMessageReactionSpy,
  executeOperatorAgentTurnSpy,
} = vi.hoisted(() => ({
  mockLogger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
  redisStore: new Map<string, string>(),
  incrStore: new Map<string, number>(),
  sendMessageSpy: vi.fn().mockResolvedValue(true),
  sendChatActionSpy: vi.fn().mockResolvedValue(true),
  setMessageReactionSpy: vi.fn().mockResolvedValue(true),
  executeOperatorAgentTurnSpy: vi.fn().mockResolvedValue({
    summary: 'Done.',
    threadId: '00000000-0000-4000-8000-000000000001',
    actionsPerformed: [],
  }),
}));

vi.mock('ioredis', () => ({
  Redis: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.on = vi.fn().mockReturnThis();
    this.disconnect = vi.fn();
    this.quit = vi.fn().mockResolvedValue('OK');
    this.status = 'ready';
    this.incr = vi.fn(async (key: string) => {
      const next = (incrStore.get(key) ?? 0) + 1;
      incrStore.set(key, next);
      return next;
    });
    this.expire = vi.fn().mockResolvedValue(1);
    this.get = vi.fn(async (key: string) => redisStore.get(key) ?? null);
    this.set = vi.fn(async (key: string, value: string) => {
      redisStore.set(key, value);
      return 'OK';
    });
    this.setex = vi.fn(async (key: string, _ttl: number, value: string) => {
      redisStore.set(key, value);
      return 'OK';
    });
    this.del = vi.fn(async (key: string) => {
      const had = redisStore.delete(key);
      return had ? 1 : 0;
    });
  }),
}));

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.add = vi.fn().mockResolvedValue({ id: 'test-job-id' });
    this.close = vi.fn();
  }),
  Worker: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.on = vi.fn();
    this.close = vi.fn();
  }),
}));

vi.mock('../clients/telegram-client.js', () => ({
  isTelegramConfigured: vi.fn(() => process.env.TELEGRAM_BOT_TOKEN != null && process.env.TELEGRAM_BOT_TOKEN !== ''),
  sendMessage: sendMessageSpy,
  sendChatAction: sendChatActionSpy,
  setMessageReaction: setMessageReactionSpy,
  setWebhook: vi.fn(),
}));

vi.mock('../logger.js', () => ({
  default: mockLogger,
}));

vi.mock('../message-handlers/execute-operator-agent-turn.js', () => ({
  executeOperatorAgentTurn: executeOperatorAgentTurnSpy,
}));

import { registerTelegramWebhookRoutes } from '../routes/webhooks-telegram.js';

export const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET!;
export let org!: Awaited<ReturnType<typeof createTestOrg>>;
export const app = createRegisteredWebhookRouterApp(registerTelegramWebhookRoutes);
export const telegramFixture = {
  app,
  executeOperatorAgentTurnSpy,
  incrStore,
  mockLogger,
  sendChatActionSpy,
  sendMessageSpy,
  setMessageReactionSpy,
  get org() {
    return org;
  },
};

// Wait until the fire-and-forget reply lands. The route does res.send before
// doing async work, so supertest resolves before sendMessage is called.
export async function waitForReplies(count: number, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (sendMessageSpy.mock.calls.length < count) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`timed out waiting for ${count} reply (got ${sendMessageSpy.mock.calls.length})`);
    }
    await new Promise((r) => setTimeout(r, 10));
  }
}

export function lastReplyText(): string {
  const calls = sendMessageSpy.mock.calls;
  if (calls.length === 0) return '';
  return calls[calls.length - 1][1] as string;
}

export async function seedBindToken(params: {
  token: string;
  organizationId: string;
  clerkUserId: string;
}) {
  await db.orgMemberBindToken.create({
    data: {
      token: params.token,
      organizationId: params.organizationId,
      clerkUserId: params.clerkUserId,
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });
}

beforeEach(async () => {
  org = await createTestOrg();
  redisStore.clear();
  incrStore.clear();
  sendMessageSpy.mockClear();
  sendChatActionSpy.mockClear();
  setMessageReactionSpy.mockClear();
  executeOperatorAgentTurnSpy.mockClear();
  executeOperatorAgentTurnSpy.mockResolvedValue({
    summary: 'Done.',
    threadId: '00000000-0000-4000-8000-000000000001',
    actionsPerformed: [],
  });
  clearMockLogger(mockLogger);
});

afterEach(async () => {
  await db.operatorContext.deleteMany({ where: { organizationId: org.id } }).catch(() => undefined);
  await db.orgMember.deleteMany({ where: { organizationId: org.id } }).catch(() => undefined);
  await cleanupTestData(org?.id);
});

// ── Signature gating ─────────────────────────────────────────────────────────
