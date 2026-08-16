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

// Every integration connect starts as a same-origin form POST that 303s to the
// provider's authorize page. Chrome checks each redirect hop of a form
// submission against `form-action`, so the authorize origins belong here or the
// hop is blocked and the popup dies on its spinner. TikTok Shop's authorize host
// is env-driven with no default, so it is derived rather than hardcoded.
function providerAuthorizeOrigins(): string[] {
  const origins = [
    'https://accounts.google.com',
    'https://*.myshopify.com',
    'https://admin.shopify.com',
    'https://www.instagram.com',
    'https://www.facebook.com',
  ];

  const tiktokAuthUrl = process.env.TIKTOK_SHOP_AUTH_URL ?? process.env.TIKTOK_SHOP_AUTHORIZE_URL;
  if (tiktokAuthUrl) {
    try {
      origins.push(new URL(tiktokAuthUrl).origin);
    } catch {
      // A malformed value is already rejected by the TikTok config loader.
    }
  }

  return origins;
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
  "form-action": ["'self'", "https://*.clerk.com", ...providerAuthorizeOrigins()],
  "frame-ancestors": ["'self'"],
  "report-uri": [CSP_REPORT_ENDPOINT],
};
