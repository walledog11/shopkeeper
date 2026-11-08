import type { Integration } from '@prisma/client';
import { ServiceUnavailableError } from '@/lib/api/errors';
import { stopGmailWatchIfUnused } from './gmail-watch';
import { unsubscribeInstagramBeforeDisconnect } from './instagram-disconnect';
import { revokeSocialApiAccountBeforeDisconnect } from './socialapi-disconnect';

/**
 * Removes what Shopkeeper holds at the provider before the integration row goes.
 *
 * A grant the merchant already revoked leaves nothing to remove it with, and
 * retrying cannot change that, so it counts as cleaned. A Gmail watch then lapses
 * within seven days, and its pings for a mailbox Shopkeeper no longer has are
 * acknowledged and dropped. A Meta subscription without a working token can only
 * be removed from the merchant's side; the Instagram cleanup warning still reaches ops.
 */
export async function cleanupIntegrationProvider(integration: Integration): Promise<void> {
  const gmail = await stopGmailWatchIfUnused(integration);
  if (!gmail.ok && gmail.category !== 'watch_authentication') {
    throw new ServiceUnavailableError(`Gmail cleanup failed: ${gmail.category}`);
  }

  const instagram = await unsubscribeInstagramBeforeDisconnect(integration);
  if (
    !instagram.ok
    && instagram.reason !== 'missing_access_token'
    && instagram.error?.category !== 'authentication'
  ) {
    throw new ServiceUnavailableError(`Instagram cleanup failed: ${instagram.reason}`);
  }

  const socialApi = await revokeSocialApiAccountBeforeDisconnect(integration);
  if (!socialApi.ok) {
    const category = socialApi.error ? ` (${socialApi.error.category})` : '';
    throw new ServiceUnavailableError(`SocialAPI cleanup failed: ${socialApi.reason}${category}`);
  }
}
