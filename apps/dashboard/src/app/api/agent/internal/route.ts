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

    if (!orgId || !instruction?.trim() || !orderNumber) {
      return NextResponse.json(
        { error: "Missing orgId, instruction, or orderNumber" },
        { status: 400 }
      );
    }

    // Get the Shopify integration for this org
    const shopifyIntegration = await db.integration.findFirst({
      where: { organizationId: orgId, platform: "shopify" },
    });

    if (!shopifyIntegration?.accessToken) {
      return NextResponse.json(
        { error: "No Shopify integration connected for this org" },
        { status: 422 }
      );
    }

    const shop = shopifyIntegration.externalAccountId;
    const token = shopifyIntegration.accessToken;

    // Look up the Shopify order to get the customer's email + Shopify customer ID
    const orderName = orderNumber.startsWith("#") ? orderNumber : `#${orderNumber}`;
    const orderRes = await fetch(
      `https://${shop}/admin/api/2024-01/orders.json?name=${encodeURIComponent(orderName)}&status=any&fields=id,name,email,customer&limit=1`,
      { headers: { "X-Shopify-Access-Token": token } }
    );

    if (!orderRes.ok) {
      const err = await orderRes.text();
      console.error(`[agent/internal] Shopify order lookup failed: ${err}`);
      return NextResponse.json(
        { error: `Could not look up order ${orderName} on Shopify` },
        { status: 422 }
      );
    }

    const orderData = await orderRes.json();
    const order = orderData.orders?.[0];

    if (!order) {
      return NextResponse.json(
        { error: `Order ${orderName} not found in Shopify` },
        { status: 404 }
      );
    }

    const customerEmail: string =
      order.email || order.customer?.email || `unknown-${order.id}@shopify`;
    const shopifyCustomerId: string | null = order.customer?.id
      ? String(order.customer.id)
      : null;
    const customerName: string | null =
      order.customer
        ? `${order.customer.first_name ?? ""} ${order.customer.last_name ?? ""}`.trim() || null
        : null;

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

    // Find or create an sms_agent thread for this customer + order
    // We match on shopifyCustomerId so the same order always maps to the same thread
    let thread = shopifyCustomerId
      ? await db.thread.findFirst({
          where: {
            organizationId: orgId,
            customerId: customer.id,
            channelType: "sms_agent",
            shopifyCustomerId,
            status: "open",
          },
        })
      : null;

    if (!thread) {
      thread = await db.thread.create({
        data: {
          organizationId: orgId,
          customerId: customer.id,
          channelType: "sms_agent",
          status: "open",
          tag: `Order ${orderName}`,
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
