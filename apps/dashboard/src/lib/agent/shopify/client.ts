export const SHOPIFY_API_VERSION = "2026-04";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RETRIES = 1;

export interface ShopifyContext {
  shop: string;
  accessToken: string;
}

export interface ShopifyRequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
  timeoutMs?: number;
  maxRetries?: number;
}

export interface ShopifyGraphqlUserError {
  field?: string[] | string | null;
  message: string;
}

export class ShopifyRequestError extends Error {
  status?: number;
  payload?: unknown;

  constructor(message: string, options: { status?: number; payload?: unknown; cause?: unknown } = {}) {
    super(message);
    this.name = "ShopifyRequestError";
    this.status = options.status;
    this.payload = options.payload;
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

function shopifyHeaders(token: string): HeadersInit {
  return {
    "X-Shopify-Access-Token": token,
    "Content-Type": "application/json",
  };
}

function normalizeShopifyShop(shop: string): string {
  let stripped = shop
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();

  if (/^[a-z0-9][a-z0-9-]*$/.test(stripped)) {
    stripped = `${stripped}.myshopify.com`;
  }

  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(stripped)) {
    throw new ShopifyRequestError("Invalid Shopify shop domain. Expected a *.myshopify.com host.");
  }

  return stripped;
}

function buildShopifyAdminUrl(
  ctx: ShopifyContext,
  path: string,
  query?: ShopifyRequestOptions["query"]
): string {
  const shop = normalizeShopifyShop(ctx.shop);
  const normalizedPath = path.replace(/^\/+/, "");
  const url = new URL(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/${normalizedPath}`);

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

function retryDelayMs(res: Response): number {
  const retryAfter = res.headers.get("retry-after");
  if (!retryAfter) return 500;

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, 5000);
  }

  const dateMs = Date.parse(retryAfter);
  if (Number.isFinite(dateMs)) {
    return Math.min(Math.max(dateMs - Date.now(), 0), 5000);
  }

  return 500;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ShopifyRequestError("Shopify request timed out.", { cause: err });
    }
    throw new ShopifyRequestError("Shopify request failed before receiving a response.", { cause: err });
  } finally {
    clearTimeout(timer);
  }
}

async function parseResponseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function describeShopifyPayload(payload: unknown): string {
  if (payload === null || payload === undefined || payload === "") {
    return "No response body.";
  }

  if (typeof payload === "string") {
    return payload;
  }

  if (typeof payload === "object") {
    const maybeErrors = (payload as { errors?: unknown }).errors;
    if (typeof maybeErrors === "string") return maybeErrors;
    if (Array.isArray(maybeErrors)) return maybeErrors.map(String).join(", ");
    if (maybeErrors && typeof maybeErrors === "object") return JSON.stringify(maybeErrors);
  }

  return JSON.stringify(payload);
}

export function formatShopifyToolError(action: string, err: unknown): string {
  if (err instanceof ShopifyRequestError) {
    const status = err.status ? ` (${err.status})` : "";
    const detail = err.payload !== undefined ? describeShopifyPayload(err.payload) : err.message;
    return `Error: ${action}${status} - ${detail}`;
  }

  if (err instanceof Error) {
    return `Error: ${action} - ${err.message}`;
  }

  return `Error: ${action} - ${String(err)}`;
}

export async function shopifyRestJson<T>(
  ctx: ShopifyContext,
  path: string,
  options: ShopifyRequestOptions = {}
): Promise<T> {
  const url = buildShopifyAdminUrl(ctx, path, options.query);
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const method = options.method ?? "GET";
  const init: RequestInit = {
    method,
    headers: shopifyHeaders(ctx.accessToken),
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  };

  async function attemptRequest(attempt: number): Promise<T> {
    const res = await fetchWithTimeout(url, init, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const shouldRetry = (res.status === 429 || res.status >= 500) && attempt < maxRetries;

    if (shouldRetry) {
      await delay(retryDelayMs(res));
      return attemptRequest(attempt + 1);
    }

    const payload = await parseResponseBody(res);
    if (!res.ok) {
      throw new ShopifyRequestError("Shopify API request failed.", {
        status: res.status,
        payload,
      });
    }

    return payload as T;
  }

  return attemptRequest(0);
}

export async function shopifyGraphql<TData>(
  ctx: ShopifyContext,
  query: string,
  variables: Record<string, unknown>
): Promise<TData> {
  const payload = await shopifyRestJson<{
    data?: TData;
    errors?: { message: string }[];
  }>(ctx, "graphql.json", {
    method: "POST",
    body: { query, variables },
  });

  if (payload.errors?.length) {
    throw new ShopifyRequestError("Shopify GraphQL request failed.", {
      payload: payload.errors.map((e) => e.message).join(", "),
    });
  }

  if (!payload.data) {
    throw new ShopifyRequestError("Shopify GraphQL response did not include data.", { payload });
  }

  return payload.data;
}

export function formatUserErrors(errors: ShopifyGraphqlUserError[] | undefined | null): string | null {
  if (!errors?.length) return null;
  return errors.map((e) => e.message).join(", ");
}
