import { beforeEach } from "vitest";
import { resetShopRequestPacingForTests } from "./shopify/client.js";

// The Shopify client paces requests with a per-shop token bucket that lives for
// the whole file. Tests reuse one shop domain, so without a reset the burst
// drains early and every later mocked request waits ~500ms for a refill.
beforeEach(() => {
  resetShopRequestPacingForTests();
});
