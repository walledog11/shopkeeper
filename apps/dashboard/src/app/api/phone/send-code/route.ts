/**
 * POST /api/phone/send-code
 * Sends a 6-digit verification code to the given phone number via Twilio SMS.
 * Stores the code in the org settings JSON and expires it after 10 minutes.
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
import logger from "@/lib/logger";

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const memberKey = { organizationId: org.id, clerkUserId: userId };
    const existingMemberRecord = await db.orgMember.findUnique({ where: { organizationId_clerkUserId: memberKey } });
    if (existingMemberRecord) {
      await db.orgMember.update({ where: { id: existingMemberRecord.id }, data: { phoneNumber, phoneVerified: false } });
    } else {
      try {
        await db.orgMember.create({ data: { organizationId: org.id, clerkUserId: userId, phoneNumber, phoneVerified: false } });
      } catch (err) {
        if ((err as { code?: string }).code !== 'P2002') throw err;
        const race = (await db.orgMember.findUnique({ where: { organizationId_clerkUserId: memberKey } }))!;
        await db.orgMember.update({ where: { id: race.id }, data: { phoneNumber, phoneVerified: false } });
      }
    }

    // Store the code in org settings keyed by userId — avoids a dedicated column
    const settings = (org.settings as Record<string, unknown>) ?? {};
    await db.organization.update({
      where: { id: org.id },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { settings: { ...settings, [`_phoneCode_${userId}`]: { code, expiresAt: expiresAt.toISOString(), phoneNumber } } as any },
    });

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_FROM_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
      logger.error('[phone/send-code] Twilio env vars missing');
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
    return handleApiError(error, "Phone send-code POST", "Failed to send verification code");
  }
}
