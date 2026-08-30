import { db } from './client.js';

/**
 * `tokenExpiresAt = 0` is how an integration records "the grant is dead, the
 * merchant has to reconnect". It is not an expiry: an access token that merely
 * expired refreshes silently and is not worth telling anyone about. Only a
 * refused refresh earns the sentinel, which is why an ordinary past date must
 * never be written here.
 *
 * Read back by `getEmailAuthReauthorizationReason` (which decodes it separately
 * because it is imported by dashboard client components and so cannot import
 * this module) and by `emailReplyBlock`, which refuses to plan an email reply
 * the integration cannot send.
 */
export const INTEGRATION_REAUTH_SENTINEL = new Date(0);

export function isIntegrationReauthorizationRequired(
  tokenExpiresAt: Date | null | undefined,
): boolean {
  return tokenExpiresAt !== null
    && tokenExpiresAt !== undefined
    && tokenExpiresAt.getTime() <= 0;
}

/**
 * Flag an integration as needing reconnection. Callers must classify first:
 * only a definite refusal from the provider belongs here. A network blip or a
 * 5xx is transient, and flagging one tells the merchant to reconnect a
 * connection that is fine.
 */
export async function markIntegrationReauthorizationRequired(
  integrationId: string,
): Promise<void> {
  await db.integration.update({
    where: { id: integrationId },
    data: { tokenExpiresAt: INTEGRATION_REAUTH_SENTINEL },
  });
}
