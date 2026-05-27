import logger from "@/lib/server/logger";
import { getGatewayBaseUrl } from "@/lib/server/gateway-url";

const ENQUEUE_TIMEOUT_MS = 1500;
const MAX_THREADS_PER_REQUEST = 100;

export interface ClosedThreadMemoryTarget {
  threadId: string;
  closedAt?: Date | string | null;
}

function shouldSkipInTest(): boolean {
  return process.env.NODE_ENV === "test" && process.env.CUSTOMER_MEMORY_ENQUEUE_IN_TESTS !== "true";
}

function serializeClosedAt(value: Date | string | null | undefined): string | undefined {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : undefined;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function uniqueTargets(targets: ClosedThreadMemoryTarget[]): Array<{ threadId: string; closedAt?: string }> {
  const byThreadId = new Map<string, { threadId: string; closedAt?: string }>();
  for (const target of targets) {
    const threadId = target.threadId.trim();
    if (!threadId) continue;
    const closedAt = serializeClosedAt(target.closedAt);
    byThreadId.set(threadId, { threadId, ...(closedAt ? { closedAt } : {}) });
  }
  return [...byThreadId.values()];
}

function chunkTargets<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function postCustomerMemoryTargets(args: {
  base: string;
  secret: string;
  organizationId: string;
  threads: Array<{ threadId: string; closedAt?: string }>;
}): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ENQUEUE_TIMEOUT_MS);

  try {
    const res = await fetch(`${args.base}/internal/customer-memory/thread-close`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": args.secret,
      },
      body: JSON.stringify({
        organizationId: args.organizationId,
        threads: args.threads,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logger.warn(
        { organizationId: args.organizationId, status: res.status, body: body.slice(0, 300), count: args.threads.length },
        "[customer-memory] Gateway enqueue failed",
      );
    }
  } catch (err) {
    logger.warn(
      { organizationId: args.organizationId, err: err instanceof Error ? err.message : String(err), count: args.threads.length },
      "[customer-memory] Gateway enqueue errored",
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function enqueueCustomerMemoryForClosedThreads(args: {
  organizationId: string;
  threads: ClosedThreadMemoryTarget[];
}): Promise<void> {
  const threads = uniqueTargets(args.threads);
  if (threads.length === 0 || shouldSkipInTest()) return;

  const base = getGatewayBaseUrl();
  if (!base) {
    logger.warn({ organizationId: args.organizationId, count: threads.length }, "[customer-memory] No gateway URL; skipping enqueue");
    return;
  }

  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    logger.warn({ organizationId: args.organizationId, count: threads.length }, "[customer-memory] INTERNAL_API_SECRET unset; skipping enqueue");
    return;
  }

  for (const chunk of chunkTargets(threads, MAX_THREADS_PER_REQUEST)) {
    await postCustomerMemoryTargets({
      base,
      secret,
      organizationId: args.organizationId,
      threads: chunk,
    });
  }
}
