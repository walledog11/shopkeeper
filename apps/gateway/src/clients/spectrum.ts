import { createHash } from 'node:crypto';
import { recordStepTiming } from '@shopkeeper/agent/step-timings';
import { attachment, Spectrum, type ContentInput, type SpectrumInstance } from 'spectrum-ts';
import { imessage } from 'spectrum-ts/providers/imessage';
import { getSpectrumConfig, type SpectrumConfig } from '../config/runtime-config.js';
import logger from '../logger.js';
import { recordProviderSendFailureInBackground } from '../provider-send-alerts.js';
import { isGatewayShutdownListener } from '../shutdown-signals.js';

type ImessageProviderConfig = ReturnType<typeof imessage.config>;

// Matches the Telegram presence refresh cadence (`presence.ts`).
const TYPING_REFRESH_MS = 4000;

export type ImessageSpectrumApp = SpectrumInstance<[ImessageProviderConfig]>;

export interface ImessageSendTarget {
  id: string;
  send: (...content: ContentInput[]) => Promise<unknown>;
}

export interface ImessageImage {
  data: Buffer;
  mediaType: string;
  name: string;
}

export interface ImessageSendAlertContext {
  orgId?: string | null;
  threadId?: string | null;
  spaceId?: string | null;
}

interface CachedSpectrumApp {
  credHash: string;
  app: Promise<ImessageSpectrumApp>;
  ready: boolean;
}

type ShutdownSignal = 'SIGINT' | 'SIGTERM';
const SHUTDOWN_SIGNALS: readonly ShutdownSignal[] = ['SIGINT', 'SIGTERM'];
type SignalListeners = Record<ShutdownSignal, NodeJS.SignalsListener[]>;

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

async function loadImessageSpaceHandle(spaceId: string) {
  const app = await getPlatformSpectrumApp();
  return imessage(app).space.get(spaceId);
}

async function loadImessageSpace(spaceId: string): Promise<ImessageSendTarget> {
  return loadImessageSpaceHandle(spaceId);
}

// iMessage shows a real "…" bubble the moment this fires, which is the only
// instant acknowledgement the channel has — Telegram's 👀 reaction and chat
// action have no iMessage equivalent. Best-effort throughout: a merchant whose
// typing indicator fails must still get their answer, so every failure here is
// swallowed and the caller's work runs regardless.
export async function withImessageTyping<T>(
  spaceId: string,
  work: () => Promise<T>,
): Promise<T> {
  let space: Awaited<ReturnType<typeof loadImessageSpaceHandle>>;
  try {
    space = await loadImessageSpaceHandle(spaceId);
  } catch (error) {
    logger.debug({ err: error, spaceId }, '[Spectrum] Typing indicator space load failed');
    return work();
  }

  // try/catch, not just .catch(): a synchronous throw here (missing method on an
  // older provider build) would otherwise escape and fail the whole turn over a
  // cosmetic signal.
  const startTyping = () => {
    try {
      void space.startTyping().catch((error: unknown) => {
        logger.debug({ err: error, spaceId }, '[Spectrum] Typing indicator failed');
      });
    } catch (error) {
      logger.debug({ err: error, spaceId }, '[Spectrum] Typing indicator unavailable');
    }
  };

  // iMessage expires the indicator on its own, so refresh it for turns that
  // outlast one interval rather than letting the bubble vanish mid-thought.
  startTyping();
  const refresh = setInterval(startTyping, TYPING_REFRESH_MS);

  try {
    return await work();
  } finally {
    clearInterval(refresh);
    try {
      void space.stopTyping().catch((error: unknown) => {
        logger.debug({ err: error, spaceId }, '[Spectrum] Stopping typing indicator failed');
      });
    } catch (error) {
      logger.debug({ err: error, spaceId }, '[Spectrum] Stopping typing indicator unavailable');
    }
  }
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
  images: readonly ImessageImage[] = [],
): Promise<void> {
  const contextWithSpace: ImessageSendAlertContext = {
    ...alertContext,
    spaceId: alertContext?.spaceId ?? space.id,
  };
  // Images first, so the text — which ends with the question — is the last
  // bubble the merchant reads.
  const content: ContentInput[] = [
    ...images.map((image) => attachment(image.data, { mimeType: image.mediaType, name: image.name })),
    text,
  ];

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await space.send(...content);
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

function signalListeners(): SignalListeners {
  return { SIGINT: process.listeners('SIGINT'), SIGTERM: process.listeners('SIGTERM') };
}

// Spectrum() adds SIGINT and SIGTERM handlers that exit the process as soon as
// Spectrum has stopped itself, which cuts the gateway's own shutdown short: the
// worker waits for in-flight jobs and the server for open requests. Both stop
// this app at the end of that shutdown (stopAllSpectrumApps), so the handlers
// added while it was being built are removed, except the gateway's own: a worker
// can take a job, and build this app, before it registers them.
function removeSignalListenersAddedSince(before: SignalListeners): void {
  for (const signal of SHUTDOWN_SIGNALS) {
    for (const listener of process.listeners(signal)) {
      if (before[signal].includes(listener) || isGatewayShutdownListener(listener)) continue;
      process.off(signal, listener);
    }
  }
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

  const listenersBefore = signalListeners();
  const appPromise = Spectrum({
    projectId: credentials.projectId,
    projectSecret: credentials.projectSecret,
    webhookSecret: credentials.webhookSecret,
    providers: [imessage.config()],
  }).then(
    (app) => {
      removeSignalListenersAddedSince(listenersBefore);
      if (platformApp?.app === appPromise) platformApp.ready = true;
      return app;
    },
    (error: unknown) => {
      removeSignalListenersAddedSince(listenersBefore);
      if (platformApp?.app === appPromise) {
        platformApp = null;
      }
      throw error;
    },
  );

  platformApp = { credHash, app: appPromise, ready: false };
  return appPromise;
}

function isPlatformSpectrumAppReady(): boolean {
  const credentials = getSpectrumConfig();
  return credentials !== null
    && platformApp?.credHash === credentialHash(credentials)
    && platformApp.ready;
}

// Builds the app when the process starts, so the first iMessage after a deploy
// does not wait for Photon's project and token calls. In production (2026-11),
// cards that had to build the app took 6–7s to send; cards on a built app took
// 0.4–2s.
export function warmPlatformSpectrumApp(): void {
  if (!isImessageConfigured()) return;
  const startedAt = Date.now();
  getPlatformSpectrumApp().then(
    () => logger.info({ durationMs: Date.now() - startedAt }, '[Spectrum] App ready'),
    (error: unknown) => logger.warn({ err: error }, '[Spectrum] App build at startup failed; the first send builds it'),
  );
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
  images: readonly ImessageImage[] = [],
): Promise<void> {
  const contextWithSpace: ImessageSendAlertContext = { ...alertContext, spaceId };
  const setupStartedAt = isPlatformSpectrumAppReady() ? null : new Date();
  let space: ImessageSendTarget;
  try {
    space = await loadImessageSpace(spaceId);
    if (setupStartedAt && alertContext?.orgId) {
      void recordStepTiming({
        organizationId: alertContext.orgId,
        threadId: alertContext.threadId ?? null,
        step: 'imessage_setup',
        startedAt: setupStartedAt,
        durationMs: Date.now() - setupStartedAt.getTime(),
      });
    }
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
  await sendImessageOnSpace(space, text, contextWithSpace, images);
}
