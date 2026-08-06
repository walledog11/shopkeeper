import { NextResponse } from "next/server";
import { ApiError } from "@/lib/api/errors";
import { withOrgRoute } from "@/lib/api/route";
import { fetchGatewayRuntimeFlags } from "@/lib/server/gateway-runtime-flags";

export const GET = withOrgRoute(
  {
    context: "Gateway runtime flags GET",
    errorMessage: "Failed to load gateway runtime flags",
    rateLimit: { key: "gateway:runtime-flags", limit: 60, windowSecs: 60 },
  },
  async () => {
    try {
      const flags = await fetchGatewayRuntimeFlags();
      return NextResponse.json(flags);
    } catch (err) {
      if (err instanceof Error && err.message.includes("INTERNAL_API_SECRET unset")) {
        throw new ApiError("Gateway runtime flags not configured", 503);
      }
      throw err;
    }
  },
);
