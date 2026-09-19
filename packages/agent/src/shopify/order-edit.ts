import type { EditShopifyOrderInput } from "../tools/index.js";
import {
  toolError,
  toolOk,
  toolPolicyBlock,
  toolUnknown,
  type OrderEditReceiptChangeV1,
  type ReceiptFailureV1,
  type ReceiptV1,
  type ToolResult,
} from "../tools/result.js";
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
import { shopifyFailureReceipt, shopifyReceiptEnvelope } from "./receipts.js";
import {
  optionalPositiveInteger,
  optionalString,
  requireNumericId,
  ShopifyInputError,
} from "./validation.js";

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
      id: string;
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
    calculatedLineItem?: { id?: string | null } | null;
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

export const ORDER_EDIT_BEGIN_MUTATION = `mutation orderEditBegin($id: ID!) {
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
      }`;

export const ORDER_EDIT_ADD_VARIANT_MUTATION = `mutation orderEditAddVariant($id: ID!, $variantId: ID!, $quantity: Int!) {
          orderEditAddVariant(id: $id, variantId: $variantId, quantity: $quantity) {
            calculatedOrder { id }
            calculatedLineItem { id }
            userErrors { field message }
          }
        }`;

export const ORDER_EDIT_SET_QUANTITY_MUTATION = `mutation orderEditSetQuantity($id: ID!, $lineItemId: ID!, $quantity: Int!) {
          orderEditSetQuantity(id: $id, lineItemId: $lineItemId, quantity: $quantity) {
            calculatedOrder { id }
            userErrors { field message }
          }
        }`;

export const ORDER_EDIT_COMMIT_MUTATION = `mutation orderEditCommit($id: ID!) {
        orderEditCommit(id: $id, notifyCustomer: false) {
          order {
            name
            lineItems(first: 250) {
              edges { node { id title currentQuantity variant { id title } } }
              pageInfo { hasNextPage }
            }
          }
          userErrors { field message }
        }
      }`;

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

interface ObservedVariantState {
  quantity: number;
  lineItemId: string | null;
}

function observedVariantsFromCommitted(
  lineItems: CommittedLineItems,
): Map<string, ObservedVariantState> {
  const observed = new Map<string, ObservedVariantState>();
  for (const { node } of lineItems.edges ?? []) {
    const variantId = node.variant?.id;
    if (!variantId) continue;
    const current = observed.get(variantId);
    observed.set(variantId, {
      quantity: (current?.quantity ?? 0) + Math.max(node.currentQuantity, 0),
      lineItemId: current?.lineItemId ?? node.id ?? null,
    });
  }
  return observed;
}

function observedVariantsFromOrder(order: ReconciliationOrder): Map<string, ObservedVariantState> {
  const observed = new Map<string, ObservedVariantState>();
  for (const lineItem of order.line_items ?? []) {
    if (lineItem.variant_id === undefined || lineItem.variant_id === null) continue;
    const variantId = `gid://shopify/ProductVariant/${lineItem.variant_id}`;
    const current = observed.get(variantId);
    observed.set(variantId, {
      quantity: (current?.quantity ?? 0) + Math.max(lineItem.current_quantity ?? lineItem.quantity, 0),
      lineItemId: current?.lineItemId ?? (lineItem.id == null ? null : String(lineItem.id)),
    });
  }
  return observed;
}

function changesWithObservation(
  changes: readonly OrderEditReceiptChangeV1[],
  observed: ReadonlyMap<string, ObservedVariantState>,
  outcome: "committed" | "unknown",
): OrderEditReceiptChangeV1[] {
  return changes.map((change) => ({
    ...change,
    lineItemId: change.lineItemId ?? observed.get(change.variantId)?.lineItemId ?? null,
    providerObservedFinalQuantity: observed.get(change.variantId)?.quantity ?? 0,
    outcome,
  }));
}

function orderEditFailure(
  ctx: ShopifyContext,
  orderId: string,
  result: ToolResult,
  outcome: "rejected" | "failed",
  code: string,
): ToolResult {
  const receipt = shopifyFailureReceipt(
    ctx,
    { kind: "order", id: orderId },
    "edit_shopify_order",
    outcome,
    code,
  );
  return receipt ? { ...result, receipt } : result;
}

function unknownOrderEditReceipt(
  ctx: ShopifyContext,
  orderId: string,
  code: string,
  changes?: readonly OrderEditReceiptChangeV1[],
): ReceiptFailureV1 | undefined {
  const envelope = shopifyReceiptEnvelope(ctx, { kind: "order", id: orderId });
  if (!envelope) return undefined;
  return changes && changes.length > 0
    ? {
        ...envelope,
        tool: "edit_shopify_order",
        outcome: "unknown",
        code,
        providerReference: orderId,
        facts: { orderId, changes: [...changes] },
      }
    : {
        ...envelope,
        tool: "edit_shopify_order",
        outcome: "unknown",
        code,
        providerReference: null,
      };
}

