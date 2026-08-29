export class ShopifyInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShopifyInputError";
  }
}

export function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ShopifyInputError(`${field} is required.`);
  }
  return value.trim();
}

export function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export function requireNumericId(value: unknown, field: string): string {
  const id = requireNonEmptyString(value, field);
  if (!/^\d+$/.test(id)) {
    throw new ShopifyInputError(`${field} must be a numeric Shopify ID.`);
  }
  return id;
}

/**
 * A variant id in the form the GraphQL API takes, from either form the model
 * writes.
 *
 * `search_shopify_products` returns full gids and the mutation requires them,
 * but the model writes the bare number first on almost every reprice, spends a
 * round-trip on `Invalid global id`, and retries with the prefix. Accepting
 * both is a schema answer to what was otherwise a wasted iteration per write.
 * Anything that is neither is rejected here rather than at Shopify, so an
 * invented id like `.../Medium-Sand` fails without a network call.
 */
export function requireVariantGid(value: unknown, field: string): string {
  const raw = requireNonEmptyString(value, field);
  const numeric = raw.startsWith("gid://shopify/ProductVariant/")
    ? raw.slice("gid://shopify/ProductVariant/".length)
    : raw;
  if (!/^\d+$/.test(numeric)) {
    throw new ShopifyInputError(
      `${field} must be a Shopify variant ID — the number, or the full `
      + `gid://shopify/ProductVariant/<id>. Got "${raw}".`,
    );
  }
  return `gid://shopify/ProductVariant/${numeric}`;
}

function requirePositiveInteger(value: unknown, field: string): number {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw new ShopifyInputError(`${field} must be a positive integer.`);
  }
  return numberValue;
}

export function optionalPositiveInteger(value: unknown, field: string, fallback: number): number {
  if (value === undefined || value === null || value === "") return fallback;
  return requirePositiveInteger(value, field);
}

export function clampLimit(value: unknown, fallback: number, max: number): number {
  if (value === undefined || value === null || value === "") return fallback;

  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw new ShopifyInputError("limit must be a positive integer.");
  }

  return Math.min(numberValue, max);
}

export function requireEmail(value: unknown, field: string): string {
  const email = requireNonEmptyString(value, field);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ShopifyInputError(`${field} must be a valid email address.`);
  }
  return email;
}

export function requireAmount(value: unknown, field: string): string {
  const amount = requireNonEmptyString(value, field);
  if (!/^\d+(\.\d{1,2})?$/.test(amount)) {
    throw new ShopifyInputError(`${field} must be a positive decimal amount.`);
  }
  if (moneyToCents(amount) <= 0) {
    throw new ShopifyInputError(`${field} must be greater than zero.`);
  }
  return amount;
}

// The one money parser for the Shopify layer. Integer math on the decimal
// string, never `parseFloat * 100`, so a price is read the same way whether it
// reaches us through a refund comparison or a value-at-risk bound.
//
// Anything unparseable is 0, not NaN. Shopify's own amounts are always valid
// decimals, but a null slips through the optional fields of a GraphQL response,
// and NaN fails every `>` comparison silently — it would wave a sale past the
// blast-radius guard rather than block it.
export function moneyToCents(value: string | null | undefined): number {
  if (typeof value !== "string") return 0;
  const [dollars, cents = ""] = value.split(".");
  const total = Number(dollars) * 100 + Number(cents.padEnd(2, "0").slice(0, 2));
  return Number.isFinite(total) ? total : 0;
}

export function centsToMoney(cents: number): string {
  return (cents / 100).toFixed(2);
}
