import { db } from "@shopkeeper/db";
import { shopifyRestJson, type ShopifyContext } from "@shopkeeper/agent/shopify";
import {
  VERIFICATION_CODE_LENGTH,
  VERIFICATION_MAX_ATTEMPTS,
  VERIFICATION_MAX_SENDS_PER_SESSION,
  buildVerificationEmail,
  emailsMatch,
  evaluateVerificationAttempt,
  generateVerificationCode,
  hashVerificationCode,
  normalizeCode,
  normalizeOrderName,
  verificationExpiry,
  type VerificationOutcome,
} from "@shopkeeper/agent/storefront-verification";
import { resolveEmailIntegration } from "@shopkeeper/email/integration-resolution";
import { getEmailSender } from "@shopkeeper/email/senders";
import { EmailNotConfiguredError } from "@shopkeeper/email/types";
import logger from "@/lib/server/logger";

// Deterministic identity verification for storefront chat. Deliberately not an
// agent tool: the model never decides whether someone is verified, it only ever
// sees a session that already is or is not. That keeps the whole ritual out of
// the plan/approve loop — a code send that waited on merchant approval would be
// slower than the deflection it replaces — without giving the channel
// auto-execute or teaching the planner to perform side effects.

// `sent` is returned whether or not an order matched, whether or not an email
// matched, and whether or not anything was actually mailed. The two states that
// do differ are both properties of the shopper's own session rather than of the
// order, so neither is an oracle.
export type VerificationRequestResult =
  | { status: "sent" }
  | { status: "send_limit" }
  | { status: "unavailable" };

interface ShopifyOrderIdentity {
  id: number | string;
  name?: string | null;
  email?: string | null;
}

export interface RequestVerificationInput {
  sessionId: string;
  orgId: string;
  integrationId: string;
  orderName: string;
  email: string;
}

