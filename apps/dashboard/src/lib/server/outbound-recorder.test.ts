import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearOutboundRecords,
  isOutboundRecordingEnabled,
  readOutboundRecords,
  recordOutboundCall,
} from './outbound-recorder';

let tempDir: string | null = null;

function testEnv(vars: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return vars as NodeJS.ProcessEnv;
}

async function useTempRecordPath() {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'clerk-outbound-records-'));
  process.env.E2E_OUTBOUND_RECORD_PATH = path.join(tempDir, 'records.jsonl');
}

afterEach(async () => {
  vi.unstubAllEnvs();

  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

describe('outbound recorder', () => {
  it('is enabled only for explicit E2E recording in a test runtime', () => {
    expect(isOutboundRecordingEnabled(testEnv({ NODE_ENV: 'production', E2E_OUTBOUND_MODE: 'record' }))).toBe(false);
    expect(isOutboundRecordingEnabled(testEnv({ NODE_ENV: 'development', E2E_TEST_RUN: 'true', E2E_OUTBOUND_MODE: 'record' }))).toBe(true);
    expect(isOutboundRecordingEnabled(testEnv({ NODE_ENV: 'test', E2E_OUTBOUND_MODE: 'live' }))).toBe(false);
    expect(isOutboundRecordingEnabled(testEnv({ NODE_ENV: 'test', E2E_OUTBOUND_MODE: 'record' }))).toBe(true);
  });

  it('appends and reads outbound records when recording is enabled', async () => {
    await useTempRecordPath();
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('E2E_OUTBOUND_MODE', 'record');

    const record = await recordOutboundCall({
      source: 'dispatch_message',
      provider: 'postmark',
      channel: 'email',
      organizationId: 'org_test',
      threadId: 'thread_test',
      to: 'customer@example.com',
      from: 'support@example.com',
      subject: 'Re: Support',
      text: 'Hello',
    });

    expect(record?.id).toBeTruthy();
    const records = await readOutboundRecords();
    expect(records).toMatchObject([
      {
        source: 'dispatch_message',
        provider: 'postmark',
        channel: 'email',
        organizationId: 'org_test',
        threadId: 'thread_test',
        to: 'customer@example.com',
        text: 'Hello',
      },
    ]);

    await clearOutboundRecords();
    await expect(readOutboundRecords()).resolves.toEqual([]);
  });

  it('does nothing when recording is disabled', async () => {
    await useTempRecordPath();
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('E2E_OUTBOUND_MODE', 'live');

    await expect(recordOutboundCall({
      source: 'dispatch_message',
      provider: 'postmark',
      channel: 'email',
      organizationId: 'org_test',
      to: 'customer@example.com',
      text: 'Hello',
    })).resolves.toBeNull();
    await expect(readOutboundRecords()).resolves.toEqual([]);
  });
});
