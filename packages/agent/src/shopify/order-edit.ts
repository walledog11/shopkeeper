import type { EditShopifyOrderInput } from "../tools/index.js";
import { toolError, toolOk, toolUnknown, type ToolResult } from "../tools/result.js";
import {
  formatShopifyToolError,
  formatUserErrors,
  isAmbiguousShopifyMutationError,
  shopifyGraphql,
  shopifyRestJson,
  type ShopifyContext,
  type ShopifyGraphqlUserError,
} from "./client.js";
import type { ShopifyOrder, ShopifyOrderLineItem } from "./types.js";
import { optionalPositiveInteger, optionalString, requireNumericId } from "./validation.js";

type CalculatedLineItemEdge = {
  node: {
    id: string;
    quantity: number;
    title: string;
    variant?: { id: string; title?: string | null } | null;
  };
};

interface CalculatedLineItems {
  edges: CalculatedLineItemEdge[];
  pageInfo: { hasNextPage: boolean };
}

interface CommittedLineItems {
  edges: Array<{
    node: {
      title: string;
      currentQuantity: number;
      variant?: { id: string; title?: string | null } | null;
    };
  }>;
  pageInfo: { hasNextPage: boolean };
}

interface OrderEditBeginData {
  orderEditBegin?: {
    calculatedOrder?: {
      id: string;
      lineItems: CalculatedLineItems;
    } | null;
    userErrors?: ShopifyGraphqlUserError[];
  } | null;
}

interface OrderEditMutationData {
  orderEditAddVariant?: {
    calculatedOrder?: { id: string } | null;
    userErrors?: ShopifyGraphqlUserError[];
  } | null;
  orderEditSetQuantity?: {
    calculatedOrder?: { id: string } | null;
    userErrors?: ShopifyGraphqlUserError[];
  } | null;
  orderEditCommit?: {
    order?: {
      name?: string | null;
      lineItems: CommittedLineItems;
    } | null;
    userErrors?: ShopifyGraphqlUserError[];
  } | null;
}

type EditAction = "swapped item on" | "removed item from" | "added item to";
type EditPhase = "not_started" | "begin" | "add" | "remove" | "commit";

interface DisplayLineItem {
  title: string;
  quantity: number;
  variantTitle?: string | null;
}

interface ReconciliationOrder extends ShopifyOrder {
  line_items?: Array<ShopifyOrderLineItem & { variant_title?: string | null }>;
}

function variantQuantitiesFromCalculated(lineItems: CalculatedLineItems): Map<string, number> {
  const quantities = new Map<string, number>();
  for (const { node } of lineItems.edges ?? []) {
    const variantId = node.variant?.id;
    if (!variantId) continue;
    quantities.set(variantId, (quantities.get(variantId) ?? 0) + Math.max(node.quantity, 0));
  }
  return quantities;
}

function variantQuantitiesFromOrder(order: ReconciliationOrder): Map<string, number> {
  const quantities = new Map<string, number>();
  for (const lineItem of order.line_items ?? []) {
    if (lineItem.variant_id === undefined || lineItem.variant_id === null) continue;
    const variantId = `gid://shopify/ProductVariant/${lineItem.variant_id}`;
    const quantity = lineItem.current_quantity ?? lineItem.quantity;
    quantities.set(variantId, (quantities.get(variantId) ?? 0) + Math.max(quantity, 0));
  }
  return quantities;
}

function variantQuantitiesFromCommitted(lineItems: CommittedLineItems): Map<string, number> {
  const quantities = new Map<string, number>();
  for (const { node } of lineItems.edges ?? []) {
    const variantId = node.variant?.id;
    if (!variantId) continue;
    quantities.set(variantId, (quantities.get(variantId) ?? 0) + Math.max(node.currentQuantity, 0));
  }
  return quantities;
}

function matchesExpectedQuantities(
  actual: ReadonlyMap<string, number>,
  expected: ReadonlyMap<string, number>,
): boolean {
  for (const [variantId, quantity] of expected) {
    if ((actual.get(variantId) ?? 0) !== quantity) return false;
  }
  return true;
}

function formatOrderEditResult(
  orderName: string | null | undefined,
  fallbackOrderId: string,
  action: EditAction,
  lineItems: readonly DisplayLineItem[],
  reconciled = false,
): ToolResult {
  const itemList = lineItems.flatMap((item) => {
    if (item.quantity <= 0) return [];
    const variantTitle = item.variantTitle && item.variantTitle !== "Default Title"
      ? ` (${item.variantTitle})`
      : "";
    return [`${item.quantity}x ${item.title}${variantTitle}`];
  }).join(", ");
  const confirmation = reconciled ? " (confirmed after an interrupted provider response)" : "";
  return toolOk(
    `Successfully ${action} order ${orderName ?? `#${fallbackOrderId}`}${confirmation}. Current order items: ${itemList || "none"}.`,
  );
}

