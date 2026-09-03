export type MissingOrganizationAction = "none" | "redirect" | "json-403";

export interface PathAccessPolicy {
  requiresAuth: boolean;
  requiresOrganization: boolean;
  missingOrganizationAction: MissingOrganizationAction;
}

export const publicRoutePatterns = [
  "/",
  "/privacy",
  "/terms",
  "/data-deletion",
  "/product(.*)",
  "/sitemap.xml",
  "/login(.*)",
  "/signup(.*)",
  "/api/health(.*)",
  "/api/security/csp-report",
  "/api/billing/webhook(.*)",
  "/api/webhooks(.*)",
  "/api/integrations/shopify/callback(.*)",
  "/api/integrations/instagram/callback(.*)",
  "/api/integrations/gmail/callback(.*)",
  "/api/agent/io-send-internal(.*)",
  "/api/messages/auto-ack(.*)",
  "/api/messages/internal(.*)",
  // Gateway-to-dashboard call carrying `x-internal-secret`, not a Clerk
  // session. Without this the proxy 401s it before withInternalRoute can check
  // the secret, so every integration disconnect fails its provider cleanup.
  "/api/integrations/internal(.*)",
  // First shopper-facing public route on this list — everything else here is a
  // webhook or an OAuth callback. Authentication is Shopify's app-proxy
  // signature plus a session bearer token, enforced in the routes themselves.
  "/api/storefront-chat/proxy(.*)",
] as const;

const signedInNoOrgRoutePatterns = [
  "/select-org(.*)",
  "/create-workspace(.*)",
  "/onboarding(.*)",
] as const;

const patternRegexCache = new Map<string, RegExp>();

function getPatternRegex(pattern: string): RegExp {
  let regex = patternRegexCache.get(pattern);
  if (!regex) {
    regex = new RegExp(`^${pattern}$`);
    patternRegexCache.set(pattern, regex);
  }
  return regex;
}

export function matchesPathname(pathname: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => getPatternRegex(pattern).test(pathname));
}

export function isPublicPath(pathname: string): boolean {
  return matchesPathname(pathname, publicRoutePatterns);
}

function isSignedInNoOrgPath(pathname: string): boolean {
  return matchesPathname(pathname, signedInNoOrgRoutePatterns);
}

export function isApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

export function getPathAccessPolicy(pathname: string): PathAccessPolicy {
  if (isPublicPath(pathname)) {
    return {
      requiresAuth: false,
      requiresOrganization: false,
      missingOrganizationAction: "none",
    };
  }

  if (isSignedInNoOrgPath(pathname)) {
    return {
      requiresAuth: true,
      requiresOrganization: false,
      missingOrganizationAction: "none",
    };
  }

  if (isApiPath(pathname)) {
    return {
      requiresAuth: true,
      requiresOrganization: true,
      missingOrganizationAction: "json-403",
    };
  }

  return {
    requiresAuth: true,
    requiresOrganization: true,
    missingOrganizationAction: "redirect",
  };
}
