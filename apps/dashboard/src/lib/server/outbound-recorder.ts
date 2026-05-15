import { appendFile, mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export type OutboundChannel = 'email' | 'ig_dm';
export type OutboundProvider = 'postmark' | 'meta' | 'gmail' | 'outlook';
export type OutboundSource = 'dispatch_message' | 'agent_send_reply' | 'agent_send_email';

export interface OutboundRecordInput {
  source: OutboundSource;
  provider: OutboundProvider;
  channel: OutboundChannel;
  organizationId: string;
  threadId?: string;
  to: string;
  from?: string;
  subject?: string;
  text: string;
  headers?: Array<{ name: string; value: string }>;
  metadata?: Record<string, unknown>;
}

export interface OutboundRecord extends OutboundRecordInput {
  id: string;
  recordedAt: string;
}

export function isOutboundRecordingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const isE2ERuntime = env.NODE_ENV === 'test' || env.E2E_TEST_RUN === 'true';
  return isE2ERuntime && env.E2E_OUTBOUND_MODE === 'record';
}

export function getOutboundRecordPath(env: NodeJS.ProcessEnv = process.env): string {
  return env.E2E_OUTBOUND_RECORD_PATH || path.join(process.cwd(), 'test-results', 'e2e-outbound.jsonl');
}

export async function recordOutboundCall(input: OutboundRecordInput): Promise<OutboundRecord | null> {
  if (!isOutboundRecordingEnabled()) {
    return null;
  }

  const record: OutboundRecord = {
    id: randomUUID(),
    recordedAt: new Date().toISOString(),
    ...input,
  };
  const recordPath = getOutboundRecordPath();

  await mkdir(path.dirname(recordPath), { recursive: true });
  await appendFile(recordPath, `${JSON.stringify(record)}\n`, 'utf8');

  return record;
}

export async function readOutboundRecords(): Promise<OutboundRecord[]> {
  if (process.env.NODE_ENV !== 'test' && process.env.E2E_TEST_RUN !== 'true') {
    return [];
  }

  const recordPath = getOutboundRecordPath();
  const content = await readFile(recordPath, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return '';
    throw error;
  });

  return content
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as OutboundRecord);
}

export async function clearOutboundRecords(): Promise<void> {
  if (process.env.NODE_ENV !== 'test' && process.env.E2E_TEST_RUN !== 'true') {
    return;
  }

  await rm(getOutboundRecordPath(), { force: true });
}
