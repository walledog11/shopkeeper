import { NextResponse } from "next/server"
import type { OrgSettings } from "@/types"
import { withOrgRoute } from "@/lib/api/route"
import { getCachedHomeSummary } from "@/lib/server/cached-home-summary"

export const dynamic = "force-dynamic"

export const GET = withOrgRoute(
  {
    context: "Home summary GET",
    errorMessage: "Failed to fetch home summary",
    rateLimit: { key: "home-summary", limit: 60, windowSecs: 60, scope: 'user' },
  },
  async ({ org }) => {
    const summary = await getCachedHomeSummary(org.id, org.settings as Partial<OrgSettings> | null)
    return NextResponse.json(summary)
  },
)
