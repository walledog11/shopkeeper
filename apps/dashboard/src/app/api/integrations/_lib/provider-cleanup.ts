import type { Integration } from '@prisma/client';
import { ServiceUnavailableError } from '@/lib/api/errors';
import { stopGmailWatchIfUnused } from './gmail-watch';
import { unsubscribeInstagramBeforeDisconnect } from './instagram-disconnect';
import { revokeSocialApiAccountBeforeDisconnect } from './socialapi-disconnect';

export async function cleanupIntegrationProvider(integration: Integration): Promise<void> {
  const gmail = await stopGmailWatchIfUnused(integration);
  if (!gmail.ok) {
    throw new ServiceUnavailableError(`Gmail cleanup failed: ${gmail.category}`);
  }

  const instagram = await unsubscribeInstagramBeforeDisconnect(integration);
  if (!instagram.ok) {
    throw new ServiceUnavailableError(`Instagram cleanup failed: ${instagram.reason}`);
  }

  const socialApi = await revokeSocialApiAccountBeforeDisconnect(integration);
  if (!socialApi.ok) {
    const category = socialApi.error ? ` (${socialApi.error.category})` : '';
    throw new ServiceUnavailableError(`SocialAPI cleanup failed: ${socialApi.reason}${category}`);
  }
}
