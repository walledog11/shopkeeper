import { NextResponse } from "next/server";
import { ChannelType, db } from "@shopkeeper/db";
import { NotFoundError } from "@/lib/api/errors";
import { withOrgRoute } from "@/lib/api/route";
import {
  isShopifySimulatorEnabled,
  SHOPIFY_SIMULATOR_DOMAIN,
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
          externalAccountId: SHOPIFY_SIMULATOR_DOMAIN,
          accessToken: SHOPIFY_SIMULATOR_TOKEN,
          metadata: {
            simulated: true,
            label: "Shopkeeper demo store",
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
