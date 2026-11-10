import { db } from '@shopkeeper/db';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import { shopifyPermissionRows, type ShopifyPermissionRow } from '@/lib/integrations/shopify-permissions';
import logger from '@/lib/server/logger';
import { getHomeSummaryWindows, loadHomeMetricRows } from '@/lib/server/home-summary-queries';
import {
  isShopifyIntegrationOperational,
  missingShopifyScopes,
  recordedShopifyScopes,
} from '@/lib/server/shopify-integration';
import type { ChatConfigurationResponse } from '@/lib/storefront-chat/configuration';
import { chatConfigurationFromIntegration } from '@/lib/storefront-chat/service';
import { buildShopifyThemeEditorAppEmbedUrl } from '@/lib/storefront-chat/theme-editor';
import {
  exchangeShopifyAccessToken,
  mergeShopifyOAuthScopes,
} from '@/app/api/integrations/shopify/callback/complete-shopify-oauth';

interface ShopifyAppHomeMetrics {
  needsYou: number;
  open: number;
  repliesSent24h: number;
}

export type ShopifyAppHomeState =
  | { kind: 'unlinked'; shop: string }
  | {
    kind: 'linked';
    shop: string;
    shopName: string;
    workspaceName: string;
    /** `lost`: no working token. `missing_scopes`: works, but short of what the tools need. */
    access: 'ok' | 'missing_scopes' | 'lost';
    /** Null when the counts could not be loaded; the page still renders. */
    metrics: ShopifyAppHomeMetrics | null;
    chat: ChatConfigurationResponse;
    chatDraftKey: string;
    themeEditorUrl: string;
    /** Read-only here: what the agent may do is changed by a workspace admin in Shopkeeper. */
    permissions: ShopifyPermissionRow[];
  };

interface ShopifyAppConfig {
  clientId: string;
  clientSecret: string;
}

type LinkedIntegration = NonNullable<Awaited<ReturnType<typeof findLinkedIntegration>>>;

function findLinkedIntegration(shop: string) {
  return db.integration.findFirst({
    where: {
      platform: 'shopify',
      externalAccountId: shop,
      lifecycleStatus: 'active',
      organization: { lifecycleStatus: 'active' },
    },
    select: {
      id: true,
      organizationId: true,
      accessToken: true,
      tokenExpiresAt: true,
      externalAccountId: true,
      metadata: true,
      fromEmail: true,
      organization: { select: { name: true, settings: true } },
    },
  });
}

function needsGrantRefresh(integration: LinkedIntegration): boolean {
  if (!isShopifyIntegrationOperational(integration)) return true;
  const recorded = recordedShopifyScopes(integration.metadata);
  return recorded === null || missingShopifyScopes(recorded).length > 0;
}

/**
 * Managed installation grants scopes inside Shopify admin, and a token keeps the
 * grant it was issued with. Opening the app is when a merchant has just approved
 * new scopes, or can repair a token Shopify stopped accepting, so a short or
 * dead grant is re-issued here from the admin's ID token. A failure leaves the
 * row as it was; the page then shows the reconnect path.
 */
async function refreshGrant(
  integration: LinkedIntegration,
  shop: string,
  idToken: string,
  config: ShopifyAppConfig,
): Promise<LinkedIntegration> {
  try {
    const result = await exchangeShopifyAccessToken({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      shopDomain: shop,
      idToken,
    });
    if (!result.ok) return integration;

    const metadata = mergeShopifyOAuthScopes(integration.metadata, result.oauthScopes);
    // Only an active connection: a disconnect in flight must not be revived by
    // someone opening the app.
    const updated = await db.integration.updateMany({
      where: { id: integration.id, organizationId: integration.organizationId, lifecycleStatus: 'active' },
      data: {
        accessToken: result.accessToken,
        tokenExpiresAt: null,
        ...(metadata !== undefined && { metadata }),
      },
    });
    if (updated.count === 0) return integration;

    logger.info({ shop, orgId: integration.organizationId }, '[Shopify app home] Re-issued the Shopify grant');
    return (await findLinkedIntegration(shop)) ?? integration;
  } catch (error) {
    logger.error({ err: error, shop, orgId: integration.organizationId }, '[Shopify app home] Grant refresh failed');
    return integration;
  }
}

async function loadMetrics(organizationId: string): Promise<ShopifyAppHomeMetrics | null> {
  const now = new Date();
  try {
    const [row] = await loadHomeMetricRows(organizationId, now, getHomeSummaryWindows(now));
    if (!row) return { needsYou: 0, open: 0, repliesSent24h: 0 };
    return {
      needsYou: Number(row.needs_you_count),
      open: Number(row.open_count),
      repliesSent24h: Number(row.replies_sent_24h),
    };
  } catch (error) {
    logger.error({ err: error, orgId: organizationId }, '[Shopify app home] Failed to load counts');
    return null;
  }
}

/** What the app home shows the shop a verified ID token names. */
export async function loadShopifyAppHome(
  shop: string,
  idToken: string,
  config: ShopifyAppConfig,
): Promise<ShopifyAppHomeState> {
  const found = await findLinkedIntegration(shop);
  if (!found) return { kind: 'unlinked', shop };

  const integration = needsGrantRefresh(found)
    ? await refreshGrant(found, shop, idToken, config)
    : found;
  const recorded = recordedShopifyScopes(integration.metadata);
  const access = !isShopifyIntegrationOperational(integration)
    ? 'lost'
    : recorded !== null && missingShopifyScopes(recorded).length > 0
      ? 'missing_scopes'
      : 'ok';

  return {
    kind: 'linked',
    shop,
    shopName: integration.fromEmail?.trim() || shop,
    workspaceName: integration.organization.name,
    access,
    metrics: await loadMetrics(integration.organizationId),
    chat: chatConfigurationFromIntegration(integration, integration.organization.name),
    chatDraftKey: `shopkeeper:chat-draft:${integration.organizationId}:${integration.id}`,
    themeEditorUrl: buildShopifyThemeEditorAppEmbedUrl(shop, config.clientId),
    permissions: shopifyPermissionRows(resolveAgentSettings(integration.organization.settings)),
  };
}
