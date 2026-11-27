import { NextResponse } from "next/server";
import { ChannelType, db } from "@shopkeeper/db";
import { SHOPIFY_OAUTH_SCOPES } from "@shopkeeper/agent/shopify/integration-health";
import { NotFoundError } from "@/lib/api/errors";
import { withOrgRoute } from "@/lib/api/route";
import {
  isShopifySimulatorEnabled,
  SHOPIFY_SIMULATOR_TOKEN,
} from "@/lib/integrations/shopify-simulator";

export const POST = withOrgRoute(
  {
    context: "Shopify simulator POST",
    errorMessage: "Failed to connect the Shopify demo store",
    requireBillingWriteAllowed: true,
  },
  async ({ org }) => {
    if (!isShopifySimulatorEnabled()) {
      throw new NotFoundError("Not found");
    }

    const integration = await db.$transaction(async tx => {
      await tx.integration.deleteMany({
        where: {
          organizationId: org.id,
          platform: ChannelType.shopify,
        },
      });

      return tx.integration.create({
        data: {
          organizationId: org.id,
          platform: ChannelType.shopify,
          externalAccountId: `demo-${org.id}.shopkeeper.test`,
          accessToken: SHOPIFY_SIMULATOR_TOKEN,
          // The demo store serves every read and write, so it holds the full
          // grant. With none recorded, the agent hides every scoped tool.
          metadata: {
            simulated: true,
            label: "Shopkeeper demo store",
            oauthScopes: [...SHOPIFY_OAUTH_SCOPES],
          },
        },
      });
    });

    return NextResponse.json({
      id: integration.id,
      platform: integration.platform,
      externalAccountId: integration.externalAccountId,
      metadata: integration.metadata,
      connectionState: "active",
    }, { status: 201 });
  },
);