async function reconcileCommittedEdit(
  ctx: ShopifyContext,
  orderId: string,
  expectedQuantities: ReadonlyMap<string, number>,
  action: EditAction,
  mutationError?: unknown,
): Promise<ToolResult> {
  try {
    const data = await shopifyRestJson<{ order?: ReconciliationOrder }>(ctx, `orders/${orderId}.json`, {
      query: { fields: "id,name,line_items" },
    });
    const order = data.order;
    if (order && matchesExpectedQuantities(variantQuantitiesFromOrder(order), expectedQuantities)) {
      return formatOrderEditResult(
        order.name,
        orderId,
        action,
        (order.line_items ?? []).map((item) => ({
          title: item.title,
          quantity: item.current_quantity ?? item.quantity,
          variantTitle: item.variant_title,
        })),
        true,
      );
    }

    const detail = mutationError
      ? ` ${formatShopifyToolError("order edit reconciliation failed", mutationError)}`
      : "";
    return toolUnknown(
      `Unknown: the edit for order ${orderId} may have committed at Shopify, but a follow-up read did not confirm the requested item quantities. Do not retry or confirm it to the customer until it is reconciled.${detail}`,
    );
  } catch (reconciliationError) {
    return toolUnknown(
      `Unknown: the edit for order ${orderId} may have committed at Shopify and the follow-up read failed. Do not retry or confirm it to the customer until it is reconciled. ${formatShopifyToolError("order edit reconciliation failed", reconciliationError)}`,
    );
  }
}

function interruptedStageResult(orderId: string, phase: Exclude<EditPhase, "not_started" | "commit">, err?: unknown): ToolResult {
  const phaseLabel = phase === "begin" ? "edit-session creation" : `${phase} staging`;
  const state = phase === "begin"
    ? "Shopify may have opened an edit session, but no order change was committed by this tool."
    : "Shopify may hold a partial staged edit, but no order change was committed by this tool.";
  const detail = err ? ` ${formatShopifyToolError(`order ${phaseLabel} failed`, err)}` : "";
  return toolUnknown(
    `Unknown: ${phaseLabel} for order ${orderId} was interrupted. ${state} Do not retry until the edit session is reviewed.${detail}`,
  );
}