export async function requestVerification(
  input: RequestVerificationInput,
): Promise<VerificationRequestResult> {
  const orderName = normalizeOrderName(input.orderName);
  const suppliedEmail = input.email.trim();
  if (!suppliedEmail || orderName === "#") return { status: "unavailable" };

  // Claimed before any lookup, and conditionally so the increment and the
  // ceiling check cannot interleave. Charging every request rather than only
  // the ones that mail something is deliberate: it bounds order-number probing
  // by the same counter that bounds mail-bombing, and it means the counter
  // moves identically for a match and a miss.
  const claimed = await db.storefrontChatSession.updateMany({
    where: {
      id: input.sessionId,
      organizationId: input.orgId,
      revokedAt: null,
      verificationSends: { lt: VERIFICATION_MAX_SENDS_PER_SESSION },
    },
    data: { verificationSends: { increment: 1 }, lastSeenAt: new Date() },
  });
  if (claimed.count === 0) return { status: "send_limit" };

  // Both dependencies are resolved before the order is looked up, so a
  // misconfigured store fails the same way for every order number. Resolving
  // them afterwards would make `unavailable` reachable only on a match, which
  // is exactly the disclosure this design exists to prevent.
  const integration = await db.integration.findFirst({
    where: { id: input.integrationId, organizationId: input.orgId, platform: "shopify" },
    select: { externalAccountId: true, accessToken: true },
  });
  if (!integration?.accessToken || !integration.externalAccountId) {
    return { status: "unavailable" };
  }

  let emailIntegration;
  try {
    emailIntegration = await resolveEmailIntegration({
      organizationId: input.orgId,
      purpose: "proactive",
      threadId: null,
    });
  } catch (err) {
    if (err instanceof EmailNotConfiguredError) return { status: "unavailable" };
    throw err;
  }

  const existing = await db.storefrontChatVerification.findUnique({
    where: { sessionId_orderName: { sessionId: input.sessionId, orderName } },
    select: { attempts: true },
  });
  // A locked pair stays locked. The pure module reports `locked` rather than
  // `expired` precisely so a fresh code request is not an obvious way out of
  // the attempt ceiling; replacing the row here would hand that back.
  if (existing && existing.attempts >= VERIFICATION_MAX_ATTEMPTS) {
    return { status: "sent" };
  }

  const shopifyCtx: ShopifyContext = {
    shop: integration.externalAccountId,
    accessToken: integration.accessToken,
  };

  let order: ShopifyOrderIdentity | undefined;
  try {
    const data = await shopifyRestJson<{ orders?: ShopifyOrderIdentity[] }>(
      shopifyCtx,
      "orders.json",
      { query: { name: orderName, status: "any", limit: 1, fields: "id,name,email" } },
    );
    order = (data.orders ?? [])[0];
  } catch (err) {
    // A lookup failure is treated as a miss rather than surfaced. Returning an
    // error here would make Shopify's availability observable per order number,
    // and the shopper-visible cost of being wrong is a code that never arrives
    // — which is the same thing they see for an order that is not theirs.
    logger.error(
      { err: err instanceof Error ? err.message : String(err), orgId: input.orgId },
      "[storefront-verification] order lookup failed",
    );
    return { status: "sent" };
  }

  if (!order || !emailsMatch(suppliedEmail, order.email)) {
    return { status: "sent" };
  }

  const code = generateVerificationCode();
  await db.storefrontChatVerification.upsert({
    where: { sessionId_orderName: { sessionId: input.sessionId, orderName } },
    create: {
      organizationId: input.orgId,
      sessionId: input.sessionId,
      orderName,
      orderId: String(order.id),
      codeHash: hashVerificationCode(code),
      expiresAt: verificationExpiry(),
    },
    update: {
      orderId: String(order.id),
      codeHash: hashVerificationCode(code),
      expiresAt: verificationExpiry(),
      attempts: 0,
      verifiedAt: null,
    },
  });

  const org = await db.organization.findUnique({
    where: { id: input.orgId },
    select: { name: true },
  });
  const shopName = org?.name ?? "our shop";
  const body = buildVerificationEmail(code, shopName, orderName);

  try {
    await getEmailSender(emailIntegration).send({
      // The address ON THE ORDER, never the address the shopper typed. This one
      // line is the whole security property: someone who supplies a stranger's
      // order number with their own address gets a code delivered to the real
      // owner and learns nothing.
      to: order.email!,
      fromAddress: emailIntegration.fromEmail || emailIntegration.externalAccountId,
      fromName: shopName,
      subject: body.subject,
      text: body.text,
    });
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err), orgId: input.orgId },
      "[storefront-verification] code send failed",
    );
  }

  return { status: "sent" };
}

export interface SubmitVerificationCodeInput {
  sessionId: string;
  orgId: string;
  orderName: string;
  code: string;
}

export async function submitVerificationCode(
  input: SubmitVerificationCodeInput,
): Promise<VerificationOutcome> {
  const orderName = normalizeOrderName(input.orderName);
  const record = await db.storefrontChatVerification.findFirst({
    where: { sessionId: input.sessionId, organizationId: input.orgId, orderName },
    select: { id: true, codeHash: true, expiresAt: true, attempts: true, verifiedAt: true },
  });

  const outcome = evaluateVerificationAttempt(record, input.code);

  if (outcome.status === "verified") {
    await db.storefrontChatVerification.update({
      where: { id: record!.id },
      data: { verifiedAt: new Date() },
    });
  } else if (outcome.status === "wrong_code") {
    await db.storefrontChatVerification.update({
      where: { id: record!.id },
      data: { attempts: { increment: 1 } },
    });
  }

  return outcome;
}

// The outstanding challenge a bare code in the chat should be tested against.
// Newest first, since a shopper who asked about a second order is answering the
// most recent code they were sent.
export async function findOutstandingChallenge(
  sessionId: string,
  orgId: string,
): Promise<{ orderName: string } | null> {
  return db.storefrontChatVerification.findFirst({
    where: { sessionId, organizationId: orgId, verifiedAt: null },
    orderBy: { createdAt: "desc" },
    select: { orderName: true },
  });
}

// Exactly six digits and nothing alphabetic, so "123456" and "123 456" are
// codes while "order 123456" stays an ordinary message for the agent.
export function isBareVerificationCode(text: string): boolean {
  if (/[a-z]/i.test(text)) return false;
  return normalizeCode(text).length === VERIFICATION_CODE_LENGTH;
}
