import { getCustomerName } from "@/lib/messaging/customer-name"

export function realCustomerName(
  customer: { name?: string | null; platformId?: string | null } | null | undefined,
): string | null {
  const name = getCustomerName(customer)
  if (name.includes("@")) return null
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