export async function editShopifyOrder(
  input: EditShopifyOrderInput,
  ctx: ShopifyContext,
): Promise<ToolResult> {
  let phase: EditPhase = "not_started";
  let orderId: string | null = null;
  let action: EditAction | null = null;
  let expectedQuantities: Map<string, number> | null = null;

  try {
    orderId = requireNumericId(input.order_id, "order_id");
    const rawAddVariantId = optionalString(input.variant_id);
    const rawRemoveVariantId = optionalString(input.remove_variant_id);

    if (!rawAddVariantId && !rawRemoveVariantId) {
      return toolError("Error: edit_shopify_order requires at least variant_id (to add) or remove_variant_id (to remove).");
    }

    const addVariantId = rawAddVariantId ? requireNumericId(rawAddVariantId, "variant_id") : null;
    const removeVariantId = rawRemoveVariantId ? requireNumericId(rawRemoveVariantId, "remove_variant_id") : null;
    if (addVariantId && removeVariantId && addVariantId === removeVariantId) {
      return toolError("Error: edit_shopify_order cannot add and remove the same variant in one edit.");
    }

    const quantity = addVariantId ? optionalPositiveInteger(input.quantity, "quantity", 1) : null;
    const productVariantIdPrefix = "gid://shopify/ProductVariant/";
    const addVariantGid = addVariantId ? `${productVariantIdPrefix}${addVariantId}` : null;
    const removeVariantGid = removeVariantId ? `${productVariantIdPrefix}${removeVariantId}` : null;
    const orderGid = `gid://shopify/Order/${orderId}`;
    action = addVariantId && removeVariantId
      ? "swapped item on"
      : removeVariantId
        ? "removed item from"
        : "added item to";

    phase = "begin";
    const beginData = await shopifyGraphql<OrderEditBeginData>(
      ctx,
      `mutation orderEditBegin($id: ID!) {
        orderEditBegin(id: $id) {
          calculatedOrder {
            id
            lineItems(first: 250) {
              edges { node { id quantity variant { id title } title } }
              pageInfo { hasNextPage }
            }
          }
          userErrors { field message }
        }
      }`,
      { id: orderGid },
    );

    const beginPayload = beginData.orderEditBegin;
    const beginErrors = formatUserErrors(beginPayload?.userErrors);
    if (beginErrors) return toolError(`Error: could not begin order edit - ${beginErrors}`);

    const calculatedOrder = beginPayload?.calculatedOrder;
    const calculatedOrderId = calculatedOrder?.id;
    if (!calculatedOrderId) return interruptedStageResult(orderId, "begin");
    if (calculatedOrder.lineItems.pageInfo.hasNextPage) {
      return toolError(
        `Error: could not safely edit order ${orderId} because it has more than 250 line items; manual review is required.`,
      );
    }

    const initialQuantities = variantQuantitiesFromCalculated(calculatedOrder.lineItems);
    expectedQuantities = new Map<string, number>();
    if (addVariantGid && quantity !== null) {
      expectedQuantities.set(addVariantGid, (initialQuantities.get(addVariantGid) ?? 0) + quantity);
    }

    let itemToRemove: CalculatedLineItemEdge | undefined;
    if (removeVariantGid) {
      const matches = (calculatedOrder.lineItems.edges ?? []).filter(
        (edge) => edge.node.quantity > 0 && edge.node.variant?.id === removeVariantGid,
      );
      if (matches.length === 0) {
        return toolError(`Error: could not remove old item - variant ${removeVariantId} was not found on order ${orderId}.`);
      }
      if (matches.length > 1) {
        return toolError(`Error: could not remove old item - variant ${removeVariantId} appears multiple times on order ${orderId}; manual review is required.`);
      }
      itemToRemove = matches[0];
      expectedQuantities.set(
        removeVariantGid,
        Math.max((initialQuantities.get(removeVariantGid) ?? 0) - itemToRemove.node.quantity, 0),
      );
    }

    let stageCompleted = false;
    if (addVariantGid && quantity !== null) {
      phase = "add";
      const addData = await shopifyGraphql<OrderEditMutationData>(
        ctx,
        `mutation orderEditAddVariant($id: ID!, $variantId: ID!, $quantity: Int!) {
          orderEditAddVariant(id: $id, variantId: $variantId, quantity: $quantity) {
            calculatedOrder { id }
            userErrors { field message }
          }
        }`,
        { id: calculatedOrderId, variantId: addVariantGid, quantity },
      );
      const addPayload = addData.orderEditAddVariant;
      const addErrors = formatUserErrors(addPayload?.userErrors);
      if (addErrors) return toolError(`Error: could not add item to order - ${addErrors}`);
      if (!addPayload?.calculatedOrder) return interruptedStageResult(orderId, "add");
      stageCompleted = true;
    }

    if (itemToRemove) {
      phase = "remove";
      const setQtyData = await shopifyGraphql<OrderEditMutationData>(
        ctx,
        `mutation orderEditSetQuantity($id: ID!, $lineItemId: ID!, $quantity: Int!) {
          orderEditSetQuantity(id: $id, lineItemId: $lineItemId, quantity: $quantity) {
            calculatedOrder { id }
            userErrors { field message }
          }
        }`,
        { id: calculatedOrderId, lineItemId: itemToRemove.node.id, quantity: 0 },
      );
      const setQtyPayload = setQtyData.orderEditSetQuantity;
      const setQtyErrors = formatUserErrors(setQtyPayload?.userErrors);
      if (setQtyErrors) {
        return stageCompleted
          ? toolUnknown(
            `Unknown: Shopify staged the added item for order ${orderId}, but rejected removal of the old item: ${setQtyErrors}. The order was not committed by this tool; review the partial edit session before retrying.`,
          )
          : toolError(`Error: could not remove old item - ${setQtyErrors}`);
      }
      if (!setQtyPayload?.calculatedOrder) return interruptedStageResult(orderId, "remove");
      stageCompleted = true;
    }

    phase = "commit";
    const commitData = await shopifyGraphql<OrderEditMutationData>(
      ctx,
      `mutation orderEditCommit($id: ID!) {
        orderEditCommit(id: $id, notifyCustomer: false) {
          order {
            name
            lineItems(first: 250) {
              edges { node { title currentQuantity variant { id title } } }
              pageInfo { hasNextPage }
            }
          }
          userErrors { field message }
        }
      }`,
      { id: calculatedOrderId },
    );

    const commitPayload = commitData.orderEditCommit;
    const commitErrors = formatUserErrors(commitPayload?.userErrors);
    if (commitErrors) return toolError(`Error: could not commit order edit - ${commitErrors}`);

    const order = commitPayload?.order;
    if (
      !order
      || order.lineItems.pageInfo.hasNextPage
      || !matchesExpectedQuantities(variantQuantitiesFromCommitted(order.lineItems), expectedQuantities)
    ) {
      return reconcileCommittedEdit(ctx, orderId, expectedQuantities, action);
    }

    return formatOrderEditResult(
      order.name,
      orderId,
      action,
      order.lineItems.edges.map(({ node }) => ({
        title: node.title,
        quantity: node.currentQuantity,
        variantTitle: node.variant?.title,
      })),
    );
  } catch (err) {
    if (orderId && isAmbiguousShopifyMutationError(err)) {
      if (phase === "commit" && expectedQuantities && action) {
        return reconcileCommittedEdit(ctx, orderId, expectedQuantities, action, err);
      }
      if (phase === "begin" || phase === "add" || phase === "remove") {
        return interruptedStageResult(orderId, phase, err);
      }
    }
    return toolError(formatShopifyToolError("failed to edit order", err));
  }
}
