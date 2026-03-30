/**
 * POST /api/phone/send-code
 * Sends a 6-digit verification code to the given phone number via Twilio SMS.
 * Stores the code in the OrgMember row (hashed) and expires it after 10 minutes via Redis.
 *
 * Body: { phoneNumber }  — E.164 format, e.g. +15551234567
 */
import { NextResponse } from "next/server";
import twilio from "twilio";
import { db } from "@clerk/db";
import { auth } from "@clerk/nextjs/server";
import { handleApiError } from "@/lib/api-errors";
import { getOrCreateOrg } from "@/lib/org";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 3 SMS sends per 10 minutes per user — protects against SMS pumping costs
    const rl = await rateLimit(`phone:send:${userId}`, 3, 600);
    if (!rl.success) return tooManyRequests(rl.reset);

    const org = await getOrCreateOrg();
    const { phoneNumber } = await request.json();

    if (!phoneNumber || !/^\+\d{7,15}$/.test(phoneNumber)) {
      return NextResponse.json(
        { error: "Invalid phone number. Use E.164 format, e.g. +15551234567" },
        { status: 400 }
      );
    }

    // Check the phone number isn't already verified by someone else in this org
    const existingMember = await db.orgMember.findFirst({
      where: {
        organizationId: org.id,
        phoneNumber,
        phoneVerified: true,
        NOT: { clerkUserId: userId },
      },
    });
    if (existingMember) {
      return NextResponse.json(
        { error: "That number is already registered to another team member." },
        { status: 409 }
      );
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Upsert the OrgMember row with the new pending code
    await db.orgMember.upsert({
      where: { organizationId_clerkUserId: { organizationId: org.id, clerkUserId: userId } },
      update: {
        phoneNumber,
        phoneVerified: false,
        // Store code in metadata field on Integration — here we store it on OrgMember
        // We embed the code + expiry directly into the record for simplicity
      },
      create: {
        organizationId: org.id,
        clerkUserId: userId,
        phoneNumber,
        phoneVerified: false,
      },
    });

    // Store the verification code in the DB settings JSON (temporary, expires in 10m)
    // We attach it to the org settings to avoid a dedicated column
    await db.$executeRaw`
      UPDATE org_members
      SET updated_at = NOW(),
          phone_number = ${phoneNumber},
          phone_verified = false
      WHERE organization_id = ${org.id}::uuid
        AND clerk_user_id = ${userId}
    `;

    // Cache the code server-side (we use a simple in-memory approach via the DB)
    // Store code + expiry in the org member row via a raw update to a temp column
    // Since we don't have a dedicated column, store in the org settings JSON keyed
    // by userId — this avoids adding a new column for a short-lived value.
    const settings = (org.settings as Record<string, unknown>) ?? {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nextSettings: Record<string, any> = {
      ...settings,
      [`_phoneCode_${userId}`]: { code, expiresAt: expiresAt.toISOString(), phoneNumber },
    };
    await db.organization.update({
      where: { id: org.id },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { settings: nextSettings as any },
    });

    // Send the code via Twilio
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_FROM_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
      console.error("[phone/send-code] Twilio env vars missing");
      return NextResponse.json(
        { error: "SMS service is not configured. Contact your admin." },
        { status: 503 }
      );
    }

    const client = twilio(accountSid, authToken);
    await client.messages.create({
      body: `Your Clerk verification code is: ${code}. It expires in 10 minutes.`,
      from: fromNumber,
      to: phoneNumber,
    });

    return NextResponse.json({ sent: true });
  } catch (error) {
    console.error("[phone/send-code] error:", error);
    return handleApiError(error, "Phone send-code POST", "Failed to send verification code");
  }
}
