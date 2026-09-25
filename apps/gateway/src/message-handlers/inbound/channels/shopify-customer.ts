import { db } from '@shopkeeper/db';
import { shopifyRestJson } from '@shopkeeper/agent/shopify';
import logger from '../../../logger.js';

/**
 * The name to store for an email sender, or null to keep what is stored.
 * Shopify's customer record is the source of truth: an email's display name is
 * whatever the sending account is called — a spouse's or a shared inbox — and
 * letting it win renamed a matched Shopify customer on every message.
 */
export async function resolveEmailCustomerName(params: {
  senderEmail: string;
  senderName: string | null | undefined;
  existingName: string | null | undefined;
  lookupShopifyName: () => Promise<string | null>;
}): Promise<string | null> {
  const shopifyName = await params.lookupShopifyName();
  if (shopifyName) return shopifyName;

  const emailLocal = params.senderEmail.split('@')[0];
  const existingIsPlaceholder = !params.existingName
    || params.existingName === params.senderEmail
    || params.existingName === emailLocal;
  if (!existingIsPlaceholder) return null;

  return params.senderName?.trim() || (params.existingName ? null : emailLocal);
}

export async function lookupShopifyCustomerName(organizationId: string, email: string): Promise<string | null> {
  const integration = await db.integration.findFirst({
    where: { organizationId, platform: 'shopify', lifecycleStatus: 'active' },
    select: { accessToken: true, externalAccountId: true },
  });
  if (!integration?.accessToken || !integration.externalAccountId) return null;

  try {
    const data = await shopifyRestJson<{ customers?: Array<{ first_name?: string | null; last_name?: string | null }> }>(
      { shop: integration.externalAccountId, accessToken: integration.accessToken },
      'customers/search.json',
      { query: { query: `email:${email}`, limit: 1, fields: 'first_name,last_name' } },
    );
    const c = data.customers?.[0];
    if (!c) return null;
    const name = `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim();
    return name || null;
  } catch (err) {
    logger.warn({ err, email }, '[Worker] Shopify name lookup failed');
    return null;
  }
}
