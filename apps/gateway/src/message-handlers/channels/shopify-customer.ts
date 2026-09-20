import { db } from '@shopkeeper/db';
import { shopifyRestJson } from '@shopkeeper/agent/shopify';
import logger from '../../logger.js';

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
