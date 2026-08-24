import { STOREFRONT_VISITOR_LABEL } from "@shopkeeper/agent/person-name"
import { getCustomerName } from "@/lib/messaging/customer-name"

export function realCustomerName(
  customer: { name?: string | null; platformId?: string | null } | null | undefined,
): string | null {
  const name = getCustomerName(customer)
  if (name.includes("@")) return null
  // A stand-in for someone who never identified themselves is not a name.
  if (name === STOREFRONT_VISITOR_LABEL) return null
  if (customer?.platformId && name === customer.platformId) return null
  return name
}

export function customerDisplayLabel(
  customer: { name?: string | null; platformId?: string | null } | null | undefined,
): string {
  return realCustomerName(customer) ?? getCustomerName(customer)
}

export function timeAgoShort(date: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

/** Warmer copy for action-plan cards — spells out units and falls back to a date. */
export function timeAgoCard(date: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000)
  if (minutes < 1) return "Just now"
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return hours === 1 ? "1 hr ago" : `${hours} hr ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return "Yesterday"
  if (days < 7) return `${days} days ago`

  const sameYear = date.getFullYear() === now.getFullYear()
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  })
}
