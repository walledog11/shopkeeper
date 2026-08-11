import type { Integration } from '@prisma/client';
import { ServiceUnavailableError } from '@/lib/api/errors';
import { stopGmailWatchIfUnused } from './gmail-watch';
import { unsubscribeInstagramBeforeDisconnect } from './instagram-disconnect';

export async function cleanupIntegrationProvider(integration: Integration): Promise<void> {
  const gmail = await stopGmailWatchIfUnused(integration);
  if (!gmail.ok) {
    throw new ServiceUnavailableError(`Gmail cleanup failed: ${gmail.category}`);
  }

  const instagram = await unsubscribeInstagramBeforeDisconnect(integration);
  if (!instagram.ok) {
    throw new ServiceUnavailableError(`Instagram cleanup failed: ${instagram.reason}`);
  }
}
