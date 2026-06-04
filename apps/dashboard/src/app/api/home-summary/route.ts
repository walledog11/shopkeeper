import { NextResponse } from "next/server"
import type { OrgSettings } from "@/types"
import { withOrgRoute } from "@/lib/api/route"
import { getHomeSummary } from "@/lib/server/home-summary"

export const dynamic = "force-dynamic"

export const GET = withOrgRoute(
  {
    context: "Home summary GET",
    errorMessage: "Failed to fetch home summary",
    rateLimit: { key: "home-summary", limit: 60, windowSecs: 60 },
  },
  async ({ org }) => {
    const summary = await getHomeSummary(org.id, org.settings as Partial<OrgSettings> | null)
    return NextResponse.json(summary)
  },
)
