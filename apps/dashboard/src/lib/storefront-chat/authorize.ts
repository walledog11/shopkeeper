import { NextResponse } from "next/server";
import { db } from "@shopkeeper/db";
import { verifyAppProxySignature, isProxyTimestampFresh } from "@/lib/shopify/app-proxy";
import { verifySessionToken, type StorefrontTokenPayload } from "@/lib/storefront-chat/session-token";
import {
  isStorefrontChatGloballyEnabled,
  isStorefrontChatEnabledForIntegration,
} from "@/lib/storefront-chat/enabled";

export interface AuthorizedStorefrontSession {
  session: StorefrontTokenPayload;
  threadId: string | null;
}

// Both checks are required and neither is redundant: the proxy signature proves
// the request came through Shopify for this shop, the bearer token proves it is
// this session. Without the token any shopper on the storefront could read
// another shopper's conversation by guessing a session id.
//
// Shared by every shopper-facing proxy route so the message path and the
// verification path cannot drift apart on what they check. Verification is the
// higher-stakes of the two — it can put a code in a stranger's inbox — so it
// gets the same gate, not a lighter one.
export async function authorizeStorefrontRequest(
  request: Request,
): Promise<AuthorizedStorefrontSession | NextResponse> {
  if (!isStorefrontChatGloballyEnabled()) {
    return NextResponse.json({ error: "disabled" }, { status: 403 });
  }

  const appSecret = process.env.SHOPIFY_APP_SECRET;
  if (!appSecret) return NextResponse.json({ error: "not configured" }, { status: 503 });

  const url = new URL(request.url);
  if (!verifyAppProxySignature(url, appSecret) || !isProxyTimestampFresh(url)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  const session = token ? verifySessionToken(token) : null;
  if (!session) return NextResponse.json({ error: "invalid session" }, { status: 401 });

  // The merchant flag is re-read here rather than trusted from the token: a
  // token minted while chat was enabled otherwise keeps working for its whole
  // hour of TTL, which is not what a kill switch means. The same read proves
  // the session is still live, so it costs no extra round trip.
  const record = await db.storefrontChatSession.findFirst({
    where: { id: session.sessionId, organizationId: session.orgId, revokedAt: null },
    select: { threadId: true, integration: { select: { metadata: true } } },
  });
  if (!record) return NextResponse.json({ error: "session not found" }, { status: 404 });
  if (!isStorefrontChatEnabledForIntegration(record.integration.metadata)) {
    return NextResponse.json({ error: "disabled" }, { status: 403 });
  }

  return { session, threadId: record.threadId };
}

// Best effort, and only ever a secondary control. Two proxies sit between the
// shopper and this route — Shopify's app proxy and Vercel — and each rewrites
// the forwarded-for chain, so the leading entry is the shopper's address only if
// both behave as documented. That is not verified here.
//
// The per-IP limit is keyed on (integration, address) precisely so that being
// wrong is survivable: if every request on a shop collapses to one Shopify
// egress address, the limit degrades into a second per-shop rate limit rather
// than leaking across merchants or locking out the internet. The per-session
// burst limit and the daily budgets do not depend on this value at all.
export function shopperAddress(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || request.headers.get("x-real-ip") || null;
}
