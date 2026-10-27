const ISO_CURRENCY_CODE = /^[A-Z]{3}$/;

export function normalizeCurrencyCode(value: string | null | undefined, fallback = "USD"): string {
  const normalized = value?.trim().toUpperCase();
  if (normalized && ISO_CURRENCY_CODE.test(normalized)) return normalized;
  const fallbackCode = fallback.trim().toUpperCase();
  return ISO_CURRENCY_CODE.test(fallbackCode) ? fallbackCode : "USD";
}

function minorDigits(code: string): number {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: code }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

/**
 * Money as every surface writes it: "$1,234.50" for US dollars and
 * "1,234.50 EUR" for anything else, so a merchant reads one format on the phone,
 * in the briefing and on the dashboard, and a customer never sees a bare "$"
 * that could mean another dollar. A whole amount drops its cents unless `exact`
 * keeps them, as a refund or an order total should.
 */
export function formatMoney(
  amount: string | number,
  currency: string | null | undefined,
  options: { exact?: boolean } = {},
): string {
  const code = normalizeCurrencyCode(currency);
  const value = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(value)) return code === "USD" ? `$${amount}` : `${amount} ${code}`;
  const digits = minorDigits(code);
  const whole = Number.isInteger(value);
  const number = Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: options.exact || !whole ? digits : 0,
    maximumFractionDigits: digits,
  });
  const sign = value < 0 ? "-" : "";
  return code === "USD" ? `${sign}$${number}` : `${sign}${number} ${code}`;
}
