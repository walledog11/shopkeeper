import type { GetOrderTrackingInput } from "../tools";
import { formatShopifyToolError, shopifyRestJson, type ShopifyContext } from "./client";
import { toolError, toolNotFound, toolOk, type ToolResult } from "../tools/result";
import type { ShopifyFulfillment } from "./types";
import { requireNumericId } from "./validation";

type USPSAccessToken = {
  token: string;
  expiresAt: number;
};

type USPSEvent = {
  eventType?: string;
  eventTimestamp?: string;
  eventCity?: string;
  eventState?: string;
  eventZIP?: string;
};

type TrackingShipment = {
  fulfillment_status: string;
  shipment_status: string | null;
  tracking_number: string | null;
  tracking_company: string | null;
  tracking_url: string | null;
  note?: string;
};

let uspsAccessToken: USPSAccessToken | null = null;

function isUSPSCarrier(carrier: string | null | undefined): boolean {
  const normalized = carrier?.toLowerCase() ?? "";
  return (
    normalized.includes("usps") ||
    normalized.includes("united states postal service") ||
    normalized.includes("u.s. postal service")
  );
}

function fulfillmentTrackingNumbers(fulfillment: ShopifyFulfillment): string[] {
  const trackingNumbers = fulfillment.tracking_numbers?.filter(Boolean) ?? [];
  if (trackingNumbers.length > 0) return trackingNumbers;
  return fulfillment.tracking_number ? [fulfillment.tracking_number] : [];
}

function fulfillmentTrackingUrls(fulfillment: ShopifyFulfillment): string[] {
  const trackingUrls = fulfillment.tracking_urls?.filter(Boolean) ?? [];
  if (trackingUrls.length > 0) return trackingUrls;
  return fulfillment.tracking_url ? [fulfillment.tracking_url] : [];
}

async function fetchJson(url: string, init: RequestInit): Promise<unknown> {
  const res = await fetch(url, init);
  const text = await res.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!res.ok) {
    throw new Error(typeof payload === "string" ? payload : JSON.stringify(payload));
  }

  return payload;
}

async function getUspsAccessToken(): Promise<string | null> {
  const clientId = process.env.USPS_CLIENT_ID;
  const clientSecret = process.env.USPS_CLIENT_SECRET;

  if (!clientId || !clientSecret) return null;

  if (uspsAccessToken && uspsAccessToken.expiresAt > Date.now() + 60_000) {
    return uspsAccessToken.token;
  }

  const tokenData = await fetchJson("https://apis.usps.com/oauth2/v3/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  }) as { access_token?: string; expires_in?: number };

  if (!tokenData.access_token) return null;

  uspsAccessToken = {
    token: tokenData.access_token,
    expiresAt: Date.now() + (tokenData.expires_in ?? 300) * 1000,
  };

  return uspsAccessToken.token;
}

export async function getOrderTracking(
  input: GetOrderTrackingInput,
  ctx: ShopifyContext
): Promise<ToolResult> {
  try {
    const orderId = requireNumericId(input.order_id, "order_id");
    const data = await shopifyRestJson<{ fulfillments?: ShopifyFulfillment[] }>(
      ctx,
      `orders/${orderId}/fulfillments.json`
    );

    const fulfillments = data.fulfillments ?? [];
    if (fulfillments.length === 0) {
      return toolNotFound("This order has not been fulfilled yet - no tracking information is available.");
    }

    const shipments: TrackingShipment[] = fulfillments.flatMap((fulfillment): TrackingShipment[] => {
      const numbers = fulfillmentTrackingNumbers(fulfillment);
      const urls = fulfillmentTrackingUrls(fulfillment);

      if (numbers.length === 0) {
        return [{
          fulfillment_status: fulfillment.status,
          shipment_status: fulfillment.shipment_status ?? null,
          tracking_number: null,
          tracking_company: fulfillment.tracking_company ?? null,
          tracking_url: urls[0] ?? null,
          note: "Fulfillment has no tracking number.",
        }];
      }

      return numbers.map((trackingNumber, index) => ({
        fulfillment_status: fulfillment.status,
        shipment_status: fulfillment.shipment_status ?? null,
        tracking_number: trackingNumber,
        tracking_company: fulfillment.tracking_company ?? null,
        tracking_url: urls[index] ?? urls[0] ?? null,
      }));
    });

    const uspsShipment = shipments.find(
      (shipment) => shipment.tracking_number && isUSPSCarrier(shipment.tracking_company)
    );

    if (!uspsShipment?.tracking_number) {
      return toolOk(JSON.stringify({
        shipments,
        note: "Live tracking events are only available for USPS shipments. Use each carrier tracking URL for carrier updates.",
      }));
    }

    let accessToken: string | null;
    try {
      accessToken = await getUspsAccessToken();
    } catch {
      return toolOk(JSON.stringify({
        shipments,
        note: "Live tracking unavailable - USPS authentication failed.",
      }));
    }

    if (!accessToken) {
      return toolOk(JSON.stringify({
        shipments,
        note: "Live tracking unavailable - USPS API is not configured.",
      }));
    }

    try {
      const trackData = await fetchJson(
        `https://apis.usps.com/tracking/v3/tracking/${encodeURIComponent(uspsShipment.tracking_number)}?expand=DETAIL`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      ) as {
        statusCategory?: string;
        status?: string;
        statusSummary?: string;
        trackingEvents?: USPSEvent[];
      };

      return toolOk(JSON.stringify({
        shipments,
        live_usps_tracking: {
          tracking_number: uspsShipment.tracking_number,
          status: trackData.statusCategory ?? trackData.status ?? uspsShipment.shipment_status ?? uspsShipment.fulfillment_status,
          status_summary: trackData.statusSummary ?? null,
          events: (trackData.trackingEvents ?? []).slice(0, 10).map((event) => ({
            message: event.eventType ?? null,
            datetime: event.eventTimestamp ?? null,
            location: [event.eventCity, event.eventState, event.eventZIP].filter(Boolean).join(", ") || null,
          })),
        },
      }));
    } catch {
      return toolOk(JSON.stringify({
        shipments,
        note: "Live tracking lookup failed - USPS data unavailable.",
      }));
    }
  } catch (err) {
    return toolError(formatShopifyToolError("could not fetch fulfillments", err));
  }
}
