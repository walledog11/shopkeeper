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

function optionalNumericId(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return requireNumericId(value, field);
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

export function moneyToCents(value: string): number {
  const [dollars, cents = ""] = value.split(".");
  return Number(dollars) * 100 + Number(cents.padEnd(2, "0").slice(0, 2));
}

export function centsToMoney(cents: number): string {
  return (cents / 100).toFixed(2);
}
