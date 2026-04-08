/**
 * POST /api/phone/verify-code
 * Verifies the 6-digit code and marks the phone number as verified.
 *
 * Body: { code }
 */
import { NextResponse } from "next/server";
import { db } from "@clerk/db";
import { auth } from "@clerk/nextjs/server";
import { handleApiError } from "@/lib/api-errors";
import logger from "@/lib/logger";
import { getOrCreateOrg } from "@/lib/org";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // DEV ONLY: rate limiting disabled in development
    // TODO: remove this condition before deploying to production
    if (process.env.NODE_ENV !== "development") {
      const rl = await rateLimit(`phone:verify:${userId}`, 5, 600);
      if (!rl.success) return tooManyRequests(rl.reset);
    }

    const org = await getOrCreateOrg();
    const { code } = await request.json();

    if (!code || typeof code !== "string" || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: "Invalid code format" }, { status: 400 });
    }

    // Retrieve the stored code from org settings
    const settings = (org.settings as Record<string, unknown>) ?? {};
    const stored = settings[`_phoneCode_${userId}`] as
      | { code: string; expiresAt: string; phoneNumber: string }
      | undefined;

    if (!stored) {
      return NextResponse.json(
        { error: "No pending verification. Request a new code first." },
        { status: 400 }
      );
    }

    if (new Date(stored.expiresAt) < new Date()) {
      return NextResponse.json({ error: "Code expired. Request a new one." }, { status: 400 });
    }

    if (stored.code !== code) {
      return NextResponse.json({ error: "Incorrect code." }, { status: 400 });
    }

    // Mark as verified
    await db.orgMember.upsert({
      where: { organizationId_clerkUserId: { organizationId: org.id, clerkUserId: userId } },
      update: { phoneNumber: stored.phoneNumber, phoneVerified: true },
      create: {
        organizationId: org.id,
        clerkUserId: userId,
        phoneNumber: stored.phoneNumber,
        phoneVerified: true,
      },
    });

    // Remove the temp code from org settings
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cleaned = { ...settings } as Record<string, any>;
    delete cleaned[`_phoneCode_${userId}`];
    await db.organization.update({
      where: { id: org.id },
      data: { settings: cleaned },
    });

    return NextResponse.json({ verified: true, phoneNumber: stored.phoneNumber });
  } catch (error) {
    logger.error({ err: error }, '[phone/verify-code] error');
    return handleApiError(error, "Phone verify-code POST", "Failed to verify code");
  }
}
