import { createHash } from "node:crypto";
import type { AttachReturnLabelInput } from "../tools/index.js";
import {
  formatShopifyToolError,
  formatUserErrors,
  isAmbiguousShopifyMutationError,
  shopifyGraphql,
  type ShopifyContext,
  type ShopifyGraphqlUserError,
} from "./client.js";
import {
  toolError,
  toolNotFound,
  toolOk,
  toolPolicyBlock,
  toolUnknown,
  type ReceiptV1,
  type ToolResult,
} from "../tools/result.js";
import { shopifyFailureReceipt, shopifyReceiptEnvelope } from "./receipts.js";
import { optionalString, requireNonEmptyString, requireNumericId, ShopifyInputError } from "./validation.js";

// Exported so the reconciliation probe decides "is this return open?" with the
// same predicate the tool commits on rather than a second copy of it.
export const OPEN_RETURN_STATUSES = new Set(["OPEN", "REQUESTED"]);

export const ORDER_RETURNS_QUERY = `query orderReturns($id: ID!) {
  order(id: $id) {
    returns(first: 10) {
      edges {
        node {
          id
          name
          status
          reverseFulfillmentOrders(first: 5) {
            edges { node { id } }
          }
        }
      }
    }
  }
}`;

function requireLabelUrl(value: unknown): string {
  const url = requireNonEmptyString(value, "label_url");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ShopifyInputError("label_url must be a valid URL.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new ShopifyInputError("label_url must be an http(s) URL.");
  }
  return url;
}

interface OrderReturnsData {
  order?: {
    returns?: {
      edges: {
        node: {
          id: string;
          name?: string | null;
          status?: string | null;
          reverseFulfillmentOrders?: {
            edges: { node: { id: string } }[];
          } | null;
        };
      }[];
    } | null;
  } | null;
}

interface ReverseDeliveryCreateData {
  reverseDeliveryCreateWithShipping?: {
    reverseDelivery?: { id: string } | null;
    userErrors?: ShopifyGraphqlUserError[];
  } | null;
}

export const REVERSE_DELIVERY_CREATE_WITH_SHIPPING_MUTATION = `mutation reverseDeliveryCreateWithShipping($reverseFulfillmentOrderId: ID!, $trackingInput: ReverseDeliveryTrackingInput, $labelInput: ReverseDeliveryLabelInput) {
        reverseDeliveryCreateWithShipping(
          reverseFulfillmentOrderId: $reverseFulfillmentOrderId,
          reverseDeliveryLineItems: [],
          trackingInput: $trackingInput,
          labelInput: $labelInput,
          notifyCustomer: false
        ) {
          reverseDelivery { id }
          userErrors { field message }
        }
      }`;

function returnLabelFailure(
  ctx: ShopifyContext,
  orderId: string,
  result: ToolResult,
  outcome: "not_found" | "rejected" | "failed",
  code: string,
): ToolResult {
  const receipt = shopifyFailureReceipt(
    ctx,
    { kind: "order", id: orderId },
    "attach_return_label",
    outcome,
    code,
  );
  return receipt ? { ...result, receipt } : result;
}

function unknownReturnLabelReceipt(
  ctx: ShopifyContext,
  orderId: string,
  code: string,
): ReceiptV1 | undefined {
  const envelope = shopifyReceiptEnvelope(ctx, { kind: "order", id: orderId });
  return envelope ? {
    ...envelope,
    tool: "attach_return_label",
    outcome: "unknown",
    code,
    providerReference: null,
  } : undefined;
}

