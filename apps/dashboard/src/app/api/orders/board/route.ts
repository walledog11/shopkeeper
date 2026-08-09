import { NextResponse } from "next/server"
import { withOrgRoute } from "@/lib/api/route"
import {
  getOperationalShopifyIntegration,
  listCanonicalOrderColumnPage,
  shopifyOrdersErrorResponse,
} from "@/app/api/orders/_lib/orders-service"
import {
  ORDER_BOARD_COLUMN_IDS,
  type OrderBoardColumnId,
  type OrdersBoardColumnResponse,
} from "@/lib/orders/order-contract"

export const dynamic = "force-dynamic"

export const GET = withOrgRoute(
  {
    context: "Orders board GET",
    errorMessage: "Failed to fetch orders board",
    rateLimit: { key: "orders:board", limit: 30, windowSecs: 60 },
  },
  async ({ org }) => {
    const integration = await getOperationalShopifyIntegration(org.id)

    try {
      const columnResults = await Promise.all(
        ORDER_BOARD_COLUMN_IDS.map(async (columnId) => {
          const page = await listCanonicalOrderColumnPage(integration, columnId)
          return { columnId, page }
        }),
      )

      const columns = Object.fromEntries(
        columnResults.map(({ columnId, page }) => [
          columnId,
          { orders: page.orders, nextPageInfo: page.nextPageInfo },
        ]),
      ) as Record<OrderBoardColumnId, OrdersBoardColumnResponse>

      const shop = columnResults[0]?.page.shop ?? integration.externalAccountId

      return NextResponse.json({ shop, columns })
    } catch (err) {
      const response = await shopifyOrdersErrorResponse(err, integration)
      if (response) return response
      throw err
    }
  },
)
