import { expect, expectTypeOf, it } from "vitest";
import { toolOk } from "../result.js";
import { arrayArg, booleanArg, defineTool, numberArg, stringArg } from "./schema.js";
import type { CreateShopifyOrderInput, FindCustomerInput, SendReplyInput } from "./types.js";

it("infers runtime input independently of the model's required and hidden fields", () => {
  const definition = defineTool({
    name: "schema_contract",
    description: "Exercise the persisted-input boundary.",
    fields: {
      id: stringArg("ID", { required: true }),
      mode: stringArg("Mode", { enum: ["paid", "free"], modelRequired: true }),
      accepted: booleanArg("Accepted"),
      evidence: arrayArg("Runtime evidence", {
        quantity: numberArg("Quantity", { required: true }),
        kind: stringArg("Kind", { required: true, enum: ["order", "customer"] }),
      }, { runtimeOnly: true }),
    },
    category: "read",
    group: "order",
    capabilities: [],
    label: "Read",
    planStepLabel: "Read",
    execute: async input => {
      expectTypeOf(input.id).toEqualTypeOf<string>();
      expectTypeOf(input.mode).toEqualTypeOf<"paid" | "free" | undefined>();
      expectTypeOf(input.accepted).toEqualTypeOf<boolean | undefined>();
      expectTypeOf(input.evidence![0].quantity).toEqualTypeOf<number>();
      expectTypeOf(input.evidence![0].kind).toEqualTypeOf<"order" | "customer">();
      return toolOk(input.id);
    },
  });

  expect(definition.inputSchema.required).toEqual(["id", "mode"]);
  expect(definition.inputSchema.properties).not.toHaveProperty("evidence");
  // An older persisted call may predate a model-required field; runtime evidence
  // remains parseable even though it is absent from the model's JSON schema.
  const input = { id: "1", evidence: [{ quantity: 2, kind: "order" }] };
  expect(definition.parse(input)).toEqual(input);
  expect(() => definition.parse({ ...input, evidence: [{ quantity: 2, kind: "invented" }] })).toThrow("must be one of");
  expect(() => definition.parse({ mode: "paid" })).toThrow("input.id is required");
});

it("preserves exported input optionality and enum types", () => {
  expectTypeOf<FindCustomerInput["by"]>().toEqualTypeOf<"query" | "id">();
  expectTypeOf<CreateShopifyOrderInput["payment"]>().toEqualTypeOf<"customer_pays" | "free" | undefined>();
  expectTypeOf<SendReplyInput["await_response"]>().toEqualTypeOf<boolean | undefined>();
});
