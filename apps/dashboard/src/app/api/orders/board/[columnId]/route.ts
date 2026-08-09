import { NextResponse } from "next/server"
import { withOrgRoute } from "@/lib/api/route"
import { BadRequestError } from "@/lib/api/errors"
import {
  getOperationalShopifyIntegration,
  listCanonicalOrderColumnPage,
  shopifyOrdersErrorResponse,
} from "@/app/api/orders/_lib/orders-service"
import {
  OrderContractValidationError,
  parseOrderBoardRequestParams,
} from "@/lib/orders/order-contract"

export const dynamic = "force-dynamic"

export const GET = withOrgRoute<{ columnId: string }>(
  {
    context: "Orders board column GET",
    errorMessage: "Failed to fetch order board column",
    rateLimit: { key: "orders:board:column", limit: 60, windowSecs: 60 },
  },
  async ({ org, request, params }) => {
    let requestParams
    try {
      requestParams = parseOrderBoardRequestParams(
        params.columnId,
        new URL(request.url).searchParams,
      )
    } catch (error) {
      if (error instanceof OrderContractValidationError) throw new BadRequestError(error.message)
      throw error
    }

    const integration = await getOperationalShopifyIntegration(org.id)
    try {
      const result = await listCanonicalOrderColumnPage(integration, requestParams.columnId, {
        pageInfo: requestParams.pageInfo,
        limit: requestParams.limit,
      })
      return NextResponse.json(result)
    } catch (error) {
      const response = await shopifyOrdersErrorResponse(error, integration)
      if (response) return response
      throw error
    }
  },
)
