// Every GraphQL mutation document this package sends, in one enumerable place.
//
// The documents themselves stay in the modules that send them - these are the
// same constants, not copies - so validating one of these validates the string
// that actually runs. The registry exists so the schema-validation harness
// (scripts/canary-shopify-mutations.mjs --validate) can fail on a document it
// has no case for, rather than silently skipping a newly added mutation.
//
// REST mutations (order cancel, order address, order create) are not here: they
// fail with an HTTP status rather than as a statusless document-validation
// error, so they are not part of this class.
import { DISCOUNT_CODE_BASIC_CREATE_MUTATION } from "./discounts.js";
import {
  AUTOMATIC_DISCOUNT_CREATE_MUTATION,
  AUTOMATIC_DISCOUNT_DELETE_MUTATION,
} from "./flash-sales.js";
import { FULFILLMENT_CREATE_MUTATION } from "./fulfillment.js";
import { GIFT_CARD_CREATE_MUTATION } from "./gift-cards.js";
import {
  ORDER_EDIT_ADD_VARIANT_MUTATION,
  ORDER_EDIT_BEGIN_MUTATION,
  ORDER_EDIT_COMMIT_MUTATION,
  ORDER_EDIT_SET_QUANTITY_MUTATION,
} from "./order-edit.js";
import { REFUND_CREATE_MUTATION } from "./refunds.js";
import { REVERSE_DELIVERY_CREATE_WITH_SHIPPING_MUTATION } from "./return-labels.js";
import { RETURN_CREATE_MUTATION } from "./returns.js";
import { STORE_CREDIT_ACCOUNT_CREDIT_MUTATION } from "./store-credit.js";
import { VARIANT_PRICE_UPDATE_MUTATION } from "./variant-pricing.js";

export interface ShopifyMutationDocument {
  document: string;
  // The mutation's root field, so a validation probe can assert the field was
  // skipped rather than executed.
  rootField: string;
}

export const SHOPIFY_MUTATION_DOCUMENTS: Record<string, ShopifyMutationDocument> = {
  discountCodeBasicCreate: {
    document: DISCOUNT_CODE_BASIC_CREATE_MUTATION,
    rootField: "discountCodeBasicCreate",
  },
  fulfillmentCreate: {
    document: FULFILLMENT_CREATE_MUTATION,
    rootField: "fulfillmentCreate",
  },
  giftCardCreate: {
    document: GIFT_CARD_CREATE_MUTATION,
    rootField: "giftCardCreate",
  },
  orderEditBegin: {
    document: ORDER_EDIT_BEGIN_MUTATION,
    rootField: "orderEditBegin",
  },
  orderEditAddVariant: {
    document: ORDER_EDIT_ADD_VARIANT_MUTATION,
    rootField: "orderEditAddVariant",
  },
  orderEditSetQuantity: {
    document: ORDER_EDIT_SET_QUANTITY_MUTATION,
    rootField: "orderEditSetQuantity",
  },
  orderEditCommit: {
    document: ORDER_EDIT_COMMIT_MUTATION,
    rootField: "orderEditCommit",
  },
  refundCreate: {
    document: REFUND_CREATE_MUTATION,
    rootField: "refundCreate",
  },
  reverseDeliveryCreateWithShipping: {
    document: REVERSE_DELIVERY_CREATE_WITH_SHIPPING_MUTATION,
    rootField: "reverseDeliveryCreateWithShipping",
  },
  returnCreate: {
    document: RETURN_CREATE_MUTATION,
    rootField: "returnCreate",
  },
  flashSaleCreate: {
    document: AUTOMATIC_DISCOUNT_CREATE_MUTATION,
    rootField: "discountAutomaticBasicCreate",
  },
  flashSaleEnd: {
    document: AUTOMATIC_DISCOUNT_DELETE_MUTATION,
    rootField: "discountAutomaticDelete",
  },
  variantPriceUpdate: {
    document: VARIANT_PRICE_UPDATE_MUTATION,
    rootField: "productVariantsBulkUpdate",
  },
  storeCreditAccountCredit: {
    document: STORE_CREDIT_ACCOUNT_CREDIT_MUTATION,
    rootField: "storeCreditAccountCredit",
  },
};

// Rewrites a mutation document so the root field carries @skip(if: true).
// GraphQL validates the document and coerces every declared variable before it
// decides whether to skip a field, so the request type-checks the real document
// against the live schema with no side effects.
export function skippedMutationDocument(entry: ShopifyMutationDocument): string {
  // Search inside the operation's selection set. Most operations are named after
  // their root field, and @skip on an OperationDefinition is invalid GraphQL -
  // matching the operation's variable list instead of the field's argument list
  // would make every document fail validation for a reason we introduced.
  const selectionSetStart = entry.document.indexOf("{");
  if (selectionSetStart === -1) {
    throw new Error(`Mutation document for ${entry.rootField} has no selection set.`);
  }

  const fieldStart = entry.document.indexOf(entry.rootField, selectionSetStart);
  if (fieldStart === -1) {
    throw new Error(`Could not find root field ${entry.rootField} in its mutation document.`);
  }

  const nameEnd = fieldStart + entry.rootField.length;
  let cursor = nameEnd;
  while (cursor < entry.document.length && /\s/.test(entry.document[cursor])) cursor += 1;

  // A root field may carry no arguments, in which case the directive goes
  // straight after the field name.
  if (entry.document[cursor] !== "(") {
    return `${entry.document.slice(0, nameEnd)} @skip(if: true)${entry.document.slice(nameEnd)}`;
  }

  let depth = 0;
  for (let i = cursor; i < entry.document.length; i += 1) {
    const char = entry.document[i];
    if (char === "(") depth += 1;
    if (char === ")") {
      depth -= 1;
      if (depth === 0) {
        return `${entry.document.slice(0, i + 1)} @skip(if: true)${entry.document.slice(i + 1)}`;
      }
    }
  }

  throw new Error(`Unbalanced argument list on root field ${entry.rootField}.`);
}
