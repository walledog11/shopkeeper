export type OutboundChannel = 'email' | 'ig_dm' | 'tiktok';
export type OutboundProvider = 'postmark' | 'meta' | 'gmail' | 'tiktok_shop';
export type OutboundSource =
  | 'dispatch_message'
  | 'agent_send_reply'
  | 'agent_send_email'
  | 'auto_ack';

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
  return isOutboundTestRuntime(env) && env.E2E_OUTBOUND_MODE === 'record';
}

function getOutboundRecordPath(env: NodeJS.ProcessEnv = process.env): string {
  return env.E2E_OUTBOUND_RECORD_PATH || `${process.cwd()}/test-results/e2e-outbound.jsonl`;
}

export async function recordOutboundCall(input: OutboundRecordInput): Promise<OutboundRecord | null> {
  if (!isOutboundRecordingEnabled()) {
    return null;
  }

  const runtime = await import('./outbound-recorder-runtime');
  return runtime.recordOutboundCallToFile(input, getOutboundRecordPath());
}

export async function readOutboundRecords(): Promise<OutboundRecord[]> {
  if (!isOutboundTestRuntime()) {
    return [];
  }

  const runtime = await import('./outbound-recorder-runtime');
  return runtime.readOutboundRecordsFromFile(getOutboundRecordPath());
}

export async function clearOutboundRecords(): Promise<void> {
  if (!isOutboundTestRuntime()) {
    return;
  }

  const runtime = await import('./outbound-recorder-runtime');
  await runtime.clearOutboundRecordsFile(getOutboundRecordPath());
}

function isOutboundTestRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === 'test' || env.E2E_TEST_RUN === 'true';
}
