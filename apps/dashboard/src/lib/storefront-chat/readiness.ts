import { db } from '@shopkeeper/db';
import { getShopifyConnectionState, recordedShopifyScopes, grantCoversScopes } from '@shopkeeper/agent/shopify/integration-health';
import { resolveEmailIntegration } from '@shopkeeper/email/integration-resolution';
import { getEmailProvider } from '@shopkeeper/email/providers';
import { EmailNotConfiguredError } from '@shopkeeper/email/types';
import { getGatewayBaseUrl } from '@/lib/server/gateway-url';
import { isStorefrontChatGloballyEnabled } from './enabled';

function isStorefrontChatServiceConfigured(): boolean {
  try {
    return Boolean(
      process.env.SHOPIFY_APP_SECRET?.trim()
      && (process.env.STOREFRONT_CHAT_SIGNING_SECRET?.trim().length ?? 0) >= 32
      && process.env.INTERNAL_API_SECRET?.trim()
      && (process.env.NODE_ENV !== 'production' || (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN))
      && getGatewayBaseUrl(),
    );
  } catch {
    return false;
  }
}

export async function getStorefrontChatReadiness(organizationId: string) {
  const [integration, operatorBindings, lastSession] = await Promise.all([
    db.integration.findFirst({ where: { organizationId, platform: 'shopify', lifecycleStatus: 'active' } }),
    db.orgMemberImessageBinding.count({ where: { orgMember: { organizationId } } }),
    db.storefrontChatSession.findFirst({
      where: { organizationId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: 'desc' },
      select: { lastSeenAt: true },
    }),
  ]);
  const service = isStorefrontChatGloballyEnabled() && isStorefrontChatServiceConfigured();
  const shopify = Boolean(integration && getShopifyConnectionState(integration) === 'active');
  const scopes = recordedShopifyScopes(integration?.metadata);
  const permissions = scopes !== null && grantCoversScopes(scopes, ['write_app_proxy', 'read_products', 'read_orders']);
  let email = false;
  try {
    const sender = await resolveEmailIntegration({ organizationId, purpose: 'proactive' });
    email = getEmailProvider(sender) === 'gmail'
      ? Boolean(sender.refreshToken && sender.accessToken && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
        && (!sender.tokenExpiresAt || sender.tokenExpiresAt.getTime() > 0))
      : Boolean(process.env.POSTMARK_API_KEY);
  } catch (error) {
    if (!(error instanceof EmailNotConfiguredError)) throw error;
  }
  return {
    canEnable: service && shopify && permissions,
    checks: [
      { id: 'service', ready: service, detail: service ? 'Chat service configured' : 'Chat service setup is incomplete. Contact your workspace administrator.' },
      { id: 'shopify', ready: shopify && permissions, detail: shopify && permissions ? 'Shopify connection and chat permissions configured' : 'Reconnect Shopify to confirm the permissions needed for chat.' },
      { id: 'email', ready: email, detail: email ? 'Order verification email configured — test code delivery before launch.' : 'Connect and choose a default email account to let shoppers verify orders.' },
      { id: 'operator', ready: operatorBindings > 0, detail: operatorBindings > 0 ? 'Merchant messaging connected — test a handoff before launch.' : 'Connect iMessage for handoff notifications, or monitor conversations in Shopkeeper.' },
    ],
    lastConnectedAt: lastSession?.lastSeenAt.toISOString() ?? null,
  };
}
