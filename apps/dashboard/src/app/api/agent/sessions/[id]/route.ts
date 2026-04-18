import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getOrCreateOrg } from "@/lib/org";
import { handleApiError } from "@/lib/api-errors";
import { getDashboardAgentSession } from "@/lib/agent/api/sessions";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const org = await getOrCreateOrg();
    const { id } = await params;
    const session = await getDashboardAgentSession(org.id, userId, id);

    return NextResponse.json(session);
  } catch (error) {
    return handleApiError(error, "GET /api/agent/sessions/[id]", "Failed to fetch session");
  }
}
