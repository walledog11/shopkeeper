import type { ShippedOrderShipment } from "./orders.js";
import type { ShipmentTrackingEvent, ShipmentTrackingSnapshot } from "./shipment-alerts.js";

export type ShipmentTrackingTier = "degraded" | "full";
export type ShipmentTrackingSource = "shopify_degraded" | "carrier";

/** Milestone 6 acceptance: degraded USPS stall detection uses a six-day window. */
export const DEGRADED_STALL_AFTER_MS = 6 * 24 * 3_600_000;

export type FullTierCarrierTrackingProvider = (
  trackingNumber: string,
  trackingCompany: string | null,
) => Promise<ShipmentTrackingSnapshot | null>;

export interface ShopifyFulfillmentTrackingInput {
  shipmentStatus: string | null;
  statusUpdatedAt: string | null;
  fulfillmentCreatedAt: string | null;
  trackingCompany: string | null;
}

export interface ResolvedShipmentTracking {
  snapshot: ShipmentTrackingSnapshot;
  source: ShipmentTrackingSource;
  tier: ShipmentTrackingTier;
}

function normalizeText(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

export function isUspsCarrier(trackingCompany: string | null | undefined): boolean {
  const normalized = normalizeText(trackingCompany);
  return (
    normalized.includes("usps")
    || normalized.includes("united states postal service")
    || normalized.includes("u.s. postal service")
  );
}

export function isFullTierCarrier(trackingCompany: string | null | undefined): boolean {
  const normalized = normalizeText(trackingCompany);
  return normalized.includes("ups")
    || normalized.includes("fedex")
    || normalized.includes("dhl");
}

export function resolveShipmentTrackingTier(
  trackingCompany: string | null | undefined,
  fullTierProviderConfigured = false,
): ShipmentTrackingTier {
  if (isUspsCarrier(trackingCompany)) return "degraded";
  if (fullTierProviderConfigured && isFullTierCarrier(trackingCompany)) return "full";
  return "degraded";
}

function formatShopifyStatusLabel(status: string): string {
  return status.trim().replaceAll("_", " ");
}

export function buildShopifyDegradedTrackingSnapshot(
  input: ShopifyFulfillmentTrackingInput,
): ShipmentTrackingSnapshot | null {
  const status = input.shipmentStatus?.trim() || null;
  if (!status) return null;
  if (normalizeText(status) === "delivered") return null;

  const lastActivityIso = input.statusUpdatedAt ?? input.fulfillmentCreatedAt ?? null;
  const carrier = input.trackingCompany?.trim();
  const carrierLabel = carrier ? ` via ${carrier}` : "";
  const statusSummary = `Shopify fulfillment record${carrierLabel}: ${formatShopifyStatusLabel(status)} (no carrier scan history)`;

  const events: ShipmentTrackingEvent[] = lastActivityIso
    ? [{ message: "Last Shopify fulfillment update", datetime: lastActivityIso }]
    : [];

  return {
    status,
    statusSummary,
    events,
  };
}

export function resolveShipmentTracking(
  shipment: ShippedOrderShipment,
  fullTierProvider: FullTierCarrierTrackingProvider | null = null,
): Promise<ResolvedShipmentTracking | null> {
  const tier = resolveShipmentTrackingTier(shipment.trackingCompany, fullTierProvider != null);
  if (tier === "full" && fullTierProvider) {
    return fullTierProvider(shipment.trackingNumber, shipment.trackingCompany).then((snapshot) => {
      if (!snapshot) return null;
      return { snapshot, source: "carrier", tier: "full" };
    });
  }

  const snapshot = buildShopifyDegradedTrackingSnapshot({
    shipmentStatus: shipment.shipmentStatus,
    statusUpdatedAt: shipment.statusUpdatedAt,
    fulfillmentCreatedAt: shipment.fulfillmentCreatedAt,
    trackingCompany: shipment.trackingCompany,
  });
  if (!snapshot) return Promise.resolve(null);
  return Promise.resolve({ snapshot, source: "shopify_degraded", tier: "degraded" });
}

export function createShipmentTrackingResolver(
  fullTierProvider: FullTierCarrierTrackingProvider | null = null,
): (shipment: ShippedOrderShipment) => Promise<ResolvedShipmentTracking | null> {
  return (shipment) => resolveShipmentTracking(shipment, fullTierProvider);
}
