import { db } from '@shopkeeper/db';
import { CHANNEL, JOB, QUEUE } from '../constants.js';
import logger from '../logger.js';
import {
  createMaintenanceQueue,
  createMaintenanceWorker,
  ONE_DAY_MS,
  scheduleRepeatableJob,
  type MaintenanceJobRegistration,
} from './registration.js';

const CONCURRENCY = 5;
const EPOCH_SENTINEL = new Date(0);

const TOKEN_ENDPOINT = {
  gmail: 'https://oauth2.googleapis.com/token',
} as const;

type EmailOAuthProvider = 'gmail';

interface EmailIntegrationRow {
  id: string;
  organizationId: string;
  metadata: unknown;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
}

function readOAuthProvider(metadata: unknown): EmailOAuthProvider | null {
  if (metadata && typeof metadata === 'object' && 'provider' in metadata) {
    const value = (metadata as { provider?: unknown }).provider;
    if (value === 'gmail') return value;
  }
  return null;
}

function oauthClient(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

async function markReauthRequired(integration: EmailIntegrationRow): Promise<void> {
  if (integration.tokenExpiresAt?.getTime() === 0) return;
  await db.integration.update({
    where: { id: integration.id },
    data: { tokenExpiresAt: EPOCH_SENTINEL },
  });
}

async function probeIntegration(integration: EmailIntegrationRow, provider: EmailOAuthProvider): Promise<void> {
  // Already flagged for reconnect — a dead refresh token stays dead until the
  // merchant reconnects (which resets tokenExpiresAt), so skip to avoid noise.
  if (integration.tokenExpiresAt?.getTime() === 0) return;
  if (!integration.refreshToken) return;

  const client = oauthClient();
  if (!client) {
    logger.warn({ provider, organizationId: integration.organizationId }, '[EmailTokenHealth] OAuth client creds missing — skipping probe');
    return;
  }

  let res: Response;
  try {
    res = await fetch(TOKEN_ENDPOINT[provider], {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: client.clientId,
        client_secret: client.clientSecret,
        refresh_token: integration.refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    });
  } catch (err) {
    // Network/transient failure — do not flag reconnect on a blip.
    logger.warn({ provider, organizationId: integration.organizationId, err: (err as Error).message }, '[EmailTokenHealth] Token probe network error');
    return;
  }

  if (res.ok) {
    const data = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number; refresh_token?: string } | null;
    if (!data?.access_token) {
      logger.warn({ provider, organizationId: integration.organizationId }, '[EmailTokenHealth] Refresh succeeded without access_token');
      return;
    }
    await db.integration.update({
      where: { id: integration.id },
      data: {
        accessToken: data.access_token,
        tokenExpiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000),
        ...(data.refresh_token && { refreshToken: data.refresh_token }),
      },
    });
    return;
  }

  // 4xx (invalid_grant) means the refresh token is revoked/expired → reconnect.
  // 5xx is a provider-side transient error; leave the token alone.
  if (res.status >= 400 && res.status < 500) {
    const body = await res.text().catch(() => '');
    logger.error({ provider, organizationId: integration.organizationId, status: res.status, body }, '[EmailTokenHealth] Refresh token dead — flagging reconnect');
    await markReauthRequired(integration);
    return;
  }

  logger.warn({ provider, organizationId: integration.organizationId, status: res.status }, '[EmailTokenHealth] Token probe transient failure');
}

export async function runEmailTokenHealthCheck(): Promise<void> {
  logger.info('[EmailTokenHealth] Running daily Gmail token check');

  const integrations = await db.integration.findMany({
    where: { platform: CHANNEL.EMAIL, refreshToken: { not: null } },
    select: { id: true, organizationId: true, metadata: true, refreshToken: true, tokenExpiresAt: true },
  });

  const oauthIntegrations: { integration: EmailIntegrationRow; provider: EmailOAuthProvider }[] = [];
  for (const integration of integrations) {
    const provider = readOAuthProvider(integration.metadata);
    if (provider) oauthIntegrations.push({ integration, provider });
  }

  logger.info({ count: oauthIntegrations.length }, '[EmailTokenHealth] Checking email OAuth integrations');

  for (let i = 0; i < oauthIntegrations.length; i += CONCURRENCY) {
    await Promise.all(
      oauthIntegrations.slice(i, i + CONCURRENCY).map(async ({ integration, provider }) => {
        try {
          await probeIntegration(integration, provider);
        } catch (err) {
          logger.error({ organizationId: integration.organizationId, err: (err as Error).message }, '[EmailTokenHealth] Failed to probe token');
        }
      }),
    );
  }

  logger.info('[EmailTokenHealth] Daily check complete');
}

export const registerEmailTokenHealthMaintenanceJob: MaintenanceJobRegistration = async (context) => {
  const queue = createMaintenanceQueue(context, QUEUE.EMAIL_TOKEN_HEALTH);
  await scheduleRepeatableJob(queue, JOB.EMAIL_TOKEN_HEALTH_CHECK, JOB.EMAIL_TOKEN_HEALTH_ID, ONE_DAY_MS);

  const worker = createMaintenanceWorker(context, QUEUE.EMAIL_TOKEN_HEALTH, runEmailTokenHealthCheck, {
    label: 'EmailTokenHealth',
    failureQueue: 'email-token-health',
  });

  return { workers: [worker], queues: [queue] };
};
