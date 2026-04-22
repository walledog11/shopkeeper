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
import logger from "@/lib/logger";
import { getGatewayBaseUrl } from "@/lib/gateway-url";

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

export async function POST(request: Request) {
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
    const webhookUrl = `${getGatewayBaseUrl({ required: true })}/webhooks/twilio`;

    const body = await request.json().catch(() => ({}));
    const providedNumber: string | undefined = body.phoneNumber;

    let twilioSid: string;
    let e164Number: string;

    if (providedNumber) {
      // Use an existing Twilio number from the account (e.g. trial accounts can't buy new ones).
      // Look it up by number to get the SID, then configure its webhook.
      const matches = await client.incomingPhoneNumbers.list({ phoneNumber: providedNumber, limit: 1 });
      if (!matches.length) {
        return NextResponse.json(
          { error: "That number wasn't found in your Twilio account. Make sure it's in E.164 format (e.g. +15551234567)." },
          { status: 400 }
        );
      }
      await client.incomingPhoneNumbers(matches[0].sid).update({
        smsUrl: webhookUrl,
        smsMethod: "POST",
      });
      twilioSid = matches[0].sid;
      e164Number = matches[0].phoneNumber;
    } else {
      // Purchase a new number (requires a paid Twilio account).
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
      const purchased = await client.incomingPhoneNumbers.create({
        phoneNumber: available[0].phoneNumber,
        smsUrl: webhookUrl,
        smsMethod: "POST",
      });
      twilioSid = purchased.sid;
      e164Number = purchased.phoneNumber;
    }

    await db.integration.create({
      data: {
        organizationId: org.id,
        platform: "sms",
        externalAccountId: e164Number,
        metadata: { twilioSid },
      },
    });

    return NextResponse.json({ connected: true, phoneNumber: e164Number });
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
          logger.error({ err }, '[Twilio] Failed to release number');
        }
      }
      await db.integration.delete({ where: { id: integration.id } });
    }

    return NextResponse.json({ disconnected: true });
  } catch (error) {
    return handleApiError(error, "Twilio DELETE", "Failed to disable SMS");
  }
}
