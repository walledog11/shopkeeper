import { readdirSync, readFileSync } from "node:fs";
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

  it("supplies a fixture value for every variable a document declares", () => {
    // A missing fixture fails at variable coercion, which reads like an invalid
    // document but is really an incomplete registry entry. Catching it here keeps
    // that ambiguity out of the live run.
    for (const [name, entry] of Object.entries(SHOPIFY_QUERY_DOCUMENTS)) {
      const declared = [...entry.document.matchAll(/\$(\w+)\s*:/g)].map((match) => match[1]);
      for (const variable of declared) {
        expect(
          Object.prototype.hasOwnProperty.call(entry.variables, variable!),
          `${name} declares $${variable} but its registry entry has no fixture for it`,
        ).toBe(true);
      }
    }
  });

  it("passes no fixture variable a document does not declare", () => {
    // An undeclared variable is not a validation error, so a stale fixture left
    // behind after a document changed would sit unnoticed.
    for (const [name, entry] of Object.entries(SHOPIFY_QUERY_DOCUMENTS)) {
      const declared = new Set(
        [...entry.document.matchAll(/\$(\w+)\s*:/g)].map((match) => match[1]),
      );
      for (const variable of Object.keys(entry.variables)) {
        expect(declared.has(variable), `${name} passes $${variable}, which its document does not declare`).toBe(true);
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
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".ts") || file.includes(".test.") || file === "query-documents.ts") continue;
      sourceNames.push(...operationNames(readFileSync(join(dir, file), "utf8")));
    }

    const registered = Object.values(SHOPIFY_QUERY_DOCUMENTS).flatMap((entry) =>
      operationNames(`\`${entry.document}`),
    );

    const tally = (names: string[]) =>
      names.reduce<Record<string, number>>((acc, name) => ({ ...acc, [name]: (acc[name] ?? 0) + 1 }), {});

    expect(sourceNames.length).toBeGreaterThan(0);
    expect(tally(registered), "a query document in this package is missing from SHOPIFY_QUERY_DOCUMENTS")
      .toEqual(tally(sourceNames));
  });

  it("points every id fixture at a nonexistent resource", () => {
    // The second layer under "a read is harmless": even a document that returns
    // data must not return a real merchant's. Every gid fixture is id 1.
    const gids = Object.entries(SHOPIFY_QUERY_DOCUMENTS).flatMap(([name, entry]) =>
      Object.values(entry.variables)
        .flatMap((value) => (Array.isArray(value) ? value : [value]))
        .filter((value): value is string => typeof value === "string" && value.startsWith("gid://"))
        .map((value) => [name, value] as const),
    );
    expect(gids.length).toBeGreaterThan(0);
    for (const [name, gid] of gids) {
      expect(gid, `${name} uses a gid fixture that is not id 1`).toMatch(/\/1$/);
    }
  });
});
