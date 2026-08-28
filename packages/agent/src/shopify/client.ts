import { createHash, randomUUID } from "node:crypto";
import { handleShopifySimulatorRest } from "./simulator-store.js";

export const SHOPIFY_API_VERSION = "2026-04";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RETRIES = 1;

export interface ShopifyContext {
  shop: string;
  accessToken: string;
  operationId?: string;
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
  code?: string | null;
}

export class ShopifyRequestError extends Error {
  status?: number;
  payload?: unknown;
  rejectedBeforeExecution?: boolean;

  constructor(
    message: string,
    options: {
      status?: number;
      payload?: unknown;
      cause?: unknown;
      rejectedBeforeExecution?: boolean;
    } = {}
  ) {
    super(message);
    this.name = "ShopifyRequestError";
    this.status = options.status;
    this.payload = options.payload;
    this.rejectedBeforeExecution = options.rejectedBeforeExecution;
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

// ── Per-shop request throttling ─────────────────────────────────────────────
// Shopify's REST Admin API is a leaky bucket (standard plan: 40 burst, 2 req/s
// refill). The per-call retry above only backs off a lone 429 — concurrent
// agent/autopilot runs against the same shop would each stampede the bucket
// independently. A shared in-process token bucket per shop makes them wait
// cooperatively so request starts are paced under the leak rate.
const BUCKET_CAPACITY = 40;
const BUCKET_REFILL_PER_SEC = 2;

interface ShopTokenBucket {
  tokens: number;
  lastRefill: number;
  queue: (() => void)[];
  timer?: ReturnType<typeof setTimeout>;
}

const shopBuckets = new Map<string, ShopTokenBucket>();

function drainBucket(bucket: ShopTokenBucket): void {
  const now = Date.now();
  const elapsedSec = (now - bucket.lastRefill) / 1000;
  if (elapsedSec > 0) {
    bucket.tokens = Math.min(BUCKET_CAPACITY, bucket.tokens + elapsedSec * BUCKET_REFILL_PER_SEC);
    bucket.lastRefill = now;
  }

  while (bucket.queue.length > 0 && bucket.tokens >= 1) {
    bucket.tokens -= 1;
    bucket.queue.shift()!();
  }

  if (bucket.queue.length > 0 && !bucket.timer) {
    const waitMs = Math.max(50, Math.ceil(((1 - bucket.tokens) / BUCKET_REFILL_PER_SEC) * 1000));
    bucket.timer = setTimeout(() => {
      bucket.timer = undefined;
      drainBucket(bucket);
    }, waitMs);
  }
}

function acquireShopToken(shop: string): Promise<void> {
  const existing = shopBuckets.get(shop);
  const bucket: ShopTokenBucket = existing ?? { tokens: BUCKET_CAPACITY, lastRefill: Date.now(), queue: [] };
  if (!existing) shopBuckets.set(shop, bucket);

  return new Promise<void>((resolve) => {
    bucket.queue.push(resolve);
    drainBucket(bucket);
  });
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

export function isAmbiguousShopifyMutationError(err: unknown): boolean {
  if (!(err instanceof ShopifyRequestError)) return false;
  // A document Shopify refused to execute is not ambiguous: nothing ran.
  if (err.rejectedBeforeExecution) return false;
  return err.status === undefined || err.status === 429 || err.status >= 500;
}

export interface ShopifyResponse<T> {
  data: T;
  headers: Headers;
}

export async function shopifyRest<T>(
  ctx: ShopifyContext,
  path: string,
  options: ShopifyRequestOptions = {}
): Promise<ShopifyResponse<T>> {
  const simulated = handleShopifySimulatorRest(ctx, path, options);
  if (simulated) {
    if (!simulated.ok) {
      throw new ShopifyRequestError("Shopify API request failed.", {
        status: simulated.status,
        payload: simulated.payload,
      });
    }
    return { data: simulated.data as T, headers: simulated.headers };
  }

  const shop = normalizeShopifyShop(ctx.shop);
  const url = buildShopifyAdminUrl(ctx, path, options.query);
  const method = options.method ?? "GET";
  // A mutation can commit at Shopify even when the response is a timeout/5xx.
  // Never replay it implicitly. Call sites may opt into a retry only after
  // establishing provider idempotency or reconciliation for that operation.
  const maxRetries = options.maxRetries ?? (method === "GET" ? DEFAULT_MAX_RETRIES : 0);
  const init: RequestInit = {
    method,
    cache: "no-store",
    headers: shopifyHeaders(ctx.accessToken),
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  };

  async function attemptRequest(attempt: number): Promise<ShopifyResponse<T>> {
    await acquireShopToken(shop);
    let res: Response;
    try {
      res = await fetchWithTimeout(url, init, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    } catch (error) {
      if (attempt < maxRetries) {
        await delay(500);
        return attemptRequest(attempt + 1);
      }
      throw error;
    }
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

    return { data: payload as T, headers: res.headers };
  }

  return attemptRequest(0);
}

export async function shopifyRestJson<T>(
  ctx: ShopifyContext,
  path: string,
  options: ShopifyRequestOptions = {}
): Promise<T> {
  const { data } = await shopifyRest<T>(ctx, path, options);
  return data;
}

// Shopify paginates list endpoints via a cursor in the `Link` response header.
export function parseNextPageInfo(headers: Headers): string | null {
  const linkHeader = headers.get("link") ?? "";
  const nextMatch = linkHeader.match(/<[^>]*[?&]page_info=([^&>]+)[^>]*>;\s*rel="next"/);
  return nextMatch ? nextMatch[1] : null;
}

interface ShopifyGraphqlError {
  message: string;
  extensions?: { code?: unknown } | null;
}

// A GraphQL response omits the `data` key only when the request failed before
// execution began — a parse, validation or variable-coercion error, which
// provably committed nothing. An execution error can follow a side effect, and
// Shopify reports its capacity failures the same statusless way, so those keep
// the benefit of the doubt.
const CODES_THAT_ARE_NOT_DOCUMENT_REJECTIONS = new Set(["THROTTLED", "INTERNAL_SERVER_ERROR"]);

function graphqlErrorCode(err: ShopifyGraphqlError): string | undefined {
  const code = err.extensions?.code;
  return typeof code === "string" ? code.toUpperCase() : undefined;
}

export async function shopifyGraphql<TData>(
  ctx: ShopifyContext,
  query: string,
  variables: Record<string, unknown>,
  options: Pick<ShopifyRequestOptions, "maxRetries" | "timeoutMs"> = {},
): Promise<TData> {
  const payload = await shopifyRestJson<{
    data?: TData;
    errors?: ShopifyGraphqlError[];
  }>(ctx, "graphql.json", {
    method: "POST",
    body: { query, variables },
    ...options,
  });

  if (payload.errors?.length) {
    const codes = payload.errors.map(graphqlErrorCode);
    throw new ShopifyRequestError("Shopify GraphQL request failed.", {
      payload: payload.errors
        .map((e, i) => (codes[i] ? `${e.message} (${codes[i]})` : e.message))
        .join(", "),
      rejectedBeforeExecution: !("data" in payload)
        && !codes.some((code) => code !== undefined && CODES_THAT_ARE_NOT_DOCUMENT_REJECTIONS.has(code)),
    });
  }

  if (!payload.data) {
    throw new ShopifyRequestError("Shopify GraphQL response did not include data.", { payload });
  }

  return payload.data;
}

// Shopify recommends UUIDs for GraphQL @idempotent keys. The execution ledger
// supplies a stable operation identity for reviewed actions; direct callers get
// one fresh key that remains stable for every retry within that invocation.
export function shopifyIdempotencyKey(operationId?: string): string {
  if (!operationId) return randomUUID();
  const hex = createHash("sha256").update(operationId).digest("hex");
  const variant = ((Number.parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

// Shopify caps a tag at 40 characters and rejects the whole write with a 422
// ("Order tags is invalid") when one is longer — which the raw 36-character
// idempotency key plus this prefix is, at 50. Strip the key's hyphens and take
// 24 of its hex digits instead: 14 + 24 = 38, comfortably under the cap and
// still 96 bits of the same digest.
const SHOPIFY_OPERATION_TAG_PREFIX = "shopkeeper-op-";
export const SHOPIFY_TAG_MAX_LENGTH = 40;

// The one definition of an operation tag. The writer that stamps it and the
// probe that searches for it must agree exactly, so neither builds its own.
export function shopifyOperationTag(operationId?: string): string {
  const key = shopifyIdempotencyKey(operationId).replaceAll("-", "").slice(0, 24);
  return `${SHOPIFY_OPERATION_TAG_PREFIX}${key}`;
}

export function formatUserErrors(errors: ShopifyGraphqlUserError[] | undefined | null): string | null {
  if (!errors?.length) return null;
  return errors.map((e) => e.message).join(", ");
}
