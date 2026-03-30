/**
 * Internal Agent API — called by the gateway when a team member sends an SMS/WhatsApp.
 *
 * Auth: x-internal-secret header (shared secret between gateway and dashboard).
 * No Clerk session required.
 *
 * Body: { orgId, instruction, orderNumber, senderPhone, clerkUserId }
 * Response: { summary, actionsPerformed, threadId }
 */
import { NextResponse } from "next/server";
import { db } from "@clerk/db";
import { buildContext, runAgent } from "@/lib/agent/runner";
import { handleApiError } from "@/lib/api-errors";

export const AGENT_TURN_PREFIX = "__clerk_agent__";

export async function POST(request: Request) {
  try {
    // Authenticate via shared secret
    const secret = request.headers.get("x-internal-secret");
    if (!secret || secret !== process.env.INTERNAL_API_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { orgId, instruction, orderNumber, senderPhone, clerkUserId } =
      await request.json();

    if (!orgId || !instruction?.trim()) {
      return NextResponse.json(
        { error: "Missing orgId or instruction" },
        { status: 400 }
      );
    }

    // Get the Shopify integration for this org (best-effort — not required)
    const shopifyIntegration = await db.integration.findFirst({
      where: { organizationId: orgId, platform: "shopify" },
    });

    let customerEmail: string = senderPhone ?? "unknown";
    let shopifyCustomerId: string | null = null;
    let customerName: string | null = null;
    let threadTag: string | null = null;

    // If an order number was provided, resolve it through Shopify to get the customer
    if (orderNumber && shopifyIntegration?.accessToken) {
      const shop = shopifyIntegration.externalAccountId;
      const token = shopifyIntegration.accessToken;
      const orderName = orderNumber.startsWith("#") ? orderNumber : `#${orderNumber}`;

      const orderRes = await fetch(
        `https://${shop}/admin/api/2024-01/orders.json?name=${encodeURIComponent(orderName)}&status=any&fields=id,name,email,customer&limit=1`,
        { headers: { "X-Shopify-Access-Token": token } }
      );

      if (orderRes.ok) {
        const orderData = await orderRes.json();
        const order = orderData.orders?.[0];
        if (order) {
          customerEmail = order.email || order.customer?.email || customerEmail;
          shopifyCustomerId = order.customer?.id ? String(order.customer.id) : null;
          customerName = order.customer
            ? `${order.customer.first_name ?? ""} ${order.customer.last_name ?? ""}`.trim() || null
            : null;
          threadTag = `Order ${orderName}`;
        }
      } else {
        console.warn(`[agent/internal] Shopify order lookup failed for ${orderNumber}`);
      }
    }

    // Upsert the customer record
    const customer = await db.customer.upsert({
      where: {
        organizationId_platformId: { organizationId: orgId, platformId: customerEmail },
      },
      update: { ...(customerName && { name: customerName }) },
      create: {
        organizationId: orgId,
        platformId: customerEmail,
        ...(customerName && { name: customerName }),
      },
    });

    // Find or create an open sms_agent thread.
    // When a Shopify customer is known, match on shopifyCustomerId.
    // Otherwise fall back to any open sms_agent thread for this customer.
    let thread = await db.thread.findFirst({
      where: {
        organizationId: orgId,
        customerId: customer.id,
        channelType: "sms_agent",
        status: "open",
        ...(shopifyCustomerId ? { shopifyCustomerId } : {}),
      },
    });

    if (!thread) {
      thread = await db.thread.create({
        data: {
          organizationId: orgId,
          customerId: customer.id,
          channelType: "sms_agent",
          status: "open",
          ...(threadTag && { tag: threadTag }),
          ...(shopifyCustomerId && { shopifyCustomerId }),
        },
      });
    }

    // Run the agent using the existing runner
    const ctx = await buildContext(thread.id, orgId);
    const result = await runAgent(ctx, instruction.trim());

    // Persist the agent turn as a note (same pattern as the UI-triggered agent)
    await db.message.create({
      data: {
        threadId: thread.id,
        senderType: "note",
        contentText: `${AGENT_TURN_PREFIX}${JSON.stringify({
          instruction: instruction.trim(),
          actions: result.actionsPerformed,
          summary: result.summary,
          senderPhone,
          clerkUserId,
          error: null,
        })}`,
      },
    });

    return NextResponse.json({
      summary: result.summary,
      actionsPerformed: result.actionsPerformed,
      threadId: thread.id,
    });
  } catch (error) {
    console.error("[agent/internal] error:", error);
    return handleApiError(error, "Agent internal POST", "Failed to run agent");
  }
}
