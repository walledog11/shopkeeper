import { NextResponse } from "next/server";
import { db } from "@shopkeeper/db";
import { getGatewayBaseUrl } from "@/lib/server/gateway-url";
import { authorizeStorefrontRequest, shopperAddress } from "@/lib/storefront-chat/authorize";
import {
  findOutstandingChallenge,
  submitVerificationCode,
  isBareVerificationCode,
} from "@/lib/storefront-chat/verification";

const MAX_TEXT_LENGTH = 4000;

export async function GET(request: Request) {
  const authorized = await authorizeStorefrontRequest(request);
  if (authorized instanceof NextResponse) return authorized;
  const { session, threadId } = authorized;

  if (!threadId) return NextResponse.json({ escalated: false, messages: [] });

  // Internal notes and agent transcripts never leave Shopkeeper — only what the
  // customer is meant to see.
  const [messages, thread] = await Promise.all([
    db.message.findMany({
      where: {
        threadId,
        organizationId: session.orgId,
        senderType: { in: ["customer", "agent", "ai"] },
      },
      orderBy: { sentAt: "asc" },
      take: 100,
      select: { id: true, contentText: true, senderType: true, sentAt: true },
    }),
    // A shopper whose question was handed to a human sees nothing happen —
    // escalation is invisible from their side, and on this channel it is the
    // normal terminal state for the most common question. Reporting the flag
    // lets the widget say so from server state, so the notice survives a reload
    // instead of dying with the tab. Cleared when the merchant replies.
    db.thread.findFirst({
      where: { id: threadId, organizationId: session.orgId },
      select: { escalatedAt: true },
    }),
  ]);

  return NextResponse.json({
    escalated: thread?.escalatedAt != null,
    messages: messages.map((m) => ({
      id: m.id,
      text: m.contentText ?? "",
      from: m.senderType === "customer" ? "customer" : "agent",
      at: m.sentAt.toISOString(),
    })),
  });
}

export async function POST(request: Request) {
  const authorized = await authorizeStorefrontRequest(request);
  if (authorized instanceof NextResponse) return authorized;
  const { session } = authorized;

  const body = await request.json().catch(() => ({}));
  const text = typeof body.text === "string" ? body.text.trim().slice(0, MAX_TEXT_LENGTH) : "";
  if (!text) return NextResponse.json({ error: "text is required" }, { status: 400 });

  // A shopper handed a 6-digit code will type it into the chat as often as into
  // the card, and that message must never reach the agent: it would land in the
  // transcript as customer prose, be summarized, and cost a plan — for a string
  // whose only meaning is a constant-time comparison. Intercepted only while a
  // challenge is actually outstanding, so "1025" or a phone number in ordinary
  // conversation is still just a message.
  //
  // This is the single piece of text inspection in the whole design, and it
  // decides nothing except which handler runs.
  if (isBareVerificationCode(text)) {
    const challenge = await findOutstandingChallenge(session.sessionId, session.orgId);
    if (challenge) {
      const outcome = await submitVerificationCode({
        sessionId: session.sessionId,
        orgId: session.orgId,
        orderName: challenge.orderName,
        code: text,
      });
      return NextResponse.json({ accepted: true, verification: outcome }, { status: 200 });
    }
  }

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
      // The gateway enforces the per-IP burst limit but never sees the shopper:
      // Shopify proxies to us, and we call the gateway. This is the only hop
      // that knows the address.
      shopperIp: shopperAddress(request),
    }),
  }).catch(() => null);

  if (!response) {
    return NextResponse.json({ error: "could not deliver message" }, { status: 502 });
  }

  // The budget refusal is the gateway's to make — it owns the counters — but the
  // shopper-facing copy has to survive the hop, or the widget shows a generic
  // failure for something that is not a failure.
  if (response.status === 429) {
    const denial = await response.json().catch(() => ({}));
    const retryAfter = response.headers.get("retry-after");
    return NextResponse.json(
      { error: "rate limited", shopperMessage: denial.shopperMessage ?? null },
      { status: 429, ...(retryAfter ? { headers: { "Retry-After": retryAfter } } : {}) },
    );
  }

  if (!response.ok) {
    return NextResponse.json({ error: "could not deliver message" }, { status: 502 });
  }

  const outcome = await response.json().catch(() => ({}));
  return NextResponse.json(
    {
      accepted: true,
      isNewThread:
        typeof outcome === "object" && outcome !== null && "isNewThread" in outcome
          ? outcome.isNewThread === true
          : false,
    },
    { status: 202 },
  );
}
