import type { ClerkMiddlewareOptions } from "@clerk/nextjs/server";

type CspDirectives = NonNullable<
  NonNullable<ClerkMiddlewareOptions["contentSecurityPolicy"]>["directives"]
>;

export const CSP_REPORT_ENDPOINT = "/api/security/csp-report";

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
  "style-src": ["'self'", "'unsafe-inline'", "https://*.clerk.com"],
  "img-src": ["'self'", "data:", "blob:", "https:"],
  "media-src": ["'self'", "https://*.public.blob.vercel-storage.com"],
  "font-src": ["'self'", "data:"],
  "connect-src": [
    "https://*.clerk.com",
    "https://*.clerk.accounts.dev",
    "https://*.sentry.io",
    "https://*.ingest.sentry.io",
    "https://*.ingest.us.sentry.io",
  ],
  "frame-src": ["https://*.clerk.com", "https://challenges.cloudflare.com"],
  "worker-src": ["'self'", "blob:"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'", "https://*.clerk.com"],
  "frame-ancestors": ["'self'"],
  "report-uri": [CSP_REPORT_ENDPOINT],
};
