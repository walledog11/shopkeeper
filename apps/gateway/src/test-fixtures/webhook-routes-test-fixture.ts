/* eslint-disable @typescript-eslint/no-unused-vars */
import { beforeEach, afterEach, vi } from 'vitest';
import { ChannelType, db } from '@shopkeeper/db';
import {
  createTestOrg,
  createTestIntegration,
  cleanupTestData,
} from '@shopkeeper/db/test-helpers';
import {
  clearMockLogger,
  createWebhookRouterApp,
  hmacSha256,
  hmacSha256Base64,
} from './webhook-route-test-helpers.js';

// Mock ioredis and bullmq so the webhook module doesn't open live Redis connections.
// We spy on Queue.add/addBulk to confirm the right jobs were enqueued.
const redisDedupeStore = vi.hoisted(() => new Map<string, string>());

const {
  clearRedisDedupeStore,
  googleTokenVerifySpy,
  mockLogger,
  queueAddBulkSpy,
  queueAddSpy,
  queueGetJobSpy,
  getPlatformSpectrumAppSpy,
  spectrumWebhookSpy,
  uploadInboundAttachmentSpy,
  SpectrumConfigError,
} = vi.hoisted(() => ({
  clearRedisDedupeStore: () => redisDedupeStore.clear(),
  googleTokenVerifySpy: vi.fn(),
  mockLogger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
  queueAddBulkSpy: vi.fn().mockResolvedValue([{ id: 'test-bulk-job-id' }]),
  queueAddSpy: vi.fn().mockResolvedValue({ id: 'test-job-id' }),
  queueGetJobSpy: vi.fn().mockResolvedValue(null),
  getPlatformSpectrumAppSpy: vi.fn(),
  spectrumWebhookSpy: vi.fn(),
  uploadInboundAttachmentSpy: vi.fn(),
  SpectrumConfigError: class SpectrumIntegrationConfigError extends Error {},
}));

vi.mock('ioredis', () => ({
  Redis: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.on = vi.fn().mockReturnThis();
    this.disconnect = vi.fn();
    this.quit = vi.fn().mockResolvedValue('OK');
    this.status = 'ready';
    this.incr = vi.fn().mockResolvedValue(1);
    this.expire = vi.fn().mockResolvedValue(1);
    this.set = vi.fn().mockImplementation(async (key: string, value: string, ...args: unknown[]) => {
      if (args.includes('NX') && redisDedupeStore.has(key)) {
        return null;
      }
      redisDedupeStore.set(key, value);
      return 'OK';
    });
  }),
}));

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.add = queueAddSpy;
    this.addBulk = queueAddBulkSpy;
    this.getJob = queueGetJobSpy;
    this.close = vi.fn();
  }),
  Worker: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.on = vi.fn();
    this.close = vi.fn();
  }),
}));

vi.mock('google-auth-library', () => ({
  OAuth2Client: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.verifyIdToken = googleTokenVerifySpy;
  }),
}));

vi.mock('../logger.js', () => ({
  default: mockLogger,
}));

vi.mock('../clients/spectrum.js', () => ({
  getPlatformSpectrumApp: getPlatformSpectrumAppSpy,
  sendImessageOnSpace: vi.fn(async (space: { send: (text: string) => Promise<unknown> }, text: string) => {
    await space.send(text);
  }),
  SpectrumIntegrationConfigError: SpectrumConfigError,
}));

vi.mock('../storage/blob.js', () => ({
  uploadInboundAttachment: uploadInboundAttachmentSpy,
}));

// Import the router after mocks are hoisted
import webhookRoutes from '../routes/webhooks.js';

export const INSTAGRAM_SECRET = process.env.INSTAGRAM_WEBHOOK_APP_SECRET!;
export const INSTAGRAM_VERIFY_TOKEN = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN!;
export const SHOPIFY_SECRET = process.env.SHOPIFY_APP_SECRET!;
export const GMAIL_PUBSUB_AUDIENCE = 'https://gateway.example.com/webhooks/gmail/push';
export const GMAIL_PUSH_SERVICE_ACCOUNT =
  'shopkeeper-gmail-push@test-project.iam.gserviceaccount.com';

export let org!: Awaited<ReturnType<typeof createTestOrg>>;
export const app = createWebhookRouterApp(webhookRoutes);
export const webhookFixture = {
  SpectrumConfigError,
  app,
  clearRedisDedupeStore,
  getPlatformSpectrumAppSpy,
  googleTokenVerifySpy,
  mockLogger,
  queueAddBulkSpy,
  queueAddSpy,
  queueGetJobSpy,
  spectrumWebhookSpy,
  uploadInboundAttachmentSpy,
  get org() {
    return org;
  },
};

beforeEach(async () => {
  process.env.GMAIL_PUBSUB_AUDIENCE = GMAIL_PUBSUB_AUDIENCE;
  process.env.GMAIL_PUBSUB_PUSH_SERVICE_ACCOUNT = GMAIL_PUSH_SERVICE_ACCOUNT;
  clearRedisDedupeStore();
  org = await createTestOrg();
  queueAddBulkSpy.mockClear();
  queueAddSpy.mockClear();
  queueGetJobSpy.mockClear().mockResolvedValue(null);
  getPlatformSpectrumAppSpy.mockReset();
  googleTokenVerifySpy.mockReset();
  spectrumWebhookSpy.mockReset();
  uploadInboundAttachmentSpy.mockReset();
  getPlatformSpectrumAppSpy.mockResolvedValue({ webhook: spectrumWebhookSpy });
  googleTokenVerifySpy.mockResolvedValue({
    getPayload: () => ({
      aud: GMAIL_PUBSUB_AUDIENCE,
      email: GMAIL_PUSH_SERVICE_ACCOUNT,
      email_verified: true,
      iss: 'https://accounts.google.com',
    }),
  });
  spectrumWebhookSpy.mockResolvedValue({ status: 200, headers: {}, body: new Uint8Array() });
  uploadInboundAttachmentSpy.mockResolvedValue('blob:attachments/test/attachment');
  clearMockLogger(mockLogger);
});

afterEach(async () => {
  await cleanupTestData(org?.id);
});

// ---------------------------------------------------------------------------
// GET /webhooks/meta — Meta verification handshake
// ---------------------------------------------------------------------------
