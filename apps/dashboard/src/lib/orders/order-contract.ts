import { isRecord } from "@shopkeeper/agent/guards";
export const ORDER_BOARD_COLUMN_IDS = [
  "needs_fulfillment",
  "unpaid",
  "fulfilled",
] as const

export type OrderBoardColumnId = typeof ORDER_BOARD_COLUMN_IDS[number]
export type OrderClassification = OrderBoardColumnId | "excluded"

export interface OrderCustomer {
  id: number
  name: string | null
  email: string | null
}

export interface OrderLineItem {
  title: string
  quantity: number
  variant_title: string | null
}

export interface OrderRow {
  id: number
  name: string
  created_at: string
  financial_status: string
  fulfillment_status: string | null
  total_price: string
  currency: string
  customer: OrderCustomer | null
  line_items: OrderLineItem[]
}

export interface OrdersPageResponse {
  orders: OrderRow[]
  nextPageInfo: string | null
  shop: string
}

export type OrdersBoardColumnResponse = Pick<OrdersPageResponse, "orders" | "nextPageInfo">

export interface OrdersBoardResponse {
  shop: string
  columns: Record<OrderBoardColumnId, OrdersBoardColumnResponse>
}

const UNPAID_FINANCIAL_STATUSES = new Set(["pending", "authorized", "partially_paid"])
const EXCLUDED_FINANCIAL_STATUSES = new Set(["refunded", "voided"])
const OPEN_FULFILLMENT_STATUSES = new Set([null, "", "unfulfilled", "partial", "partially_fulfilled"])

/** Assigns every visible order to one, and only one, board column. */
export function classifyOrder(order: Pick<OrderRow, "financial_status" | "fulfillment_status">): OrderClassification {
  if (EXCLUDED_FINANCIAL_STATUSES.has(order.financial_status)) return "excluded"
  if (UNPAID_FINANCIAL_STATUSES.has(order.financial_status)) return "unpaid"
  if (OPEN_FULFILLMENT_STATUSES.has(order.fulfillment_status)) return "needs_fulfillment"
  return "fulfilled"
}

function isOrderNumberSearch(value: string): boolean {
  return /^#?\d+$/.test(value)
}

function isCustomerEmailSearch(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export class OrderContractValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "OrderContractValidationError"
  }
}

function parseLimit(searchParams: URLSearchParams): number {
  const values = searchParams.getAll("limit")
  if (values.length === 0) return 25
  if (values.length !== 1 || !/^\d+$/.test(values[0])) {
    throw new OrderContractValidationError("limit must be an integer from 1 to 50")
  }
  const limit = Number(values[0])
  if (limit < 1 || limit > 50) {
    throw new OrderContractValidationError("limit must be an integer from 1 to 50")
  }
  return limit
}

function parsePageInfo(searchParams: URLSearchParams): string | null {
  const values = searchParams.getAll("page_info")
  if (values.length === 0) return null
  if (values.length !== 1 || values[0].trim().length === 0 || values[0].length > 2048) {
    throw new OrderContractValidationError("page_info must be a non-empty cursor")
  }
  return values[0]
}

function assertOnlyParams(searchParams: URLSearchParams, allowed: readonly string[]): void {
  const allowedParams = new Set(allowed)
  for (const key of searchParams.keys()) {
    if (!allowedParams.has(key)) throw new OrderContractValidationError(`Unsupported query parameter: ${key}`)
  }
}

export function parseOrdersRequestParams(searchParams: URLSearchParams): {
  limit: number
  pageInfo: string | null
  query: string | null
} {
  assertOnlyParams(searchParams, ["q", "page_info", "limit"])
  const queryValues = searchParams.getAll("q")
  if (queryValues.length > 1) {
    throw new OrderContractValidationError("q must be an order number or customer email")
  }
  const query = queryValues[0]?.trim() || null
  if (query && !isOrderNumberSearch(query) && !isCustomerEmailSearch(query)) {
    throw new OrderContractValidationError("q must be an order number or customer email")
  }
  return {
    limit: parseLimit(searchParams),
    pageInfo: parsePageInfo(searchParams),
    query,
  }
}

export function parseOrderBoardRequestParams(
  columnId: string,
  searchParams: URLSearchParams,
): { columnId: OrderBoardColumnId; limit: number; pageInfo: string | null } {
  assertOnlyParams(searchParams, ["page_info", "limit"])
  if (!ORDER_BOARD_COLUMN_IDS.includes(columnId as OrderBoardColumnId)) {
    throw new OrderContractValidationError("Unknown order board column")
  }
  return {
    columnId: columnId as OrderBoardColumnId,
    limit: parseLimit(searchParams),
    pageInfo: parsePageInfo(searchParams),
  }
}


function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string"
}

function isOrderRow(value: unknown): value is OrderRow {
  if (!isRecord(value)) return false
  if (
    typeof value.id !== "number"
    || typeof value.name !== "string"
    || typeof value.created_at !== "string"
    || typeof value.financial_status !== "string"
    || !isNullableString(value.fulfillment_status)
    || typeof value.total_price !== "string"
    || typeof value.currency !== "string"
    || !Array.isArray(value.line_items)
  ) return false

  if (value.customer !== null) {
    if (
      !isRecord(value.customer)
      || typeof value.customer.id !== "number"
      || !isNullableString(value.customer.name)
      || !isNullableString(value.customer.email)
    ) return false
  }

  return value.line_items.every(item => (
    isRecord(item)
    && typeof item.title === "string"
    && Number.isInteger(item.quantity)
    && isNullableString(item.variant_title)
  ))
}

export function isOrdersPageResponse(value: unknown): value is OrdersPageResponse {
  return isRecord(value)
    && Array.isArray(value.orders)
    && value.orders.every(isOrderRow)
    && isNullableString(value.nextPageInfo)
    && typeof value.shop === "string"
}

function isOrdersBoardColumnResponse(value: unknown): value is OrdersBoardColumnResponse {
  return isRecord(value)
    && Array.isArray(value.orders)
    && value.orders.every(isOrderRow)
    && isNullableString(value.nextPageInfo)
}

export function isOrdersBoardResponse(value: unknown): value is OrdersBoardResponse {
  if (!isRecord(value) || typeof value.shop !== "string" || !isRecord(value.columns)) return false
  const columns = value.columns
  return ORDER_BOARD_COLUMN_IDS.every(columnId => isOrdersBoardColumnResponse(columns[columnId]))
}
