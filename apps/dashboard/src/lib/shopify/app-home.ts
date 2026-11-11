import { db } from '@shopkeeper/db';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import { shopifyTokenColumns, withShopifyTokenLock } from '@shopkeeper/agent/shopify/access';
import { isSimulatedShopifyIntegration } from '@shopkeeper/agent/shopify/integration-health';
import { shopifyPermissionRows, type ShopifyPermissionRow } from '@/lib/integrations/shopify-permissions';
import logger from '@/lib/server/logger';
import { getHomeChannelState } from '@/lib/server/home-summary';
import { getHomeSummaryWindows, loadHomeMetricRows } from '@/lib/server/home-summary-queries';
import {
  isShopifyIntegrationOperational,
  missingShopifyScopes,
  recordedShopifyScopes,
} from '@/lib/server/shopify-integration';
import type { ChatConfigurationResponse } from '@/lib/storefront-chat/configuration';
import { isStorefrontChatGloballyEnabled } from '@/lib/storefront-chat/enabled';
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

/** The dashboard's setup steps that still matter once the store is connected. */
interface ShopifyAppHomeSetup {
  customerChannel: boolean;
  phone: boolean;
  /** Website chat exists only where the platform switch is on. */
  chatAvailable: boolean;
}

/**
 * What the merchant changes in Shopkeeper itself, in a new tab: the page loads
 * it again when they come back.
 */
export interface ShopifyAppHomeSummary {
  /** `lost`: no working token. `missing_scopes`: works, but short of what the tools need. */
  access: 'ok' | 'missing_scopes' | 'lost';
  /** Null when the counts could not be loaded; the page still renders. */
  metrics: ShopifyAppHomeMetrics | null;
  /** Null when it could not be loaded; the checklist is left out. */
  setup: ShopifyAppHomeSetup | null;
  /** Read-only here: what the agent may do is changed by a workspace admin in Shopkeeper. */
  permissions: ShopifyPermissionRow[];
}

export type ShopifyAppHomeState =
  | { kind: 'unlinked'; shop: string }
  | (ShopifyAppHomeSummary & {
    kind: 'linked';
    shop: string;
    chat: ChatConfigurationResponse;
    chatDraftKey: string;
    themeEditorUrl: string;
  });

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
      refreshToken: true,
      tokenExpiresAt: true,
      externalAccountId: true,
      metadata: true,
      fromEmail: true,
      organization: { select: { name: true, settings: true } },
    },
  });
}

function needsGrantRefresh(integration: LinkedIntegration): boolean {
  if (isSimulatedShopifyIntegration(integration.metadata)) return false;
  if (!isShopifyIntegrationOperational(integration)) return true;
  // A non-expiring token, from before expiring tokens: opening the app swaps it.
  if (!integration.refreshToken) return true;
  const recorded = recordedShopifyScopes(integration.metadata);
  return recorded === null || missingShopifyScopes(recorded).length > 0;
}

/**
 * Managed installation grants scopes inside Shopify admin, and a token keeps the
 * grant it was issued with. Opening the app is when a merchant has just approved
 * new scopes, or can repair a token Shopify stopped accepting, so a short, dead
 * or non-expiring grant is re-issued here from the admin's ID token. A failure
 * leaves the row as it was; the page then shows the reconnect path.
 */
async function refreshGrant(
  integration: LinkedIntegration,
  shop: string,
  idToken: string,
  config: ShopifyAppConfig,
): Promise<LinkedIntegration> {
  try {
    // The new token retires one a refresh may be fetching for this store, so
    // the exchange and the save happen under the store's lock.
    const reissued = await withShopifyTokenLock(shop, async (tx) => {
      const result = await exchangeShopifyAccessToken({
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        shopDomain: shop,
        idToken,
      });
      if (!result.ok) return false;

      const metadata = mergeShopifyOAuthScopes(integration.metadata, result.token.scopes);
      // Only an active connection: a disconnect in flight must not be revived by
      // someone opening the app.
      const updated = await tx.integration.updateMany({
        where: { id: integration.id, organizationId: integration.organizationId, lifecycleStatus: 'active' },
        data: {
          ...shopifyTokenColumns(result.token),
          ...(metadata !== undefined && { metadata }),
        },
      });
      return updated.count > 0;
    });
    if (!reissued) return integration;

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

async function loadSetup(organizationId: string): Promise<ShopifyAppHomeSetup | null> {
  try {
    const [channels, phones] = await Promise.all([
      getHomeChannelState(organizationId, null),
      // Any member's phone: approvals reach whoever linked one.
      db.orgMemberImessageBinding.count({ where: { orgMember: { organizationId } } }),
    ]);
    return {
      customerChannel: channels.hasInstagram || channels.hasEmailForwarding,
      phone: phones > 0,
      chatAvailable: isStorefrontChatGloballyEnabled(),
    };
  } catch (error) {
    logger.error({ err: error, orgId: organizationId }, '[Shopify app home] Failed to load setup');
    return null;
  }
}

async function loadSummary(integration: LinkedIntegration): Promise<ShopifyAppHomeSummary> {
  const recorded = recordedShopifyScopes(integration.metadata);
  const access = !isShopifyIntegrationOperational(integration)
    ? 'lost'
    : recorded !== null && missingShopifyScopes(recorded).length > 0
      ? 'missing_scopes'
      : 'ok';
  const [metrics, setup] = await Promise.all([
    loadMetrics(integration.organizationId),
    loadSetup(integration.organizationId),
  ]);
  return {
    access,
    metrics,
    setup,
    permissions: shopifyPermissionRows(resolveAgentSettings(integration.organization.settings)),
  };
}

/** The summary alone, for an open page; null once the shop is no longer connected. */
export async function loadShopifyAppHomeSummary(shop: string): Promise<ShopifyAppHomeSummary | null> {
  const integration = await findLinkedIntegration(shop);
  return integration ? loadSummary(integration) : null;
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
  return {
    kind: 'linked',
    shop,
    ...await loadSummary(integration),
    chat: chatConfigurationFromIntegration(integration, integration.organization.name),
    chatDraftKey: `shopkeeper:chat-draft:${integration.organizationId}:${integration.id}`,
    themeEditorUrl: buildShopifyThemeEditorAppEmbedUrl(shop, config.clientId),
  };
}
