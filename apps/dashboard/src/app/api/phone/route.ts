/**
 * GET /api/phone
 * Returns the current user's phone verification status.
 */
import { NextResponse } from "next/server";
import { db } from "@clerk/db";
import { auth } from "@clerk/nextjs/server";
import { getOrCreateOrg } from "@/lib/server/org";
import { handleApiError } from "@/lib/api/errors";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const org = await getOrCreateOrg();

    const member = await db.orgMember.findUnique({
      where: { organizationId_clerkUserId: { organizationId: org.id, clerkUserId: userId } },
      select: { phoneNumber: true, phoneVerified: true },
    });

    return NextResponse.json({
      phoneNumber: member?.phoneNumber ?? null,
      phoneVerified: member?.phoneVerified ?? false,
    });
  } catch (error) {
    return handleApiError(error, "Phone GET", "Failed to fetch phone status");
  }
}

/**
 * DELETE /api/phone
 * Removes the current user's phone registration.
 */
export async function DELETE() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const org = await getOrCreateOrg();

    await db.orgMember.updateMany({
      where: { organizationId: org.id, clerkUserId: userId },
      data: { phoneNumber: null, phoneVerified: false },
    });

    return NextResponse.json({ removed: true });
  } catch (error) {
    return handleApiError(error, "Phone DELETE", "Failed to remove phone");
  }
}
