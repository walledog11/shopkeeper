import { describe, expect, it } from "vitest";

import { SHOPIFY_MUTATION_DOCUMENTS, skippedMutationDocument } from "./mutation-documents.js";

describe("skippedMutationDocument", () => {
  it("attaches @skip to the root field, not the operation definition", () => {
    // Most operations are named after their root field. Matching the operation's
    // variable list instead puts @skip on a MUTATION, which is invalid GraphQL -
    // every document would then fail validation for a reason we introduced.
    for (const [name, entry] of Object.entries(SHOPIFY_MUTATION_DOCUMENTS)) {
      const skipped = skippedMutationDocument(entry);
      const operationLine = skipped.trim().split("\n")[0];
      expect(operationLine, `${name} put @skip on the operation definition`).not.toContain("@skip");
      expect(skipped, `${name} did not get a @skip directive`).toContain("@skip(if: true)");
    }
  });

  it("places the directive after the root field's full argument list", () => {
    const skipped = skippedMutationDocument(SHOPIFY_MUTATION_DOCUMENTS.orderEditAddVariant);
    expect(skipped).toContain(
      "orderEditAddVariant(id: $id, variantId: $variantId, quantity: $quantity) @skip(if: true)",
    );
  });

  it("handles an argument list that spans multiple lines", () => {
    const skipped = skippedMutationDocument(
      SHOPIFY_MUTATION_DOCUMENTS.reverseDeliveryCreateWithShipping,
    );
    expect(skipped).toContain(") @skip(if: true) {");
    expect(skipped.match(/@skip/g)).toHaveLength(1);
  });

  it("preserves a directive the document already carries", () => {
    const skipped = skippedMutationDocument(SHOPIFY_MUTATION_DOCUMENTS.refundCreate);
    expect(skipped).toContain("@skip(if: true)");
    expect(skipped).toContain("@idempotent(key: $idempotencyKey)");
  });

  it("handles a root field with no arguments", () => {
    const skipped = skippedMutationDocument({
      document: "mutation doThing { doThing { id } }",
      rootField: "doThing",
    });
    expect(skipped).toBe("mutation doThing { doThing @skip(if: true) { id } }");
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
