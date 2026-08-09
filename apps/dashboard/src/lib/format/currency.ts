const ISO_CURRENCY_CODE = /^[A-Z]{3}$/

export function normalizeCurrencyCode(value: string | null | undefined, fallback = "USD"): string {
  const normalized = value?.trim().toUpperCase()
  if (normalized && ISO_CURRENCY_CODE.test(normalized)) return normalized
  return ISO_CURRENCY_CODE.test(fallback.toUpperCase()) ? fallback.toUpperCase() : "USD"
}

export function formatCurrency(
  value: string | number,
  currency: string | null | undefined,
  locale = "en-US",
): string {
  const amount = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(amount)) return String(value)
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: normalizeCurrencyCode(currency),
  }).format(amount)
}