function orderEditSuccessReceipt(
  ctx: ShopifyContext,
  orderId: string,
  changes: readonly OrderEditReceiptChangeV1[],
): ReceiptV1 | undefined {
  const envelope = shopifyReceiptEnvelope(ctx, { kind: "order", id: orderId });
  return envelope ? {
    ...envelope,
    tool: "edit_shopify_order",
    outcome: "succeeded",
    providerReference: orderId,
    facts: { orderId, changes: [...changes] },
  } : undefined;
}

function formatOrderEditResult(
  orderName: string | null | undefined,
  fallbackOrderId: string,
  action: EditAction,
  lineItems: readonly DisplayLineItem[],
  reconciled = false,
  receipt?: ReceiptV1,
): ToolResult {
  const itemList = lineItems.flatMap((item) => {
    if (item.quantity <= 0) return [];
    const variantTitle = item.variantTitle && item.variantTitle !== "Default Title"
      ? ` (${item.variantTitle})`
      : "";
    return [`${item.quantity}x ${item.title}${variantTitle}`];
  }).join(", ");
  const confirmation = reconciled ? " (confirmed after an interrupted provider response)" : "";
  const result = toolOk(
    `Successfully ${action} order ${orderName ?? `#${fallbackOrderId}`}${confirmation}. Current order items: ${itemList || "none"}.`,
  );
  return receipt ? { ...result, receipt } : result;
}

async function reconcileCommittedEdit(
  ctx: ShopifyContext,
  orderId: string,
  expectedQuantities: ReadonlyMap<string, number>,
  changes: readonly OrderEditReceiptChangeV1[],
  action: EditAction,
  mutationError?: unknown,
): Promise<ToolResult> {
  try {
    const data = await shopifyRestJson<{ order?: ReconciliationOrder }>(ctx, `orders/${orderId}.json`, {
      query: { fields: "id,name,line_items" },
    });
    const order = data.order;
    if (order && matchesExpectedQuantities(variantQuantitiesFromOrder(order), expectedQuantities)) {
      const committedChanges = changesWithObservation(
        changes,
        observedVariantsFromOrder(order),
        "committed",
      );
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
        orderEditSuccessReceipt(ctx, orderId, committedChanges),
      );
    }

    const detail = mutationError
      ? ` ${formatShopifyToolError("order edit reconciliation failed", mutationError)}`
      : "";
    const result = toolUnknown(
      `Unknown: the edit for order ${orderId} may have committed at Shopify, but a follow-up read did not confirm the requested item quantities. Do not retry or confirm it to the customer until it is reconciled.${detail}`,
    );
    const observedChanges = order
      ? changesWithObservation(changes, observedVariantsFromOrder(order), "unknown")
      : changes.map((change) => ({ ...change, outcome: "unknown" as const }));
    const receipt = unknownOrderEditReceipt(ctx, orderId, "commit_unconfirmed", observedChanges);
    return receipt ? { ...result, receipt } : result;
  } catch (reconciliationError) {
    const result = toolUnknown(
      `Unknown: the edit for order ${orderId} may have committed at Shopify and the follow-up read failed. Do not retry or confirm it to the customer until it is reconciled. ${formatShopifyToolError("order edit reconciliation failed", reconciliationError)}`,
    );
    const receipt = unknownOrderEditReceipt(
      ctx,
      orderId,
      "commit_reconciliation_failed",
      changes.map((change) => ({ ...change, outcome: "unknown" })),
    );
    return receipt ? { ...result, receipt } : result;
  }
}

function interruptedStageResult(
  ctx: ShopifyContext,
  orderId: string,
  phase: Exclude<EditPhase, "not_started" | "commit">,
  changes: readonly OrderEditReceiptChangeV1[],
  err?: unknown,
): ToolResult {
  const phaseLabel = phase === "begin" ? "edit-session creation" : `${phase} staging`;
  const state = phase === "begin"
    ? "Shopify may have opened an edit session, but no order change was committed by this tool."
    : "Shopify may hold a partial staged edit, but no order change was committed by this tool.";
  const detail = err ? ` ${formatShopifyToolError(`order ${phaseLabel} failed`, err)}` : "";
  const result = toolUnknown(
    `Unknown: ${phaseLabel} for order ${orderId} was interrupted. ${state} Do not retry until the edit session is reviewed.${detail}`,
  );
  const receipt = unknownOrderEditReceipt(ctx, orderId, `${phase}_interrupted`, changes);
  return receipt ? { ...result, receipt } : result;
}

