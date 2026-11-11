import { NextResponse } from 'next/server';
import { syncShopifyBilling } from '@shopkeeper/agent/shopify/billing';
import { BadRequestError, ConflictError } from '@/lib/api/errors';
import { readRequiredJsonObject } from '@/lib/api/body';
import { withOrgRoute } from '@/lib/api/route';
import logger from '@/lib/server/logger';
import { captureIntegrationConnectionCompleted } from '@/lib/server/product-analytics';
import { claimShopifyInstallGrant } from '@/lib/shopify/pending-install';

/**
 * Connects the store installed from Shopify to this workspace, with the claim
 * link the app home handed out: no store URL and no second Shopify approval.
 * The same admin and billing gates as any connect.
 */
export const POST = withOrgRoute(
  {
    context: 'Shopify install claim POST',
    errorMessage: 'Failed to connect your Shopify store',
    requireAdmin: true,
    requireBillingWriteAllowed: true,
    rateLimit: { key: 'shopify:claim', limit: 10, windowSecs: 60 },
  },
  async ({ org, request }) => {
    const body = await readRequiredJsonObject(request);
    if (typeof body.claim !== 'string' || !body.claim) throw new BadRequestError('Missing claim');

    const result = await claimShopifyInstallGrant(body.claim, org.id);
    if (!result.ok) {
      if (result.error === 'shopify_store_in_use') {
        throw new ConflictError('This store is connected to another Shopkeeper workspace.');
      }
      // Expired, altered, used already, or minted before a reinstall: the fix is the same.
      throw new BadRequestError('This link no longer works. Open Shopkeeper from your Shopify admin to get a new one.');
    }

    await captureIntegrationConnectionCompleted({
      integrationId: result.integrationId,
      organizationId: org.id,
      platform: 'shopify',
    }).catch(() => undefined);
    // A store installed with a plan already has one: read it now rather than at
    // the next webhook.
    await syncShopifyBilling(org.id).catch((error: unknown) => {
      logger.warn({ err: error, orgId: org.id }, '[Shopify install] Billing read after claim failed');
    });

    return NextResponse.json({ id: result.integrationId, shop: result.shop }, { status: 201 });
  },
);
