const TAG_STYLES: Record<string, { label: string; className: string }> = {
  Shipping:          { label: "Shipping",        className: "bg-blue-500/15 text-blue-300" },
  Returns:           { label: "Returns",         className: "bg-amber-700/25 text-amber-300" },
  "Order Status":    { label: "Order Status",    className: "bg-purple-500/15 text-purple-300" },
  "Product Inquiry": { label: "Product Inquiry", className: "bg-rose-500/15 text-rose-300" },
  General:           { label: "General",         className: "bg-slate-500/20 text-slate-300" },
}

export function getTagStyle(tag: string | null | undefined) {
  if (tag && TAG_STYLES[tag]) return TAG_STYLES[tag]
  return TAG_STYLES.General
}

export function getMeaningfulTagStyle(tag: string | null | undefined) {
  if (tag && tag !== "General" && TAG_STYLES[tag]) return TAG_STYLES[tag]
  return null
}
