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
import { resolveAgentSettings } from "@clerk/agent/settings";
import { buildOrderOpsContext } from "@/lib/agent/order-ops/context";
import { runOrderOps } from "@/lib/agent/order-ops/run";
import { readRequiredJsonObject } from "@/lib/api/body";
import { withInternalRoute } from "@/lib/api/internal-route";
import { parseAgentOrderRiskInternalBody } from "@/lib/agent/api/validation";
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

    const { orgId, orderId } = parseAgentOrderRiskInternalBody(await readRequiredJsonObject(request, {
      malformed: {
        message: "Validation failed",
        details: [{ code: "invalid_body", message: "Request body must be a JSON object" }],
      },
      empty: {
        message: "Validation failed",
        details: [{ code: "invalid_body", message: "Request body must be a JSON object" }],
      },
      object: {
        message: "Validation failed",
        details: [{ code: "invalid_body", message: "Request body must be a JSON object" }],
      },
    }));

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
