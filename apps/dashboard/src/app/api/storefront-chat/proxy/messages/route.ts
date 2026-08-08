import { NextResponse } from "next/server";
import { db } from "@shopkeeper/db";
import { getGatewayBaseUrl } from "@/lib/server/gateway-url";
import { verifyAppProxySignature, isProxyTimestampFresh } from "@/lib/shopify/app-proxy";
import { verifySessionToken, type StorefrontTokenPayload } from "@/lib/storefront-chat/session-token";
import {
  isStorefrontChatGloballyEnabled,
  isStorefrontChatEnabledForIntegration,
} from "@/lib/storefront-chat/enabled";

const MAX_TEXT_LENGTH = 4000;

interface AuthorizedSession {
  session: StorefrontTokenPayload;
  threadId: string | null;
}

// Both checks are required and neither is redundant: the proxy signature proves
// the request came through Shopify for this shop, the bearer token proves it is
// this session. Without the token any shopper on the storefront could read
// another shopper's conversation by guessing a session id.
async function authorize(request: Request): Promise<AuthorizedSession | NextResponse> {
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

export async function GET(request: Request) {
  const authorized = await authorize(request);
  if (authorized instanceof NextResponse) return authorized;
  const { session, threadId } = authorized;

  if (!threadId) return NextResponse.json({ messages: [] });

  // Internal notes and agent transcripts never leave Shopkeeper — only what the
  // customer is meant to see.
  const messages = await db.message.findMany({
    where: {
      threadId,
      organizationId: session.orgId,
      senderType: { in: ["customer", "agent", "ai"] },
    },
    orderBy: { sentAt: "asc" },
    take: 100,
    select: { id: true, contentText: true, senderType: true, sentAt: true },
  });

  return NextResponse.json({
    messages: messages.map((m) => ({
      id: m.id,
      text: m.contentText ?? "",
      from: m.senderType === "customer" ? "customer" : "agent",
      at: m.sentAt.toISOString(),
    })),
  });
}

export async function POST(request: Request) {
  const authorized = await authorize(request);
  if (authorized instanceof NextResponse) return authorized;
  const { session } = authorized;

  const body = await request.json().catch(() => ({}));
  const text = typeof body.text === "string" ? body.text.trim().slice(0, MAX_TEXT_LENGTH) : "";
  if (!text) return NextResponse.json({ error: "text is required" }, { status: 400 });

  const gatewayUrl = getGatewayBaseUrl({ required: false });
  const secret = process.env.INTERNAL_API_SECRET;
  if (!gatewayUrl || !secret) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  // Persistence, classification, summary, planning and operator notify all live
  // in the gateway's inbound pipeline. Forwarding keeps storefront messages on
  // exactly the same path as email and Instagram rather than a parallel one.
  const response = await fetch(`${gatewayUrl}/internal/storefront-chat/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-internal-secret": secret },
    body: JSON.stringify({
      organizationId: session.orgId,
      sessionId: session.sessionId,
      integrationId: session.integrationId,
      text,
      clientMessageId: typeof body.clientMessageId === "string" ? body.clientMessageId : null,
    }),
  }).catch(() => null);

  if (!response || !response.ok) {
    return NextResponse.json({ error: "could not deliver message" }, { status: 502 });
  }

  return NextResponse.json({ accepted: true }, { status: 202 });
}
