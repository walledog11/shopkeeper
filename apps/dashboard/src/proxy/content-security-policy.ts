import type { ClerkMiddlewareOptions } from "@clerk/nextjs/server";
import { GATEWAY_EVENTS_URL } from "@/lib/realtime/config";

type CspDirectives = NonNullable<
  NonNullable<ClerkMiddlewareOptions["contentSecurityPolicy"]>["directives"]
>;

export const CSP_REPORT_ENDPOINT = "/api/security/csp-report";

// RealtimeProvider opens an EventSource against the gateway, a different origin
// from the dashboard. Derived from the same env var as REALTIME_ENABLED so the
// two can never disagree: a hardcoded host would silently block every SSE
// connection after polling had already been slowed to its realtime interval.
function gatewayEventsOrigin(): string[] {
  if (!GATEWAY_EVENTS_URL) return [];
  try {
    return [new URL(GATEWAY_EVENTS_URL).origin];
  } catch {
    return [];
  }
}

/**
 * Merged into Clerk's defaults, which already cover its own frontend API,
 * telemetry and script hosts. `strict: true` drops the default `http:`/`https:`
 * script sources and adds the nonce plus 'strict-dynamic'; the remaining
 * `'unsafe-inline'` is the CSP2 fallback that 'strict-dynamic' makes CSP3
 * browsers ignore.
 */
export const cspDirectives: CspDirectives = {
  "default-src": ["'self'"],
  "script-src": ["https://*.clerk.com", "https://*.clerk.accounts.dev"],
  "style-src": ["'self'", "'unsafe-inline'", "https://*.clerk.com", "https://fonts.googleapis.com"],
  "img-src": ["'self'", "data:", "blob:", "https:"],
  "media-src": ["'self'", "https://*.public.blob.vercel-storage.com"],
  "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],
  "connect-src": [
    "https://*.clerk.com",
    "https://*.clerk.accounts.dev",
    "https://*.sentry.io",
    "https://*.ingest.sentry.io",
    "https://*.ingest.us.sentry.io",
    ...gatewayEventsOrigin(),
  ],
  "frame-src": ["https://*.clerk.com", "https://challenges.cloudflare.com"],
  "worker-src": ["'self'", "blob:"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'", "https://*.clerk.com"],
  "frame-ancestors": ["'self'"],
  "report-uri": [CSP_REPORT_ENDPOINT],
};
