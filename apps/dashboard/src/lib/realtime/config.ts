// Realtime is on when the gateway SSE base URL is configured. When off, the
// dashboard keeps its original (faster) polling intervals; when on, polling drops
// to a slow safety net because SSE is the primary freshness signal.
export const GATEWAY_EVENTS_URL = process.env.NEXT_PUBLIC_GATEWAY_EVENTS_URL ?? ""
export const REALTIME_ENABLED = GATEWAY_EVENTS_URL.length > 0
