import { isRecord } from './guards.js';
import { getEmailProvider, getGmailInboundStatus } from './providers.js';

export type EmailInboundTransportLabel = 'gmail_watch' | 'postmark_forward';

/** Whether this Gmail row may ingest via Pub/Sub/history (ignores global env flags). */
export function isGmailWatchReceivingConfigured(integration: {
  emailProvider?: 'gmail' | 'postmark' | null;
  metadata?: unknown | null;
  lifecycleStatus?: string;
}): boolean {
  if (integration.lifecycleStatus && integration.lifecycleStatus !== 'active') return false;
  if (getEmailProvider(integration) !== 'gmail') return false;
  if (isRecord(integration.metadata) && integration.metadata.inboundMode === 'postmark') {
    return false;
  }
  const status = getGmailInboundStatus(integration);
  return status === 'active' || status === 'degraded';
}

export function findEmailIntegrations<T extends {
  emailProvider?: 'gmail' | 'postmark' | null;
  metadata?: unknown | null;
}>(integrations: readonly T[]): { gmail: T | null; postmark: T | null } {
  let gmail: T | null = null;
  let postmark: T | null = null;
  for (const integration of integrations) {
    const provider = getEmailProvider(integration);
    if (provider === 'gmail') gmail = integration;
    else if (provider === 'postmark') postmark = integration;
  }
  return { gmail, postmark };
}

export interface EmailInboundPathAssessment {
  hasGmailConnection: boolean;
  hasPostmarkConnection: boolean;
  gmailWatchReceiving: boolean;
  /** Both paths could ingest the same mailbox (native Gmail sync + active Postmark row). */
  dualDeliveryRisk: boolean;
}

export function assessEmailInboundPaths(
  integrations: readonly {
    emailProvider?: 'gmail' | 'postmark' | null;
    metadata?: unknown | null;
    lifecycleStatus?: string;
  }[],
): EmailInboundPathAssessment {
  const { gmail, postmark } = findEmailIntegrations(integrations);
  const gmailActive = !gmail?.lifecycleStatus || gmail.lifecycleStatus === 'active';
  const postmarkActive = !postmark?.lifecycleStatus || postmark.lifecycleStatus === 'active';
  const gmailWatchReceiving = Boolean(
    gmail
    && gmailActive
    && isGmailWatchReceivingConfigured(gmail),
  );

  return {
    hasGmailConnection: Boolean(gmail && gmailActive),
    hasPostmarkConnection: Boolean(postmark && postmarkActive),
    gmailWatchReceiving,
    dualDeliveryRisk: gmailWatchReceiving && Boolean(postmark && postmarkActive),
  };
}