export async function editShopifyOrder(
  input: EditShopifyOrderInput,
  ctx: ShopifyContext,
): Promise<ToolResult> {
  let phase: EditPhase = "not_started";
  let orderId: string | null = null;
  let action: EditAction | null = null;
  let expectedQuantities: Map<string, number> | null = null;
  const changes: OrderEditReceiptChangeV1[] = [];

  try {
    orderId = requireNumericId(input.order_id, "order_id");
    const rawAddVariantId = optionalString(input.variant_id);
    const rawRemoveVariantId = optionalString(input.remove_variant_id);

    if (!rawAddVariantId && !rawRemoveVariantId) {
      return orderEditFailure(
        ctx,
        orderId,
        toolPolicyBlock("Error: edit_shopify_order requires at least variant_id (to add) or remove_variant_id (to remove)."),
        "rejected",
        "missing_edit_change",
      );
    }

    const addVariantId = rawAddVariantId ? requireNumericId(rawAddVariantId, "variant_id") : null;
    const removeVariantId = rawRemoveVariantId ? requireNumericId(rawRemoveVariantId, "remove_variant_id") : null;
    if (addVariantId && removeVariantId && addVariantId === removeVariantId) {
      return orderEditFailure(
        ctx,
        orderId,
        toolPolicyBlock("Error: edit_shopify_order cannot add and remove the same variant in one edit."),
        "rejected",
        "same_variant_add_remove",
      );
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
      ORDER_EDIT_BEGIN_MUTATION,
      { id: orderGid },
    );

    const beginPayload = beginData.orderEditBegin;
    const beginErrors = formatUserErrors(beginPayload?.userErrors);
    if (beginErrors) {
      return orderEditFailure(
        ctx,
        orderId,
        toolPolicyBlock(`Error: could not begin order edit - ${beginErrors}`),
        "rejected",
        "provider_precondition_failed",
      );
    }

    const calculatedOrder = beginPayload?.calculatedOrder;
    const calculatedOrderId = calculatedOrder?.id;
    if (!calculatedOrderId) return interruptedStageResult(ctx, orderId, "begin", changes);
    if (calculatedOrder.lineItems.pageInfo.hasNextPage) {
      return orderEditFailure(
        ctx,
        orderId,
        toolPolicyBlock(`Error: could not safely edit order ${orderId} because it has more than 250 line items; manual review is required.`),
        "rejected",
        "order_line_item_limit_exceeded",
      );
    }

    const initialQuantities = variantQuantitiesFromCalculated(calculatedOrder.lineItems);
    expectedQuantities = new Map<string, number>();
    if (addVariantGid && quantity !== null) {
      expectedQuantities.set(addVariantGid, (initialQuantities.get(addVariantGid) ?? 0) + quantity);
      changes.push({
        kind: "addition",
        variantId: addVariantGid,
        lineItemId: null,
        requestedQuantity: quantity,
        providerObservedFinalQuantity: null,
        outcome: "unknown",
      });
    }

    let itemToRemove: CalculatedLineItemEdge | undefined;
    if (removeVariantGid) {
      const matches = (calculatedOrder.lineItems.edges ?? []).filter(
        (edge) => edge.node.quantity > 0 && edge.node.variant?.id === removeVariantGid,
      );
      if (matches.length === 0) {
        return orderEditFailure(
          ctx,
          orderId,
          toolPolicyBlock(`Error: could not remove old item - variant ${removeVariantId} was not found on order ${orderId}.`),
          "rejected",
          "remove_variant_not_found",
        );
      }
      if (matches.length > 1) {
        return orderEditFailure(
          ctx,
          orderId,
          toolPolicyBlock(`Error: could not remove old item - variant ${removeVariantId} appears multiple times on order ${orderId}; manual review is required.`),
          "rejected",
          "remove_variant_ambiguous",
        );
      }
      itemToRemove = matches[0];
      expectedQuantities.set(
        removeVariantGid,
        Math.max((initialQuantities.get(removeVariantGid) ?? 0) - itemToRemove.node.quantity, 0),
      );
      changes.push({
        kind: "removal",
        variantId: removeVariantGid,
        lineItemId: itemToRemove.node.id,
        requestedQuantity: null,
        providerObservedFinalQuantity: null,
        outcome: "unknown",
      });
    }

    let stageCompleted = false;
    if (addVariantGid && quantity !== null) {
      phase = "add";
      const addData = await shopifyGraphql<OrderEditMutationData>(
        ctx,
        ORDER_EDIT_ADD_VARIANT_MUTATION,
        { id: calculatedOrderId, variantId: addVariantGid, quantity },
      );
      const addPayload = addData.orderEditAddVariant;
      const addErrors = formatUserErrors(addPayload?.userErrors);
      if (addErrors) {
        return orderEditFailure(
          ctx,
          orderId,
          toolError(`Error: could not add item to order - ${addErrors}`),
          "failed",
          "provider_add_rejected",
        );
      }
      if (!addPayload?.calculatedOrder) return interruptedStageResult(ctx, orderId, "add", changes);
      changes[0] = {
        ...changes[0],
        lineItemId: addPayload.calculatedLineItem?.id?.trim() || null,
        outcome: "staged",
      };
      stageCompleted = true;
    }

    if (itemToRemove) {
      phase = "remove";
      const setQtyData = await shopifyGraphql<OrderEditMutationData>(
        ctx,
        ORDER_EDIT_SET_QUANTITY_MUTATION,
        { id: calculatedOrderId, lineItemId: itemToRemove.node.id, quantity: 0 },
      );
      const setQtyPayload = setQtyData.orderEditSetQuantity;
      const setQtyErrors = formatUserErrors(setQtyPayload?.userErrors);
      if (setQtyErrors) {
        if (stageCompleted) {
          changes[changes.length - 1] = { ...changes[changes.length - 1], outcome: "rejected" };
          const result = toolUnknown(
            `Unknown: Shopify staged the added item for order ${orderId}, but rejected removal of the old item: ${setQtyErrors}. The order was not committed by this tool; review the partial edit session before retrying.`,
          );
          const receipt = unknownOrderEditReceipt(ctx, orderId, "partial_staging_rejected", changes);
          return receipt ? { ...result, receipt } : result;
        }
        return orderEditFailure(
          ctx,
          orderId,
          toolError(`Error: could not remove old item - ${setQtyErrors}`),
          "failed",
          "provider_remove_rejected",
        );
      }
      if (!setQtyPayload?.calculatedOrder) return interruptedStageResult(ctx, orderId, "remove", changes);
      changes[changes.length - 1] = { ...changes[changes.length - 1], outcome: "staged" };
      stageCompleted = true;
    }

    phase = "commit";
    const commitData = await shopifyGraphql<OrderEditMutationData>(
      ctx,
      ORDER_EDIT_COMMIT_MUTATION,
      { id: calculatedOrderId },
    );

    const commitPayload = commitData.orderEditCommit;
    const commitErrors = formatUserErrors(commitPayload?.userErrors);
    if (commitErrors) {
      const result = toolUnknown(
        `Unknown: Shopify rejected the commit for order ${orderId} after changes were staged: ${commitErrors}. The order was not committed by this tool; review the edit session before retrying.`,
      );
      const receipt = unknownOrderEditReceipt(ctx, orderId, "commit_rejected_after_staging", changes);
      return receipt ? { ...result, receipt } : result;
    }

    const order = commitPayload?.order;
    if (
      !order
      || order.lineItems.pageInfo.hasNextPage
      || !matchesExpectedQuantities(variantQuantitiesFromCommitted(order.lineItems), expectedQuantities)
    ) {
      return reconcileCommittedEdit(ctx, orderId, expectedQuantities, changes, action);
    }

    const committedChanges = changesWithObservation(
      changes,
      observedVariantsFromCommitted(order.lineItems),
      "committed",
    );

    return formatOrderEditResult(
      order.name,
      orderId,
      action,
      order.lineItems.edges.map(({ node }) => ({
        title: node.title,
        quantity: node.currentQuantity,
        variantTitle: node.variant?.title,
      })),
      false,
      orderEditSuccessReceipt(ctx, orderId, committedChanges),
    );
  } catch (err) {
    if (orderId && isAmbiguousShopifyMutationError(err)) {
      if (phase === "commit" && expectedQuantities && action) {
        return reconcileCommittedEdit(ctx, orderId, expectedQuantities, changes, action, err);
      }
      if (phase === "begin" || phase === "add" || phase === "remove") {
        return interruptedStageResult(ctx, orderId, phase, changes, err);
      }
    }
    const fallbackOrderId = orderId ?? (input.order_id.trim() || "invalid");
    if (err instanceof ShopifyInputError) {
      return orderEditFailure(
        ctx,
        fallbackOrderId,
        toolPolicyBlock(formatShopifyToolError("failed to edit order", err)),
        "rejected",
        "invalid_order_edit_input",
      );
    }
    if (changes.some((change) => change.outcome === "staged")) {
      const result = toolUnknown(
        `Unknown: the edit session for order ${fallbackOrderId} contains staged changes after a provider failure. Do not retry until it is reviewed. ${formatShopifyToolError("failed to edit order", err)}`,
      );
      const receipt = unknownOrderEditReceipt(ctx, fallbackOrderId, "failure_after_staging", changes);
      return receipt ? { ...result, receipt } : result;
    }
    return orderEditFailure(
      ctx,
      fallbackOrderId,
      toolError(formatShopifyToolError("failed to edit order", err)),
      "failed",
      "definite_failure",
    );
  }
}
