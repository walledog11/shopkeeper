/**
 * GET    /api/integrations/twilio  — fetch current SMS config for this org
 * POST   /api/integrations/twilio  — provision a Twilio number for this org
 * DELETE /api/integrations/twilio  — release the number and remove the integration
 *
 * Platform credentials (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) live in env vars.
 * Orgs never need their own Twilio account.
 */
import { NextResponse } from "next/server";
import twilio from "twilio";
import { db } from "@clerk/db";
import { getOrCreateOrg } from "@/lib/org";
import { handleApiError } from "@/lib/api-errors";

function getTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    throw new Error("Twilio is not configured on this platform.");
  }
  return twilio(accountSid, authToken);
}

export async function GET() {
  try {
    const org = await getOrCreateOrg();
    const integration = await db.integration.findFirst({
      where: { organizationId: org.id, platform: "sms" },
      select: { id: true, externalAccountId: true, metadata: true },
    });

    if (!integration) {
      return NextResponse.json({ connected: false });
    }

    return NextResponse.json({
      connected: true,
      id: integration.id,
      phoneNumber: integration.externalAccountId,
    });
  } catch (error) {
    return handleApiError(error, "Twilio GET", "Failed to fetch SMS integration");
  }
}

export async function POST() {
  try {
    const org = await getOrCreateOrg();

    // Idempotent — return existing number if already provisioned
    const existing = await db.integration.findFirst({
      where: { organizationId: org.id, platform: "sms" },
    });
    if (existing) {
      return NextResponse.json({ connected: true, phoneNumber: existing.externalAccountId });
    }

    const client = getTwilioClient();
    const webhookUrl = `${process.env.GATEWAY_PUBLIC_URL}/webhooks/twilio`;

    // Find an available US local number with SMS capability
    const available = await client.availablePhoneNumbers("US").local.list({
      smsEnabled: true,
      limit: 1,
    });

    if (!available.length) {
      return NextResponse.json(
        { error: "No phone numbers available. Please try again shortly." },
        { status: 503 }
      );
    }

    // Purchase the number and configure the webhook immediately
    const purchased = await client.incomingPhoneNumbers.create({
      phoneNumber: available[0].phoneNumber,
      smsUrl: webhookUrl,
      smsMethod: "POST",
    });

    // Persist: externalAccountId = E.164 phone number, metadata = Twilio SID for releasing later
    await db.integration.create({
      data: {
        organizationId: org.id,
        platform: "sms",
        externalAccountId: purchased.phoneNumber,
        metadata: { twilioSid: purchased.sid },
      },
    });

    return NextResponse.json({ connected: true, phoneNumber: purchased.phoneNumber });
  } catch (error) {
    return handleApiError(error, "Twilio POST", "Failed to provision phone number");
  }
}

export async function DELETE() {
  try {
    const org = await getOrCreateOrg();

    const integration = await db.integration.findFirst({
      where: { organizationId: org.id, platform: "sms" },
    });

    if (integration) {
      // Release the number back to Twilio so we stop paying for it
      const meta = (integration.metadata ?? {}) as Record<string, string>;
      if (meta.twilioSid) {
        try {
          const client = getTwilioClient();
          await client.incomingPhoneNumbers(meta.twilioSid).remove();
        } catch (err) {
          // Log but don't block — remove from DB regardless
          console.error("[Twilio] Failed to release number:", err);
        }
      }
      await db.integration.delete({ where: { id: integration.id } });
    }

    return NextResponse.json({ disconnected: true });
  } catch (error) {
    return handleApiError(error, "Twilio DELETE", "Failed to disable SMS");
  }
}
