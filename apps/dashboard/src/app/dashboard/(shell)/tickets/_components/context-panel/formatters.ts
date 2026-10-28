import {
  formatMonthYear as formatSharedMonthYear,
  formatShortDate as formatSharedShortDate,
} from "@/lib/format/date"

export function fulfillmentLabel(status: string | null): { label: string; textClass: string; dotClass: string } {
  switch (status) {
    case 'fulfilled': return { label: 'Fulfilled', textClass: 'text-emerald-600', dotClass: 'bg-emerald-500' }
    case 'partial': return { label: 'Partial', textClass: 'text-amber-600', dotClass: 'bg-amber-500' }
    case 'restocked': return { label: 'Restocked', textClass: 'text-foreground/50', dotClass: 'bg-foreground/30' }
    default: return { label: 'Unfulfilled', textClass: 'text-amber-600', dotClass: 'bg-amber-500' }
  }
}

export function formatMonthYear(iso: string | null | undefined) {
  return formatSharedMonthYear(iso, { fallback: '-', timeZone: 'UTC' })
}

export function formatShortDate(iso: string | null | undefined) {
  return formatSharedShortDate(iso, { fallback: '', timeZone: 'UTC' })
}
