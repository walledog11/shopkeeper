import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { SHOPIFY_MUTATION_DOCUMENTS } from "./mutation-documents.js";

describe("SHOPIFY_MUTATION_DOCUMENTS", () => {
  // The registry's whole purpose is that --validate fails on an unregistered
  // mutation instead of silently skipping it, but nothing asserted the registry
  // was complete. Milestone 7 added three mutation documents - two discount
  // writes and one permanent price change - and none was registered, so the
  // schema harness had never seen them.
  it("registers every mutation document the package exports", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const registered = new Set(
      Object.values(SHOPIFY_MUTATION_DOCUMENTS).map((entry) => entry.document),
    );
    const missing: string[] = [];

    for (const file of readdirSync(here)) {
      if (!file.endsWith(".ts") || file.includes(".test.")) continue;
      if (file === "mutation-documents.ts") continue;
      const source = readFileSync(join(here, file), "utf8");
      for (const match of source.matchAll(/export const (\w*MUTATION)\b/g)) {
        // Compare on the document text, not the name: the registry holds the
        // same constant, so a match proves the exported string is the one the
        // harness validates.
        const body = source.slice(match.index).match(/`([\s\S]*?)`/)?.[1];
        if (body && !registered.has(body)) missing.push(`${file}: ${match[1]}`);
      }
    }

    expect(missing, "unregistered Shopify mutation documents").toEqual([]);
  });

  it("declares no GraphQL variable a document does not use", () => {
    // The defect this harness found in reverseDeliveryCreateWithShipping: a
    // declared-but-unused variable is a static validation error, so the mutation
    // is rejected before it runs, on every store, every time.
    for (const [name, entry] of Object.entries(SHOPIFY_MUTATION_DOCUMENTS)) {
      const declared = [...entry.document.matchAll(/\$(\w+)\s*:/g)].map((match) => match[1]);
      for (const variable of declared) {
        const uses = entry.document.match(new RegExp(`\\$${variable}\\b`, "g")) ?? [];
        expect(uses.length, `${name} declares $${variable} but never uses it`).toBeGreaterThan(1);
      }
    }
  });
});
