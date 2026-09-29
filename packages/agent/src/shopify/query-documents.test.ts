import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { SHOPIFY_QUERY_DOCUMENTS } from "./query-documents.js";

// Operation names in the order they appear, so two documents sharing a name are
// counted twice rather than collapsing into one.
function operationNames(source: string): string[] {
  return [...source.matchAll(/`query\s+(\w+)/g)].map((match) => match[1]!);
}

describe("SHOPIFY_QUERY_DOCUMENTS", () => {
  it("holds only query operations", () => {
    // The safety property this registry rests on. Unlike the mutation harness,
    // query validation sends documents *unskipped*, because a read against a
    // nonexistent id commits nothing. A mutation registered here by mistake
    // would therefore execute for real against whatever store the run selected.
    for (const [name, entry] of Object.entries(SHOPIFY_QUERY_DOCUMENTS)) {
      expect(entry.document.trimStart(), `${name} is not a query operation`).toMatch(/^query\b/);
      expect(entry.document, `${name} contains a mutation operation`).not.toMatch(/\bmutation\s/);
    }
  });

  it("declares no GraphQL variable a document does not use", () => {
    // Same static-validation rule that caught the declared-but-unused variable in
    // reverseDeliveryCreateWithShipping: it makes Shopify reject the document
    // before executing it, every time, on every store.
    for (const [name, entry] of Object.entries(SHOPIFY_QUERY_DOCUMENTS)) {
      const declared = [...entry.document.matchAll(/\$(\w+)\s*:/g)].map((match) => match[1]);
      for (const variable of declared) {
        const uses = entry.document.match(new RegExp(`\\$${variable}\\b`, "g")) ?? [];
        expect(uses.length, `${name} declares $${variable} but never uses it`).toBeGreaterThan(1);
      }
    }
  });

  it("registers every query document in the package", () => {
    // The drift this registry exists to prevent, and the one hole the mutation
    // registry does not cover: a document added to a module and never registered
    // is schema-checked by nothing and looks fine. `returnableFulfillments`
    // shipped that way and killed two capabilities.
    //
    // Compared by operation name and by count, not as a set, because
    // FindShopkeeperCreatedOrder is deliberately two different documents.
    const dir = dirname(fileURLToPath(import.meta.url));
    const sourceNames: string[] = [];
    const walk = (directory: string) => {
      for (const entry of readdirSync(directory)) {
        const fullPath = join(directory, entry);
        if (statSync(fullPath).isDirectory()) {
          walk(fullPath);
          continue;
        }
        if (!entry.endsWith(".ts") || entry.includes(".test.") || entry === "query-documents.ts") continue;
        sourceNames.push(...operationNames(readFileSync(fullPath, "utf8")));
      }
    };
    walk(dir);

    const registered = Object.values(SHOPIFY_QUERY_DOCUMENTS).flatMap((entry) =>
      operationNames(`\`${entry.document}`),
    );

    const tally = (names: string[]) =>
      names.reduce<Record<string, number>>((acc, name) => ({ ...acc, [name]: (acc[name] ?? 0) + 1 }), {});

    expect(sourceNames.length).toBeGreaterThan(0);
    expect(tally(registered), "a query document in this package is missing from SHOPIFY_QUERY_DOCUMENTS")
      .toEqual(tally(sourceNames));
  });
});
