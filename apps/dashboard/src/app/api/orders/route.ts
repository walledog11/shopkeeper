import { NextResponse } from "next/server"
import { withOrgRoute } from "@/lib/api/route"
import {
  getOperationalShopifyIntegration,
  listShopifyOrders,
  shopifyOrdersErrorResponse,
} from "@/app/api/orders/_lib/orders-service"

export const dynamic = "force-dynamic"

export const GET = withOrgRoute(
  {
    context: "Orders GET",
    errorMessage: "Failed to fetch orders",
    rateLimit: { key: "orders:get", limit: 30, windowSecs: 60 },
  },
  async ({ org, request }) => {
    const integration = await getOperationalShopifyIntegration(org.id)
    const { searchParams } = new URL(request.url)

    try {
      const result = await listShopifyOrders(integration, {
        fulfillmentStatus: searchParams.get("fulfillment_status") ?? "any",
        financialStatus: searchParams.get("financial_status") ?? "any",
        q: searchParams.get("q") ?? "",
        pageInfo: searchParams.get("page_info") ?? "",
        limit: parseInt(searchParams.get("limit") ?? "25", 10),
      })
      return NextResponse.json(result)
    } catch (err) {
      const response = await shopifyOrdersErrorResponse(err, integration)
      if (response) return response
      throw err
    }
  },
)
