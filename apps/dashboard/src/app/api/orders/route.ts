import { NextResponse } from "next/server"
import { withOrgRoute } from "@/lib/api/route"
import { BadRequestError } from "@/lib/api/errors"
import {
  classifyOrder,
  OrderContractValidationError,
  parseOrdersRequestParams,
} from "@/lib/orders/order-contract"
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
    const { searchParams } = new URL(request.url)
    let params
    try {
      params = parseOrdersRequestParams(searchParams)
    } catch (error) {
      if (error instanceof OrderContractValidationError) throw new BadRequestError(error.message)
      throw error
    }
    const integration = await getOperationalShopifyIntegration(org.id)

    try {
      const result = await listShopifyOrders(integration, {
        q: params.query ?? undefined,
        pageInfo: params.pageInfo ?? undefined,
        limit: params.limit,
      })
      return NextResponse.json({
        ...result,
        orders: result.orders.filter(order => classifyOrder(order) !== "excluded"),
      })
    } catch (err) {
      const response = await shopifyOrdersErrorResponse(err, integration)
      if (response) return response
      throw err
    }
  },
)
