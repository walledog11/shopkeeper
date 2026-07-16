import { beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import {
  createTestOrg,
  cleanupTestData,
} from '@shopkeeper/db/test-helpers';

interface WorkerTestState {
  capturedHandlers: Map<string, (job: unknown) => Promise<void>>;
  mockAnthropicCreate: ReturnType<typeof vi.fn>;
  mockBlobPut: ReturnType<typeof vi.fn>;
  mockFetch: ReturnType<typeof vi.fn>;
  mockLogger: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
}

const workerTestState = vi.hoisted(() => ({
  capturedHandlers: new Map<string, (job: unknown) => Promise<void>>(),
  mockAnthropicCreate: vi.fn(),
  mockBlobPut: vi.fn(),
  mockFetch: vi.fn(),
  mockLogger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
})) as WorkerTestState;

const WORKER_TEST_STATE_KEY = '__shopkeeperWorkerTestState';

type WorkerTestGlobal = typeof globalThis & {
  [WORKER_TEST_STATE_KEY]?: WorkerTestState;
};

(globalThis as WorkerTestGlobal)[WORKER_TEST_STATE_KEY] = workerTestState;

export function getWorkerTestState(): WorkerTestState {
  const state = (globalThis as WorkerTestGlobal)[WORKER_TEST_STATE_KEY];
  if (!state) {
    throw new Error('Worker test state is not initialized — import worker-test-setup first');
  }
  return state;
}

const {
  capturedHandlers,
  mockAnthropicCreate,
  mockBlobPut,
  mockFetch,
  mockLogger,
} = workerTestState;

vi.mock('@vercel/blob', () => ({
  put: mockBlobPut,
}));

vi.mock('ioredis', () => ({
  Redis: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.on = vi.fn().mockReturnThis();
    this.set = vi.fn().mockResolvedValue('OK');
    this.get = vi.fn().mockResolvedValue(null);
    this.incrby = vi.fn(async (_key: string, delta: number) => delta);
    this.expire = vi.fn().mockResolvedValue(1);
    this.setMaxListeners = vi.fn();
    this.disconnect = vi.fn();
    this.quit = vi.fn().mockResolvedValue('OK');
    this.status = 'ready';
  }),
}));

vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation(function (
    this: Record<string, unknown>,
    queueName: string,
    handler: (job: unknown) => Promise<void>,
  ) {
    capturedHandlers.set(queueName, handler);
    this.on = vi.fn();
    this.close = vi.fn().mockResolvedValue(undefined);
  }),
  Queue: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.add = vi.fn().mockResolvedValue({ id: 'mock-summary-job' });
    this.close = vi.fn().mockResolvedValue(undefined);
  }),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.messages = { create: mockAnthropicCreate };
  }),
}));

vi.mock('../logger.js', () => ({
  default: mockLogger,
}));

vi.stubGlobal('fetch', mockFetch);

let shutdownWorkerRuntime: (() => Promise<void>) | null = null;

beforeAll(async () => {
  const { startWorkerRuntime } = await import('../worker.js');
  const runtime = await startWorkerRuntime();
  shutdownWorkerRuntime = () => runtime.shutdown();
});

afterAll(async () => {
  await shutdownWorkerRuntime?.();
});

export let org!: Awaited<ReturnType<typeof createTestOrg>>;

beforeEach(async () => {
  org = await createTestOrg();
  mockAnthropicCreate.mockReset();
  mockBlobPut.mockReset();
  mockBlobPut.mockResolvedValue({ url: 'https://blob.vercel-storage.com/test' });
  mockFetch.mockReset();
  vi.mocked(mockLogger.debug).mockClear();
  vi.mocked(mockLogger.error).mockClear();
  vi.mocked(mockLogger.info).mockClear();
  vi.mocked(mockLogger.warn).mockClear();
  mockFetch.mockResolvedValue({ ok: false, json: vi.fn(), text: vi.fn().mockResolvedValue('') });
});

afterEach(async () => {
  await cleanupTestData(org?.id);
});
