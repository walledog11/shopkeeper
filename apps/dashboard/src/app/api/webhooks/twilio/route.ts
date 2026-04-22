/**
 * Twilio webhook proxy — receives inbound WhatsApp/SMS from Twilio and
 * forwards to the gateway over localhost, so only one ngrok tunnel is needed.
 *
 * Validates the Twilio signature here so the gateway doesn't need a public URL.
 * Forwards with x-internal-secret so the gateway trusts and skips re-validation.
 */
import twilio from "twilio";
import logger from "@/lib/logger";
import { getGatewayBaseUrl } from "@/lib/gateway-url";

export async function POST(request: Request) {
  const rawBody = await request.text();

  // Validate Twilio signature if configured
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const webhookUrl = process.env.TWILIO_WEBHOOK_URL;

  if (authToken && webhookUrl) {
    const signature = request.headers.get("x-twilio-signature") || "";
    const params = Object.fromEntries(new URLSearchParams(rawBody));
    const isValid = twilio.validateRequest(authToken, signature, webhookUrl, params);
    if (!isValid) {
      logger.warn('[Twilio proxy] Signature validation failed — rejecting');
      return new Response("Forbidden", { status: 403 });
    }
  }

  const gatewayUrl = getGatewayBaseUrl({ required: true });

  const gatewayRes = await fetch(`${gatewayUrl}/webhooks/twilio`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "x-internal-secret": process.env.INTERNAL_API_SECRET || "",
    },
    body: rawBody,
  });

  const responseText = await gatewayRes.text();
  return new Response(responseText, {
    status: gatewayRes.status,
    headers: { "Content-Type": gatewayRes.headers.get("Content-Type") || "text/xml" },
  });
}
