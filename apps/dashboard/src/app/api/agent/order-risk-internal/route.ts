/**
 * Track 4 spike (fraud-risk monitor) , thread-less order-ops agent run.
 * Called by the gateway order-risk-monitor worker. Flag-gated: returns 404
 * unless ORDER_RISK_MONITOR_ENABLED is set, so it never runs for merchants.
 *
 * Auth: x-internal-secret header (shared gateway/dashboard secret).
 * Body: { orgId, orderId }
 * Response: { flagged, flagReason, summary }
 */
import { NextResponse } from "next/server";
import { db } from "@clerk/db";
import { resolveAgentSettings } from "@/lib/agent/settings";
import { buildOrderOpsContext } from "@/lib/agent/order-ops/context";
import { runOrderOps } from "@/lib/agent/order-ops/run";
import { BadRequestError } from "@/lib/api/errors";
import { withInternalRoute } from "@/lib/api/internal-route";
import type { OrgSettings } from "@/types";

export const maxDuration = 60;

export const POST = withInternalRoute(
  {
    context: "Agent order-risk-internal POST",
    errorMessage: "Failed to run order-risk review",
  },
  async ({ request }) => {
    if (!process.env.ORDER_RISK_MONITOR_ENABLED) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await readJsonBody(request);
    const { orgId, orderId } = parseBody(body);

    const org = await db.organization.findUnique({
      where: { id: orgId },
      select: { settings: true },
    });
    const settings = resolveAgentSettings(org?.settings as Partial<OrgSettings> | null);

    const ctx = await buildOrderOpsContext(orderId, orgId);
    const result = await runOrderOps(ctx, settings);

    return NextResponse.json({
      flagged: result.flagged,
      flagReason: result.flagReason,
      summary: result.summary,
    });
  },
);

function parseBody(body: unknown): { orgId: string; orderId: string } {
  if (typeof body !== "object" || body === null) {
    throw new BadRequestError("Validation failed", [
      { code: "invalid_body", message: "Request body must be a JSON object" },
    ]);
  }
  const { orgId, orderId } = body as Record<string, unknown>;
  if (typeof orgId !== "string" || !orgId || typeof orderId !== "string" || !orderId) {
    throw new BadRequestError("Validation failed", [
      { code: "invalid_body", message: "orgId and orderId are required" },
    ]);
  }
  return { orgId, orderId };
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new BadRequestError("Validation failed", [
      { code: "invalid_body", message: "Request body must be a JSON object" },
    ]);
  }
}
