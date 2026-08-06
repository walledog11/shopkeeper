import { matchesPathname } from "@/proxy/path-access-policy";

/**
 * App surfaces that must run on the `APP_URL` host. Provider redirect URIs are
 * built from `APP_URL`, and the `*_oauth_*` handshake cookies are host-only, so
 * a merchant browsing a sibling host (the marketing apex) sets those cookies on
 * one host and gets the provider hop back on another — the cookies vanish and
 * every connect attempt fails the state check.
 */
const CANONICAL_HOST_PATH_PATTERNS = [
  "/dashboard(.*)",
  "/onboarding(.*)",
  "/select-org(.*)",
  "/create-workspace(.*)",
  "/login(.*)",
  "/signup(.*)",
  "/api/integrations(.*)",
] as const;

function readCanonicalUrl(): URL | null {
  const appUrl = process.env.APP_URL?.trim();
  if (!appUrl) return null;
  try {
    return new URL(appUrl);
  } catch {
    return null;
  }
}

/**
 * Only hosts under the canonical host's parent domain are rewritten, which
 * keeps preview deployments and `*.vercel.app` alone. A canonical host with no
 * subdomain of its own has no siblings to claim — without the label floor,
 * `useshopkeeper.com` would match every other `.com`.
 */
function isSiblingHost(host: string, canonicalHost: string): boolean {
  const labels = canonicalHost.split(".");
  if (labels.length < 3) return false;
  const parentDomain = labels.slice(1).join(".");
  return host === parentDomain || host.endsWith(`.${parentDomain}`);
}

export function getCanonicalHostRedirect(
  host: string | null | undefined,
  pathname: string,
  search: string,
): string | null {
  if (!host) return null;

  const canonical = readCanonicalUrl();
  if (!canonical || host === canonical.host) return null;
  if (!isSiblingHost(host, canonical.host)) return null;
  if (!matchesPathname(pathname, CANONICAL_HOST_PATH_PATTERNS)) return null;

  return new URL(`${pathname}${search}`, canonical.origin).toString();
}
