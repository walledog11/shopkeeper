/**
 * GET /api/agent/autonomy-readiness
 *
 * Agreement rate over the last N resolved shadow decisions, split by tier and
 * tool, plus the count of would-have-auto-executed-but-human-rejected turns.
 * This is the surface watched before flipping autoExecuteMode shadow -> live.
 */
import { NextResponse } from "next/server";
import { withOrgRoute } from "@/lib/api/route";
import { getAutonomyReadiness } from "@/lib/agent/api/autonomy-shadow";
import { rateLimit, tooManyRequests } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

export const GET = withOrgRoute(
  { context: "GET /api/agent/autonomy-readiness", errorMessage: "Failed to fetch autonomy readiness" },
  async ({ org }) => {
    const rl = await rateLimit(`autonomy-readiness:${org.id}`, 30, 60);
    if (!rl.success) {
      return tooManyRequests(rl.reset);
    }

    const readiness = await getAutonomyReadiness({ orgId: org.id });
    return NextResponse.json(readiness);
  },
);
