import { createHash } from 'node:crypto';
import { Spectrum, type SpectrumInstance } from 'spectrum-ts';
import { imessage } from 'spectrum-ts/providers/imessage';
import { getSpectrumConfig, type SpectrumConfig } from '../config/runtime-config.js';
import logger from '../logger.js';
import { recordProviderSendFailureInBackground } from '../provider-send-alerts.js';

type ImessageProviderConfig = ReturnType<typeof imessage.config>;

export type ImessageSpectrumApp = SpectrumInstance<[ImessageProviderConfig]>;

export interface ImessageSendTarget {
  id: string;
  send: (text: string) => Promise<unknown>;
}

export interface ImessageSendAlertContext {
  orgId?: string | null;
  threadId?: string | null;
  spaceId?: string | null;
}

interface CachedSpectrumApp {
  credHash: string;
  app: Promise<ImessageSpectrumApp>;
}

let platformApp: CachedSpectrumApp | null = null;

export class SpectrumIntegrationConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpectrumIntegrationConfigError';
  }
}

function isSpectrumTransportError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === 'ConnectionError' || error.name === 'IMessageError') return true;
  const message = error.message;
  return message.includes('ECONNRESET')
    || message.includes('UNAVAILABLE')
    || message.includes('Channel has been shut down');
}

async function loadImessageSpace(spaceId: string): Promise<ImessageSendTarget> {
  const app = await getPlatformSpectrumApp();
  return imessage(app).space.get(spaceId);
}

function invalidatePlatformSpectrumApp(): void {
  const stale = platformApp;
  platformApp = null;
  if (stale) {
    void stale.app.then((app) => app.stop()).catch(() => {});
  }
}

// Photon inbound webhooks can arrive on a stale gRPC channel (ECONNRESET on the
// first reply). Reconnect the cached Spectrum app once before surfacing failure.
// Invalidation stops the stale app in the background so an in-flight webhook
// space is not synchronously torn down before the retry loads a fresh space.
function recordImessageSendFailure(error: unknown, alertContext?: ImessageSendAlertContext): void {
  recordProviderSendFailureInBackground('imessage', 'operator_notify', alertContext?.orgId ?? null, {
    threadId: alertContext?.threadId ?? null,
    detail: error instanceof Error ? error.message : String(error),
    extra: { spaceId: alertContext?.spaceId ?? null },
  });
}

export async function sendImessageOnSpace(
  space: ImessageSendTarget,
  text: string,
  alertContext?: ImessageSendAlertContext,
): Promise<void> {
  const contextWithSpace: ImessageSendAlertContext = {
    ...alertContext,
    spaceId: alertContext?.spaceId ?? space.id,
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await space.send(text);
      return;
    } catch (error) {
      if (attempt === 0 && isSpectrumTransportError(error)) {
        logger.warn({ err: error, spaceId: space.id }, '[Spectrum] Send failed — reconnecting and retrying once');
        invalidatePlatformSpectrumApp();
        space = await loadImessageSpace(space.id);
        continue;
      }
      logger.warn(
        {
          err: error,
          spaceId: space.id,
          ...(alertContext?.orgId ? { organizationId: alertContext.orgId } : {}),
        },
        '[Spectrum] iMessage send failed',
      );
      recordImessageSendFailure(error, contextWithSpace);
      throw error;
    }
  }
}

// Rebuild the cached app whenever the credentials change (e.g. a Railway env
// rotation between deploys) instead of holding a connection open against revoked
// secrets.
function credentialHash(credentials: SpectrumConfig): string {
  return createHash('sha256')
    .update(`${credentials.projectId} ${credentials.projectSecret} ${credentials.webhookSecret}`)
    .digest('hex');
}

// The single platform-wide Spectrum app. Cloud mode wants a long-lived process,
// and the gateway is that process, so one cached app serves webhook verification,
// attachment rehydration, and outbound for every org.
export function getPlatformSpectrumApp(): Promise<ImessageSpectrumApp> {
  const credentials = getSpectrumConfig();
  if (!credentials) {
    throw new SpectrumIntegrationConfigError(
      'iMessage is not configured: set SPECTRUM_PROJECT_ID, SPECTRUM_PROJECT_SECRET, and SPECTRUM_WEBHOOK_SECRET',
    );
  }

  const credHash = credentialHash(credentials);
  if (platformApp && platformApp.credHash === credHash) return platformApp.app;

  // Credentials rotated since this app was built — tear down the stale app.
  if (platformApp) {
    void platformApp.app.then((app) => app.stop()).catch(() => {});
  }

  const appPromise = Spectrum({
    projectId: credentials.projectId,
    projectSecret: credentials.projectSecret,
    webhookSecret: credentials.webhookSecret,
    providers: [imessage.config()],
  }).catch((error) => {
    if (platformApp?.app === appPromise) {
      platformApp = null;
    }
    throw error;
  });

  platformApp = { credHash, app: appPromise };
  return appPromise;
}

// Graceful shutdown: stop the cached Spectrum app so its connection is torn down
// cleanly on redeploy instead of leaking until the process is killed.
export async function stopAllSpectrumApps(): Promise<void> {
  const cached = platformApp;
  platformApp = null;
  if (!cached) return;
  await cached.app.then((app) => app.stop()).catch(() => {});
}

export function clearSpectrumAppCache(): void {
  platformApp = null;
}

export function isImessageConfigured(): boolean {
  return getSpectrumConfig() !== null;
}

// Proactive operator send: reach a space persisted from an earlier inbound
// event (`OrgMemberImessageBinding.spaceId`) without a webhook reply in hand.
export async function sendImessageToSpace(
  spaceId: string,
  text: string,
  alertContext?: ImessageSendAlertContext,
): Promise<void> {
  const contextWithSpace: ImessageSendAlertContext = { ...alertContext, spaceId };
  let space: ImessageSendTarget;
  try {
    space = await loadImessageSpace(spaceId);
  } catch (error) {
    logger.warn(
      {
        err: error,
        spaceId,
        ...(alertContext?.orgId ? { organizationId: alertContext.orgId } : {}),
      },
      '[Spectrum] iMessage space load failed',
    );
    recordImessageSendFailure(error, contextWithSpace);
    throw error;
  }
  await sendImessageOnSpace(space, text, contextWithSpace);
}
