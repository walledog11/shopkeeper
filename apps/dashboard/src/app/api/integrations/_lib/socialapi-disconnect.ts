import { isRecord } from '@shopkeeper/shared/guards';
import {
  createSocialApiClient,
  type SocialApiError,
} from '@shopkeeper/integrations/socialapi';
import logger from '@/lib/server/logger';
import { emitOpsAlert } from '@/lib/server/ops-alerts';

interface SocialApiDisconnectIntegration {
  id: string;
  metadata: unknown;
  organizationId: string;
  platform: string;
  providerAccountId: string | null;
}

type SocialApiCleanupFailure = 'missing_account_id' | 'missing_api_key' | 'provider_disconnect_failed';

type SocialApiCleanupResult =
  | { ok: true }
  | { ok: false; error: SocialApiError | null; reason: SocialApiCleanupFailure };

function isSocialApiIntegration(integration: SocialApiDisconnectIntegration): boolean {
  return integration.platform === 'ig_dm'
    && isRecord(integration.metadata)
    && isRecord(integration.metadata.instagram)
    && integration.metadata.instagram.transport === 'socialapi';
}

function socialApiBrandId(metadata: unknown): string | null {
  if (!isRecord(metadata) || !isRecord(metadata.instagram)) return null;
  const value = metadata.instagram.socialApiBrandId;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function recordCleanupWarning(
  integration: SocialApiDisconnectIntegration,
  error: SocialApiError | null,
  reason: SocialApiCleanupFailure,
): void {
  const diagnostics = {
    category: error?.category ?? null,
    code: error?.code ?? null,
    httpStatus: error?.httpStatus ?? 0,
    integrationId: integration.id,
    manualCleanupRequired: true,
    organizationId: integration.organizationId,
    outcomeUnknown: error?.outcomeUnknown ?? false,
    reason,
    requestId: error?.requestId ?? null,
  };

  logger.warn(diagnostics, '[SocialAPI Disconnect] Remote account revoke failed');
  try {
    emitOpsAlert({
      category: 'provider_cleanup',
      message: 'SocialAPI account revoke failed during disconnect',
      level: 'warning',
      tags: { channel: 'ig_dm', provider: 'socialapi' },
      extra: diagnostics,
      fingerprint: [
        'ops-alert',
        'provider_cleanup',
        'dashboard',
        'socialapi_disconnect',
        integration.id,
      ],
    });
  } catch (alertError) {
    logger.error(
      { err: alertError, integrationId: integration.id },
      '[SocialAPI Disconnect] Failed to emit provider cleanup alert',
    );
  }
}

/**
 * Deletes the connected account from Shopkeeper's SocialAPI workspace, so the
 * vendor stops holding the merchant's Instagram access once they disconnect.
 * The account is named by `providerAccountId`, the column ingress resolves.
 *
 * A 404 is what an earlier attempt whose success answer was lost gets back, but
 * a moved endpoint answers the same way, so it counts as done only once the
 * brand's own account listing shows the account is gone. Anything else fails
 * the cleanup: the durable disconnect retries it and records why it stopped.
 */
export async function revokeSocialApiAccountBeforeDisconnect(
  integration: SocialApiDisconnectIntegration,
): Promise<SocialApiCleanupResult> {
  if (!isSocialApiIntegration(integration)) return { ok: true };

  const accountId = integration.providerAccountId?.trim();
  if (!accountId) {
    recordCleanupWarning(integration, null, 'missing_account_id');
    return { ok: false, error: null, reason: 'missing_account_id' };
  }
  const apiKey = process.env.SOCIALAPI_API_KEY?.trim();
  if (!apiKey) {
    recordCleanupWarning(integration, null, 'missing_api_key');
    return { ok: false, error: null, reason: 'missing_api_key' };
  }

  const api = createSocialApiClient({ apiKey });
  const result = await api.disconnectInstagramAccount(accountId);
  if (result.ok) return { ok: true };
  if (result.error.httpStatus === 404) {
    const brandId = socialApiBrandId(integration.metadata);
    const listed = brandId ? await api.listInstagramAccounts(brandId) : null;
    if (listed?.ok && !listed.data.some(account => account.id === accountId)) {
      logger.info(
        { integrationId: integration.id, organizationId: integration.organizationId },
        '[SocialAPI Disconnect] Remote account already gone',
      );
      return { ok: true };
    }
  }
  recordCleanupWarning(integration, result.error, 'provider_disconnect_failed');
  return { ok: false, error: result.error, reason: 'provider_disconnect_failed' };
}
