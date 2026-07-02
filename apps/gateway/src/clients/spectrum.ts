import { createHash } from 'node:crypto';
import { Spectrum, type SpectrumInstance } from 'spectrum-ts';
import { imessage } from 'spectrum-ts/providers/imessage';
import { getSpectrumConfig, type SpectrumConfig } from '../config/runtime-config.js';

type ImessageProviderConfig = ReturnType<typeof imessage.config>;

export type ImessageSpectrumApp = SpectrumInstance<[ImessageProviderConfig]>;

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

export function clearSpectrumAppCache(): void {
  platformApp = null;
}

export function isImessageConfigured(): boolean {
  return getSpectrumConfig() !== null;
}

// Proactive operator send: reach a space persisted from an earlier inbound
// event (`OrgMemberImessageBinding.spaceId`) without a webhook reply in hand.
export async function sendImessageToSpace(spaceId: string, text: string): Promise<void> {
  const app = await getPlatformSpectrumApp();
  const space = await imessage(app).space.get(spaceId);
  await space.send(text);
}

// Graceful shutdown: stop the cached Spectrum app so its connection is torn down
// cleanly on redeploy instead of leaking until the process is killed.
export async function stopAllSpectrumApps(): Promise<void> {
  const cached = platformApp;
  platformApp = null;
  if (!cached) return;
  await cached.app.then((app) => app.stop()).catch(() => {});
}
