import { DelayedError, type Job } from 'bullmq';
import { getGatewayRedis } from '../../clients/redis-client.js';
import logger from '../../logger.js';
import { emitOpsAlert } from '../../ops-alerts.js';
import { listOperatorBindings, notifyOperator } from '../../operator-notify.js';
import type { AiSummaryJobData } from '../../types.js';

// A refused customer message is retried this often while the provider is down,
// for at most this long; past it the job fails through its normal attempts and
// plan recovery owns the message.
const RETRY_EVERY_MS = 2 * 60_000;
const MAX_WAIT_MS = 24 * 60 * 60_000;
// Outlives the longest wait, so an outage is announced once.
const OUTAGE_STATE_TTL_SECONDS = 2 * 24 * 60 * 60;

export const MODEL_OUTAGE_NOTICE =
  "Heads up: the AI service isn't responding, so I can't answer new customer messages right now. "
  + "They're safe in your inbox, and I'll pick them up as soon as it's back.";
export const MODEL_RECOVERED_NOTICE =
  "The AI service is working again. I'm catching up on the messages that came in while it was down.";

function outageKey(organizationId: string): string {
  return `model-outage:${organizationId}`;
}

// Every bound phone hears it, best-effort: a failed push never holds the message.
async function notifyMerchant(organizationId: string, body: string, idempotencyKey: string): Promise<void> {
  const bindings = await listOperatorBindings(organizationId).catch(() => []);
  for (const member of bindings) {
    try {
      await notifyOperator(organizationId, member, body, {}, { idempotencyKey });
    } catch (err) {
      logger.warn({ err: (err as Error).message, organizationId }, '[ModelOutage] Merchant notice not delivered');
    }
  }
}

async function announceOutage(organizationId: string, since: number, error: unknown): Promise<void> {
  try {
    const first = await getGatewayRedis().set(outageKey(organizationId), String(since), 'EX', OUTAGE_STATE_TTL_SECONDS, 'NX');
    if (first !== 'OK') return;
  } catch (err) {
    logger.warn({ err: (err as Error).message, organizationId }, '[ModelOutage] Outage state unavailable');
    return;
  }
  const status = typeof (error as { status?: unknown }).status === 'number' ? (error as { status: number }).status : null;
  // Once per workspace's outage; across workspaces it is one incident.
  emitOpsAlert({
    category: 'agent_failure',
    level: 'error',
    message: '[ModelOutage] Model provider refused a customer message; holding it',
    fingerprint: ['ops-alert', 'agent_failure', 'gateway', 'source:model_outage'],
    extra: { organizationId, status },
  }, { pushOncePerSecs: 60 * 60 });
  await notifyMerchant(organizationId, MODEL_OUTAGE_NOTICE, `model-outage:${organizationId}:${since}`);
}

/**
 * Holds a customer message the model provider refused until it accepts again:
 * the job is moved back to delayed without spending an attempt, and the
 * merchant is told once per outage. Past the bound the provider's error is
 * thrown and the job fails as any other would.
 */
export async function waitOutModelOutage(
  job: Pick<Job<AiSummaryJobData>, 'data' | 'updateData' | 'moveToDelayed'>,
  token: string | undefined,
  error: unknown,
  now: number = Date.now(),
): Promise<never> {
  const since = job.data.modelOutageSince ?? now;
  if (now - since >= MAX_WAIT_MS) throw error;
  await announceOutage(job.data.organizationId, since, error);
  if (job.data.modelOutageSince === undefined) await job.updateData({ ...job.data, modelOutageSince: since });
  await job.moveToDelayed(now + RETRY_EVERY_MS, token);
  throw new DelayedError();
}

/** After a customer message is handled: if this workspace was told of an outage, say it is over. */
export async function noteModelRecovered(organizationId: string): Promise<void> {
  let ended: number;
  try {
    ended = await getGatewayRedis().del(outageKey(organizationId));
  } catch {
    return;
  }
  if (ended === 0) return;
  logger.info({ organizationId }, '[ModelOutage] Model provider accepting again');
  await notifyMerchant(organizationId, MODEL_RECOVERED_NOTICE, `model-recovered:${organizationId}:${Date.now()}`);
}
