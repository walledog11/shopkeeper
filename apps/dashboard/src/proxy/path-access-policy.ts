export type MissingOrganizationAction = "none" | "redirect" | "json-403";

export interface PathAccessPolicy {
  requiresAuth: boolean;
  requiresOrganization: boolean;
  missingOrganizationAction: MissingOrganizationAction;
}

export const publicRoutePatterns = [
  "/",
  "/login(.*)",
  "/signup(.*)",
  "/demo-film",
  "/api/health(.*)",
  "/api/billing/webhook(.*)",
  "/api/webhooks(.*)",
  "/api/integrations/shopify/callback(.*)",
  "/api/integrations/instagram/callback(.*)",
  "/api/agent/io-send-internal(.*)",
  "/api/messages/auto-ack(.*)",
  "/api/messages/internal(.*)",
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
