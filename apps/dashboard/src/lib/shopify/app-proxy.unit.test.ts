import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import {
  appProxyCanonicalString,
  verifyAppProxySignature,
  isProxyTimestampFresh,
} from "./app-proxy";

const SECRET = "test-app-secret";

function sign(canonical: string): string {
  return createHmac("sha256", SECRET).update(canonical).digest("hex");
}

describe("appProxyCanonicalString", () => {
  // Regression guard for the bug that cost the most time to find: Shopify signs
  // logged_in_customer_id even for a guest, sending it empty, but the empty
  // param is dropped before request.url reaches this handler. Verified against
  // a real storefront request — omitting the key produced a signature that did
  // not match, and the failure was indistinguishable from a wrong app secret.
  it("restores logged_in_customer_id when the empty param was dropped in transit", () => {
    const url = new URL(
      "https://app.useshopkeeper.com/api/storefront-chat/proxy/bootstrap" +
        "?shop=demo.myshopify.com&path_prefix=%2Fapps%2Fshopkeeper-chat&timestamp=1786160028&signature=abc"
    );

    expect(appProxyCanonicalString(url)).toBe(
      "logged_in_customer_id=path_prefix=/apps/shopkeeper-chatshop=demo.myshopify.comtimestamp=1786160028"
    );
  });

  it("keeps a real customer id when the shopper is logged in", () => {
    const url = new URL(
      "https://app.useshopkeeper.com/x?logged_in_customer_id=99&shop=demo.myshopify.com&timestamp=1&signature=abc"
    );

    expect(appProxyCanonicalString(url)).toContain("logged_in_customer_id=99");
  });

  it("excludes the signature itself", () => {
    const url = new URL("https://app.useshopkeeper.com/x?shop=a&signature=deadbeef");
    expect(appProxyCanonicalString(url)).not.toContain("deadbeef");
  });

  it("joins repeated parameters with a comma", () => {
    const url = new URL("https://app.useshopkeeper.com/x?ids=1&ids=2&signature=abc");
    expect(appProxyCanonicalString(url)).toContain("ids=1,2");
  });

  // Shopify sorts the built "key=value" strings, not the keys. The two differ
  // when one key prefixes another, because '=' (0x3D) sorts before '_' (0x5F).
  it("sorts built pairs rather than keys", () => {
    const url = new URL("https://app.useshopkeeper.com/x?path_prefix=b&path=a&signature=s");
    const canonical = appProxyCanonicalString(url);
    expect(canonical.indexOf("path=a")).toBeLessThan(canonical.indexOf("path_prefix=b"));
  });
});

describe("verifyAppProxySignature", () => {
  function signedUrl(params: Record<string, string>): URL {
    const url = new URL("https://app.useshopkeeper.com/api/storefront-chat/proxy/bootstrap");
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set("signature", sign(appProxyCanonicalString(url)));
    return url;
  }

  it("accepts a correctly signed request", () => {
    const url = signedUrl({ shop: "demo.myshopify.com", timestamp: "1786160028" });
    expect(verifyAppProxySignature(url, SECRET)).toBe(true);
  });

  it("rejects a tampered shop domain", () => {
    const url = signedUrl({ shop: "demo.myshopify.com", timestamp: "1786160028" });
    url.searchParams.set("shop", "attacker.myshopify.com");
    expect(verifyAppProxySignature(url, SECRET)).toBe(false);
  });

  it("rejects a request signed with a different secret", () => {
    const url = signedUrl({ shop: "demo.myshopify.com", timestamp: "1" });
    expect(verifyAppProxySignature(url, "other-secret")).toBe(false);
  });

  it("rejects a missing signature", () => {
    const url = new URL("https://app.useshopkeeper.com/x?shop=demo.myshopify.com");
    expect(verifyAppProxySignature(url, SECRET)).toBe(false);
  });
});

describe("isProxyTimestampFresh", () => {
  it("accepts a current timestamp", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(isProxyTimestampFresh(new URL(`https://x.test/y?timestamp=${now}`))).toBe(true);
  });

  // Shopify does not expire proxy signatures, so a captured storefront URL
  // would otherwise replay forever.
  it("rejects a stale timestamp", () => {
    const old = Math.floor(Date.now() / 1000) - 3600;
    expect(isProxyTimestampFresh(new URL(`https://x.test/y?timestamp=${old}`))).toBe(false);
  });

  it("rejects a missing or non-numeric timestamp", () => {
    expect(isProxyTimestampFresh(new URL("https://x.test/y"))).toBe(false);
    expect(isProxyTimestampFresh(new URL("https://x.test/y?timestamp=abc"))).toBe(false);
  });
});