export async function attachReturnLabel(
  input: AttachReturnLabelInput,
  ctx: ShopifyContext
): Promise<ToolResult> {
  // Only the reverse-delivery mutation can leave a label attached at Shopify. A
  // failure in the return lookup above it committed nothing, so it keeps the
  // ordinary error path.
  let mutationStarted = false;
  try {
    const orderId = requireNumericId(input.order_id, "order_id");
    const labelUrl = requireLabelUrl(input.label_url);
    const trackingNumber = optionalString(input.tracking_number);

    const data = await shopifyGraphql<OrderReturnsData>(
      ctx,
      ORDER_RETURNS_QUERY,
      { id: `gid://shopify/Order/${orderId}` }
    );

    if (!data.order) {
      return returnLabelFailure(
        ctx,
        orderId,
        toolNotFound(`Error: failed to attach return label - order ${orderId} was not found.`),
        "not_found",
        "order_not_found",
      );
    }

    const openReturn = (data.order.returns?.edges ?? [])
      .map((edge) => edge.node)
      .find((node) => OPEN_RETURN_STATUSES.has(node.status ?? "") && (node.reverseFulfillmentOrders?.edges.length ?? 0) > 0);

    if (!openReturn) {
      return returnLabelFailure(
        ctx,
        orderId,
        toolPolicyBlock(`Error: could not attach return label - order ${orderId} has no open return. Open one with create_return or create_exchange first.`),
        "rejected",
        "no_open_return",
      );
    }

    const reverseFulfillmentOrderId = openReturn.reverseFulfillmentOrders!.edges[0].node.id;

    mutationStarted = true;
    const created = await shopifyGraphql<ReverseDeliveryCreateData>(
      ctx,
      REVERSE_DELIVERY_CREATE_WITH_SHIPPING_MUTATION,
      {
        reverseFulfillmentOrderId,
        labelInput: { fileUrl: labelUrl },
        trackingInput: trackingNumber ? { number: trackingNumber } : null,
      }
    );

    const payload = created.reverseDeliveryCreateWithShipping;
    const userErrors = formatUserErrors(payload?.userErrors);
    if (userErrors) {
      return returnLabelFailure(
        ctx,
        orderId,
        toolError(`Error: could not attach return label - ${userErrors}`),
        "failed",
        "provider_rejected",
      );
    }

    const reverseDeliveryId = payload?.reverseDelivery?.id?.trim();
    if (!reverseDeliveryId) {
      const result = toolUnknown(
        `Unknown: Shopify accepted the return-label request for order ${orderId}, but did not return a reverse delivery. Do not attach another label, retry, or send the customer a label link until the return is reviewed.`,
      );
      const receipt = unknownReturnLabelReceipt(ctx, orderId, "provider_reverse_delivery_missing");
      return receipt ? { ...result, receipt } : result;
    }

    const returnName = openReturn.name ?? openReturn.id;
    const trackingNote = trackingNumber ? ` with tracking number ${trackingNumber}` : "";
    const envelope = shopifyReceiptEnvelope(ctx, { kind: "order", id: orderId });
    const receipt: ReceiptV1 | undefined = envelope ? {
      ...envelope,
      tool: "attach_return_label",
      outcome: "succeeded",
      providerReference: reverseDeliveryId,
      facts: {
        orderId,
        returnId: openReturn.id,
        reverseFulfillmentOrderId,
        reverseDeliveryId,
        labelSha256: createHash("sha256").update(labelUrl).digest("hex"),
        trackingNumber: trackingNumber ?? null,
        attachmentState: "attached",
      },
    } : undefined;
    const result = toolOk(
      `Attached the return label to return ${returnName} on order ${orderId}${trackingNote}. Send the customer the label link in your reply so they can ship the items back: ${labelUrl}`
    );
    return receipt ? { ...result, receipt } : result;
  } catch (err) {
    if (mutationStarted && isAmbiguousShopifyMutationError(err)) {
      const result = toolUnknown(
        `Unknown: the return label may have been attached at Shopify, but it could not be confirmed. Do not attach another label, retry, or send the customer a label link until the return on order ${input.order_id} is reviewed. ${formatShopifyToolError("return label reconciliation failed", err)}`,
      );
      const receipt = unknownReturnLabelReceipt(
        ctx,
        input.order_id.trim() || "invalid",
        "ambiguous_provider_response",
      );
      return receipt ? { ...result, receipt } : result;
    }
    return returnLabelFailure(
      ctx,
      input.order_id.trim() || "invalid",
      toolError(formatShopifyToolError("failed to attach return label", err)),
      "failed",
      "definite_failure",
    );
  }
}
