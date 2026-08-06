import { NextResponse } from "next/server"
import { withOrgRoute } from "@/lib/api/route"
import {
  getOperationalShopifyIntegration,
  listShopifyOrders,
  shopifyOrdersErrorResponse,
  type OrdersPageResult,
} from "@/app/api/orders/_lib/orders-service"

export const dynamic = "force-dynamic"

const BOARD_COLUMNS = [
  { id: "needs_fulfillment", fulfillmentStatus: "unfulfilled" },
  { id: "unpaid", financialStatus: "unpaid" },
  { id: "fulfilled", fulfillmentStatus: "shipped" },
] as const

type BoardColumnId = typeof BOARD_COLUMNS[number]["id"]

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
        BOARD_COLUMNS.map(async (column) => {
          const page = await listShopifyOrders(integration, {
            ...( "fulfillmentStatus" in column ? { fulfillmentStatus: column.fulfillmentStatus } : {}),
            ...( "financialStatus" in column ? { financialStatus: column.financialStatus } : {}),
          })
          return { columnId: column.id, page }
        }),
      )

      const columns = Object.fromEntries(
        columnResults.map(({ columnId, page }) => [
          columnId,
          { orders: page.orders, nextPageInfo: page.nextPageInfo },
        ]),
      ) as Record<BoardColumnId, Pick<OrdersPageResult, "orders" | "nextPageInfo">>

      const shop = columnResults[0]?.page.shop ?? integration.externalAccountId

      return NextResponse.json({ shop, columns })
    } catch (err) {
      const response = await shopifyOrdersErrorResponse(err, integration)
      if (response) return response
      throw err
    }
  },
)
