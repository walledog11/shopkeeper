import { STOREFRONT_VISITOR_LABEL } from "@shopkeeper/shared/customer-labels"
import { timeAgoCard, timeAgoShort } from "@/lib/format/date"
import { getCustomerName } from "@/lib/messaging/customer-name"

export { timeAgoCard, timeAgoShort }

export function realCustomerName(
  customer: { name?: string | null; platformId?: string | null } | null | undefined,
): string | null {
  const name = getCustomerName(customer)
  if (name.includes("@")) return null
  if (name === STOREFRONT_VISITOR_LABEL) return null
  if (customer?.platformId && name === customer.platformId) return null
  return name
}

export function customerDisplayLabel(
  customer: { name?: string | null; platformId?: string | null } | null | undefined,
): string {
  return realCustomerName(customer) ?? getCustomerName(customer)
}
