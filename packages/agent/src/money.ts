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
 * A decimal amount with the currency's own number of decimal places, the way
 * Shopify's REST API wrote it ("360.00" for dollars, "1000" for yen). The
 * GraphQL API writes the shortest form ("360.0"), so amounts read there pass
 * through this before anything serializes them. More precision than the
 * currency has is kept rather than rounded away.
 */
export function currencyAmount(amount: string, currency: string | null | undefined): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(amount.trim());
  if (!match) return amount;
  const [, sign, whole, rawFraction = ""] = match;
  const digits = minorDigits(normalizeCurrencyCode(currency));
  let fraction = rawFraction;
  while (fraction.length > digits && fraction.endsWith("0")) fraction = fraction.slice(0, -1);
  if (fraction.length > digits) return amount;
  fraction = fraction.padEnd(digits, "0");
  return digits === 0 ? `${sign}${whole}` : `${sign}${whole}.${fraction}`;
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
