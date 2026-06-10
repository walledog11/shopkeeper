import { describe, expect, it } from "vitest";
import {
  getPathAccessPolicy,
  isPublicPath,
  matchesPathname,
  publicRoutePatterns,
} from "./path-access-policy";

describe("proxy path access policy", () => {
  it("marks marketing and auth entrypoints as public", () => {
    expect(isPublicPath("/")).toBe(true);
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/signup")).toBe(true);
  });

  it("keeps inbound machine endpoints public", () => {
    expect(isPublicPath("/api/health")).toBe(true);
    expect(isPublicPath("/api/billing/webhook")).toBe(true);
    expect(isPublicPath("/api/webhooks/clerk")).toBe(true);
    expect(isPublicPath("/api/webhooks/email")).toBe(true);
    expect(isPublicPath("/api/integrations/shopify/callback")).toBe(true);
    expect(isPublicPath("/api/agent/io-send-internal")).toBe(true);
    expect(isPublicPath("/api/messages/auto-ack")).toBe(true);
    expect(isPublicPath("/api/messages/internal")).toBe(true);
  });

  it("requires auth but not an org for signed-in onboarding and workspace selection pages", () => {
    expect(getPathAccessPolicy("/onboarding")).toEqual({
      requiresAuth: true,
      requiresOrganization: false,
      missingOrganizationAction: "none",
    });
    expect(getPathAccessPolicy("/select-org")).toEqual({
      requiresAuth: true,
      requiresOrganization: false,
      missingOrganizationAction: "none",
    });
  });

  it("requires an org for private pages and redirects when missing", () => {
    expect(getPathAccessPolicy("/dashboard/settings")).toEqual({
      requiresAuth: true,
      requiresOrganization: true,
      missingOrganizationAction: "redirect",
    });
  });

  it("requires an org for org-backed APIs", () => {
    expect(getPathAccessPolicy("/api/threads")).toEqual({
      requiresAuth: true,
      requiresOrganization: true,
      missingOrganizationAction: "json-403",
    });
  });

  it("matches route patterns consistently", () => {
    expect(matchesPathname("/api/webhooks/meta", publicRoutePatterns)).toBe(true);
    expect(matchesPathname("/marketing", publicRoutePatterns)).toBe(false);
  });
});
