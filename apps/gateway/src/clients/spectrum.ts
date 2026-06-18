import { db, ChannelType, type DbChannelType } from '@shopkeeper/db';
import { Spectrum, type SpectrumInstance } from 'spectrum-ts';
import { imessage } from 'spectrum-ts/providers/imessage';

type ImessageProviderConfig = ReturnType<typeof imessage.config>;

export type ImessageSpectrumApp = SpectrumInstance<[ImessageProviderConfig]>;

export interface SpectrumIntegration {
  id: string;
  organizationId: string;
  platform: DbChannelType | string;
  externalAccountId: string;
  accessToken: string | null;
  refreshToken: string | null;
}

interface SpectrumCredentials {
  projectId: string;
  projectSecret: string;
  webhookSecret: string;
}

const spectrumAppsByIntegration = new Map<string, Promise<ImessageSpectrumApp>>();

export class SpectrumIntegrationConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpectrumIntegrationConfigError';
  }
}

function cacheKey(integration: Pick<SpectrumIntegration, 'organizationId' | 'id'>): string {
  return `${integration.organizationId}:${integration.id}`;
}

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function readSpectrumCredentials(integration: SpectrumIntegration): SpectrumCredentials {
  if (integration.platform !== ChannelType.imessage) {
    throw new SpectrumIntegrationConfigError(
      `Integration ${integration.id} is ${integration.platform}, not ${ChannelType.imessage}`,
    );
  }

  const projectId = nonEmpty(integration.externalAccountId);
  const projectSecret = nonEmpty(integration.accessToken);
  const webhookSecret = nonEmpty(integration.refreshToken);

  const missing: string[] = [];
  if (!projectId) missing.push('externalAccountId');
  if (!projectSecret) missing.push('accessToken');
  if (!webhookSecret) missing.push('refreshToken');

  if (!projectId || !projectSecret || !webhookSecret) {
    throw new SpectrumIntegrationConfigError(
      `Integration ${integration.id} is missing Spectrum credential field(s): ${missing.join(', ')}`,
    );
  }

  return { projectId, projectSecret, webhookSecret };
}

export function getSpectrumAppForIntegration(integration: SpectrumIntegration): Promise<ImessageSpectrumApp> {
  const credentials = readSpectrumCredentials(integration);
  const key = cacheKey(integration);
  const cached = spectrumAppsByIntegration.get(key);
  if (cached) return cached;

  const appPromise = Spectrum({
    projectId: credentials.projectId,
    projectSecret: credentials.projectSecret,
    webhookSecret: credentials.webhookSecret,
    providers: [imessage.config()],
  }).catch((error) => {
    if (spectrumAppsByIntegration.get(key) === appPromise) {
      spectrumAppsByIntegration.delete(key);
    }
    throw error;
  });

  spectrumAppsByIntegration.set(key, appPromise);
  return appPromise;
}

export async function getSpectrumAppForIntegrationId(integrationId: string): Promise<ImessageSpectrumApp> {
  const integration = await db.integration.findUnique({
    where: { id: integrationId },
    select: {
      id: true,
      organizationId: true,
      platform: true,
      externalAccountId: true,
      accessToken: true,
      refreshToken: true,
    },
  });

  if (!integration) {
    throw new SpectrumIntegrationConfigError(`iMessage integration not found: ${integrationId}`);
  }

  return getSpectrumAppForIntegration(integration);
}

export async function getSpectrumAppForOrganization(organizationId: string): Promise<ImessageSpectrumApp> {
  const integration = await db.integration.findFirst({
    where: { organizationId, platform: ChannelType.imessage },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      organizationId: true,
      platform: true,
      externalAccountId: true,
      accessToken: true,
      refreshToken: true,
    },
  });

  if (!integration) {
    throw new SpectrumIntegrationConfigError(`No iMessage integration configured for organization ${organizationId}`);
  }

  return getSpectrumAppForIntegration(integration);
}

export function clearSpectrumAppCache(integration?: Pick<SpectrumIntegration, 'organizationId' | 'id'>): void {
  if (integration) {
    spectrumAppsByIntegration.delete(cacheKey(integration));
    return;
  }
  spectrumAppsByIntegration.clear();
}
