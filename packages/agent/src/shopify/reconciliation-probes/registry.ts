import { parseToolInput } from "../../tools/index.js";
import type {
  AttachReturnLabelInput,
  CancelOrderInput,
  CreateExchangeInput,
  CreateGiftCardInput,
  CreatePartialRefundInput,
  CreateRefundInput,
  CreateReturnInput,
  CreateShopifyOrderInput,
  EditShopifyOrderInput,
  FulfillOrderInput,
  IssueDiscountInput,
  IssueStoreCreditInput,
  ToolName,
  UpdateShopifyOrderAddressInput,
} from "../../tools/index.js";
import type { ShopifyContext } from "../client.js";
import type { ReconciliationProbe, ShopifyReconciliationProbeResult } from "./types.js";
import { probeCancellation } from "./probes/cancellation.js";
import { probeDiscount } from "./probes/discount.js";
import { probeFulfillment } from "./probes/fulfillment.js";
import { probeGiftCard } from "./probes/gift-card.js";
import { probeCreatedOrder } from "./probes/order-creation.js";
import { probeOrderAddress } from "./probes/order-address.js";
import { probeOrderEdit } from "./probes/order-edit.js";
import { probeRefund } from "./probes/refund.js";
import { probeReturn, probeReturnLabel } from "./probes/returns.js";
import { probeStoreCredit } from "./probes/store-credit.js";

function defineReconciliationProbe<TInput>(
  tool: ToolName,
  probe: (input: TInput, ctx: ShopifyContext) => Promise<ShopifyReconciliationProbeResult>,
): ReconciliationProbe {
  return (input, ctx) => probe(parseToolInput(tool, input) as TInput, ctx);
}

export const SHOPIFY_RECONCILIATION_PROBES = {
  create_refund: defineReconciliationProbe<CreateRefundInput>("create_refund", probeRefund),
  // Same probe: it matches on the order's refunds, and both refund tools refuse
  // an order that already has one, so exactly one refund can ever be in
  // question. The partial input carries no amount, which `probeRefund` reads as
  // "any successful refund on this order confirms it".
  create_partial_refund: defineReconciliationProbe<CreatePartialRefundInput>(
    "create_partial_refund",
    (input, ctx) => probeRefund({ order_id: input.order_id, amount: "" }, ctx),
  ),
  cancel_order: defineReconciliationProbe<CancelOrderInput>("cancel_order", probeCancellation),
  create_shopify_order: defineReconciliationProbe<CreateShopifyOrderInput>("create_shopify_order", probeCreatedOrder),
  create_gift_card: defineReconciliationProbe<CreateGiftCardInput>("create_gift_card", probeGiftCard),
  issue_store_credit: defineReconciliationProbe<IssueStoreCreditInput>("issue_store_credit", probeStoreCredit),
  edit_shopify_order: defineReconciliationProbe<EditShopifyOrderInput>("edit_shopify_order", probeOrderEdit),
  update_shopify_order_address: defineReconciliationProbe<UpdateShopifyOrderAddressInput>("update_shopify_order_address", probeOrderAddress),
  create_return: defineReconciliationProbe<CreateReturnInput>("create_return", probeReturn),
  create_exchange: defineReconciliationProbe<CreateExchangeInput>("create_exchange", probeReturn),
  attach_return_label: defineReconciliationProbe<AttachReturnLabelInput>("attach_return_label", probeReturnLabel),
  issue_discount: defineReconciliationProbe<IssueDiscountInput>("issue_discount", probeDiscount),
  fulfill_order: defineReconciliationProbe<FulfillOrderInput>("fulfill_order", probeFulfillment),
} satisfies Partial<Record<ToolName, ReconciliationProbe>>;

export const RECONCILABLE_SHOPIFY_MUTATION_TOOLS: ReadonlySet<string> = new Set(
  Object.keys(SHOPIFY_RECONCILIATION_PROBES),
);
