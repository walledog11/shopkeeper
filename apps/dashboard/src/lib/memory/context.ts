export const CONTEXT_CATEGORIES = [
  { value: "auto", label: "Auto" },
  { value: "shipping", label: "Shipping" },
  { value: "returns", label: "Returns" },
  { value: "discounts", label: "Discounts" },
  { value: "wholesale", label: "Wholesale" },
  { value: "other", label: "Other" },
] as const

export type ContextCategory = typeof CONTEXT_CATEGORIES[number]["value"]

export function inferContextCategory(content: string): Exclude<ContextCategory, "auto"> {
  const text = content.toLowerCase()
  if (/ship|deliver|tracking/.test(text)) return "shipping"
  if (/return|refund|exchange/.test(text)) return "returns"
  if (/discount|coupon|promo/.test(text)) return "discounts"
  if (/wholesale|bulk|stockist/.test(text)) return "wholesale"
  return "other"
}

export function contextTitle(content: string): string {
  const firstLine = content.trim().split(/\n|(?<=[.!?])\s/)[0]?.trim() || "Store context"
  return firstLine.length <= 80 ? firstLine : `${firstLine.slice(0, 77).trim()}...`
}
