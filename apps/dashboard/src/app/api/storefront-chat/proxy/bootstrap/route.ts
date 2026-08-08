import { NextResponse } from "next/server";
import { db } from "@shopkeeper/db";
import { normalizeShopifyShopDomain } from "@/lib/shopify/oauth";
import { verifyAppProxySignature, isProxyTimestampFresh } from "@/lib/shopify/app-proxy";
import {
  mintSessionToken,
  createResumeSecret,
  hashResumeSecret,
} from "@/lib/storefront-chat/session-token";
import {
  isStorefrontChatGloballyEnabled,
  isStorefrontChatEnabledForIntegration,
} from "@/lib/storefront-chat/enabled";

const SESSION_TTL_DAYS = 30;

export async function POST(request: Request) {
  // Checked before the signature so a disabled platform does no work at all,
  // and reveals nothing beyond the feature being off.
  if (!isStorefrontChatGloballyEnabled()) {
    return NextResponse.json({ error: "disabled" }, { status: 403 });
  }

  const appSecret = process.env.SHOPIFY_APP_SECRET;
  if (!appSecret) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const url = new URL(request.url);
  if (!verifyAppProxySignature(url, appSecret) || !isProxyTimestampFresh(url)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const shopDomain = normalizeShopifyShopDomain(url.searchParams.get("shop") ?? "");
  if (!shopDomain) {
    return NextResponse.json({ error: "missing shop" }, { status: 400 });
  }

  const integration = await db.integration.findFirst({
    where: { platform: "shopify", externalAccountId: shopDomain },
    select: { id: true, organizationId: true, metadata: true },
  });
  if (!integration) {
    return NextResponse.json({ error: "shop not connected" }, { status: 404 });
  }
  // A connected store is not a chat-enabled store. Until the merchant turns it
  // on, the app embed being active in the theme is not consent.
  if (!isStorefrontChatEnabledForIntegration(integration.metadata)) {
    return NextResponse.json({ error: "disabled" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const priorSessionId = typeof body.sessionId === "string" ? body.sessionId : null;
  const priorResumeToken = typeof body.resumeToken === "string" ? body.resumeToken : null;

  let session = null;
  if (priorSessionId && priorResumeToken) {
    session = await db.storefrontChatSession.findFirst({
      where: {
        id: priorSessionId,
        organizationId: integration.organizationId,
        integrationId: integration.id,
        resumeSecretHash: hashResumeSecret(priorResumeToken),
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
  }

  let issuedResumeSecret: string | null = null;
  if (session) {
    await db.storefrontChatSession.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });
  } else {
    // Deliberately no customer or thread here — an abandoned widget open costs
    // one row and never an empty ticket in the merchant's inbox.
    const { secret, hash } = createResumeSecret();
    issuedResumeSecret = secret;
    session = await db.storefrontChatSession.create({
      data: {
        organizationId: integration.organizationId,
        integrationId: integration.id,
        storefrontHost: shopDomain,
        resumeSecretHash: hash,
        expiresAt: new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000),
      },
    });
  }

  const messages = session.threadId
    ? await db.message.findMany({
        where: {
          threadId: session.threadId,
          senderType: { in: ["customer", "agent", "ai"] },
        },
        orderBy: { sentAt: "asc" },
        take: 50,
        select: { id: true, contentText: true, senderType: true, sentAt: true },
      })
    : [];

  return NextResponse.json({
    sessionId: session.id,
    resumeToken: issuedResumeSecret,
    token: mintSessionToken({
      sessionId: session.id,
      orgId: integration.organizationId,
      integrationId: integration.id,
      shop: shopDomain,
    }),
    messages: messages.map((m) => ({
      id: m.id,
      text: m.contentText ?? "",
      from: m.senderType === "customer" ? "customer" : "agent",
      at: m.sentAt.toISOString(),
    })),
  });
}
