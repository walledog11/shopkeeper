import {
  unsubscribeInstagramMessages,
  type InstagramProviderError,
} from '@/lib/integrations/instagram-api-client';
import logger from '@/lib/server/logger';
import { emitOpsAlert } from '@/lib/server/ops-alerts';

interface InstagramDisconnectIntegration {
  accessToken: string | null;
  externalAccountId: string;
  id: string;
  metadata: unknown;
  organizationId: string;
  platform: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInstagramLoginIntegration(integration: InstagramDisconnectIntegration): boolean {
  return integration.platform === 'ig_dm'
    && isRecord(integration.metadata)
    && isRecord(integration.metadata.instagram)
    && integration.metadata.instagram.authModel === 'instagram_login';
}

function recordCleanupWarning(
  integration: InstagramDisconnectIntegration,
  error: InstagramProviderError | null,
  reason: 'missing_access_token' | 'provider_unsubscribe_failed' | 'unexpected_failure',
): void {
  const diagnostics = {
    accountId: integration.externalAccountId,
    category: error?.category ?? null,
    code: error?.code ?? null,
    httpStatus: error?.httpStatus ?? 0,
    integrationId: integration.id,
    manualCleanupRequired: true,
    organizationId: integration.organizationId,
    reason,
    requestId: error?.requestId ?? null,
    subcode: error?.subcode ?? null,
  };

  logger.warn(diagnostics, '[Instagram Disconnect] Provider unsubscribe cleanup required');
  try {
    emitOpsAlert({
      category: 'provider_cleanup',
      message: 'Instagram webhook unsubscribe failed during disconnect',
      level: 'warning',
      tags: { channel: 'ig_dm', provider: 'meta' },
      extra: diagnostics,
      fingerprint: [
        'ops-alert',
        'provider_cleanup',
        'dashboard',
        'instagram_unsubscribe',
        integration.id,
      ],
    });
  } catch (alertError) {
    logger.error(
      { err: alertError, integrationId: integration.id },
      '[Instagram Disconnect] Failed to emit provider cleanup alert',
    );
  }
}

export async function unsubscribeInstagramBeforeDisconnect(
  integration: InstagramDisconnectIntegration,
): Promise<void> {
  if (!isInstagramLoginIntegration(integration)) return;
  if (!integration.accessToken) {
    recordCleanupWarning(integration, null, 'missing_access_token');
    return;
  }

  try {
    const result = await unsubscribeInstagramMessages({
      accessToken: integration.accessToken,
      accountId: integration.externalAccountId,
    });
    if (!result.ok) {
      recordCleanupWarning(integration, result.error, 'provider_unsubscribe_failed');
    }
  } catch {
    recordCleanupWarning(integration, null, 'unexpected_failure');
  }
}
