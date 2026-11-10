import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { normalizeShopifyShopDomain } from "@/lib/shopify/oauth";

const APP_HOME_PATH = "/shopify";

/** Set on the app home's request so the root layout renders it for Shopify admin. */
export const SHOPIFY_APP_HOME_HEADER = "x-shopkeeper-shopify-app-home";

export function isShopifyAppHomePath(pathname: string): boolean {
  return pathname === APP_HOME_PATH || pathname.startsWith(`${APP_HOME_PATH}/`);
}

/**
 * Shopify admin frames the app home, so Clerk stays out of it: a third-party
 * iframe holds no Clerk session, and Clerk's policy refuses any framing parent.
 * The page authenticates with Shopify's ID token instead, and its policy names
 * the one shop whose admin may frame it; Shopify's security check fails a
 * wildcard. Other paths under it (the chat preview) send their own policy.
 */
export function shopifyAppHomeProxy(request: NextRequest): NextResponse {
  if (request.nextUrl.pathname !== APP_HOME_PATH) return NextResponse.next();

  const nonce = randomBytes(16).toString("base64");
  const shop = normalizeShopifyShopDomain(request.nextUrl.searchParams.get("shop"));
  const policy = [
    `frame-ancestors ${shop ? `https://${shop} ` : ""}https://admin.shopify.com`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https:${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
    "object-src 'none'",
    "base-uri 'none'",
  ].join("; ");

  // Next nonces its own scripts from the policy on the request.
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", policy);
  headers.set(SHOPIFY_APP_HOME_HEADER, "1");
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}
