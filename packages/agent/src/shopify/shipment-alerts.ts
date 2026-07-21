export type ShipmentAlertKind = "exception" | "stalled";

export interface ShipmentTrackingEvent {
  message: string | null;
  datetime: string | null;
}

export interface ShipmentTrackingSnapshot {
  status: string | null;
  statusSummary: string | null;
  events: ShipmentTrackingEvent[];
}

const EXCEPTION_STATUS_MARKERS = [
  "exception",
  "return to sender",
  "returned to sender",
  "undeliverable",
  "delivery attempt failed",
  "no access to delivery location",
  "refused",
  "damaged",
  "weather delay",
  "held",
];

const IN_TRANSIT_MARKERS = [
  "in transit",
  "out for delivery",
  "accepted",
  "arrived",
  "departed",
  "processing",
];

function normalizeText(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function latestEventTimestamp(events: ShipmentTrackingEvent[]): Date | null {
  let latest: Date | null = null;
  for (const event of events) {
    if (!event.datetime) continue;
    const parsed = new Date(event.datetime);
    if (Number.isNaN(parsed.getTime())) continue;
    if (!latest || parsed > latest) latest = parsed;
  }
  return latest;
}

function containsMarker(haystack: string, markers: string[]): boolean {
  return markers.some((marker) => haystack.includes(marker));
}

export function classifyShipmentAlert(
  snapshot: ShipmentTrackingSnapshot,
  options: { now?: Date; stalledAfterMs?: number } = {},
): ShipmentAlertKind | null {
  const now = options.now ?? new Date();
  const stalledAfterMs = options.stalledAfterMs ?? 5 * 24 * 3_600_000;
  const statusText = [snapshot.status, snapshot.statusSummary]
    .map(normalizeText)
    .filter(Boolean)
    .join(" ");

  if (containsMarker(statusText, EXCEPTION_STATUS_MARKERS)) {
    return "exception";
  }

  for (const event of snapshot.events) {
    const eventText = normalizeText(event.message);
    if (containsMarker(eventText, EXCEPTION_STATUS_MARKERS)) {
      return "exception";
    }
  }

  if (normalizeText(snapshot.status) === "delivered") {
    return null;
  }

  const inTransit = containsMarker(statusText, IN_TRANSIT_MARKERS)
    || snapshot.events.length > 0;
  if (!inTransit) return null;

  const lastActivity = latestEventTimestamp(snapshot.events) ?? now;
  if (now.getTime() - lastActivity.getTime() >= stalledAfterMs) {
    return "stalled";
  }

  return null;
}

export function formatDeliveryExceptionNotification(input: {
  customerName: string | null;
  orderId: string;
  trackingNumber: string | null;
  issueKind: ShipmentAlertKind;
  statusSummary: string | null;
}): string {
  const customer = input.customerName?.trim() || "A customer";
  const tracking = input.trackingNumber?.trim() || "their shipment";
  const detail = input.statusSummary?.trim();
  if (input.issueKind === "stalled") {
    return `${customer}'s order ${input.orderId} looks stalled (${tracking} has had no recent movement). I can draft a proactive heads-up for your approval when the plan lands.`;
  }
  const suffix = detail ? ` (${detail})` : "";
  return `${customer}'s order ${input.orderId} has a delivery exception on ${tracking}${suffix}. I can draft a proactive heads-up for your approval when the plan lands.`;
}
