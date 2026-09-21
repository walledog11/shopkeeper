// Structured result every tool implementation returns. The executor and planner
// branch on `status`; `message` is the only text the model ever sees, so wording
// can change without touching control flow.
export type ToolStatus = "ok" | "error" | "not_found" | "policy_block" | "escalated" | "unknown";

export interface ReceiptTargetV1 {
  kind: string;
  id: string;
}

export interface ReceiptBaseV1<TTool extends string = string> {
  version: 1;
  operationId: string;
  executionId: string;
  tool: TTool;
  target: ReceiptTargetV1;
  observedAt: string;
  providerReference: string | null;
}

export interface RefundReceiptFactsV1 {
  orderId: string;
  refundId: string;
  amount: string;
  currency: string;
  transactionStatus: string;
  transactionReference: string;
  classification: "full" | "partial";
}

export interface PartialRefundReceiptFactsV1 extends RefundReceiptFactsV1 {
  classification: "partial";
  lineItems: Array<{ lineItemId: string; quantity: number }>;
}

export interface CancellationReceiptFactsV1 {
  orderId: string;
  cancelledAt: string;
  reason: string;
  financialStatus: string;
  restockResult: string | null;
}

export interface ReturnReceiptFactsV1 {
  orderId: string;
  returnId: string;
  returnName: string;
  status: string;
  lineItems: Array<{ fulfillmentLineItemId: string; quantity: number }>;
  refundIssued: false;
}

export interface ExchangeReceiptFactsV1 {
  orderId: string;
  returnId: string;
  returnName: string;
  status: string;
  returnedItems: Array<{
    variantId: string;
    fulfillmentLineItemId: string;
    quantity: number;
  }>;
  replacementItems: Array<{ variantId: string; quantity: number }>;
  financialConsequence: {
    kind: "refund" | "charge";
    amount: string;
    currency: string;
  } | null;
}

export interface ReturnLabelReceiptFactsV1 {
  orderId: string;
  returnId: string;
  reverseFulfillmentOrderId: string;
  reverseDeliveryId: string;
  labelSha256: string;
  trackingNumber: string | null;
  attachmentState: "attached";
}

export interface FulfillmentReceiptFactsV1 {
  orderId: string;
  fulfillmentId: string;
  status: string;
  fulfilledAt: string;
  lineItems: Array<{ fulfillmentLineItemId: string; lineItemId: string; quantity: number }>;
  tracking: {
    number: string | null;
    company: string | null;
    url: string | null;
  };
  notifyCustomerRequested: boolean;
}

export interface AddressReceiptAddressV1 {
  firstName: string | null;
  lastName: string | null;
  address1: string;
  address2: string | null;
  city: string;
  province: string;
  provinceCode: string | null;
  postalCode: string;
  country: string;
  countryCode: string | null;
}

export interface OrderAddressReceiptFactsV1 {
  orderId: string;
  customerId: string;
  orderAddress: {
    outcome: "updated" | "already_matched";
    address: AddressReceiptAddressV1;
  };
  customerDefaultAddress:
    | {
        outcome: "updated" | "already_matched";
        addressId: string;
        address: AddressReceiptAddressV1;
      }
    | { outcome: "not_updated"; code: "no_default_address" }
    | { outcome: "failed" | "unknown"; code: string };
}

export interface OrderEditReceiptChangeV1 {
  kind: "addition" | "removal";
  variantId: string;
  lineItemId: string | null;
  requestedQuantity: number | null;
  providerObservedFinalQuantity: number | null;
  outcome: "committed" | "staged" | "rejected" | "unknown";
}

export interface OrderEditReceiptFactsV1 {
  orderId: string;
  changes: OrderEditReceiptChangeV1[];
}

export interface OrderCreationReceiptFactsV1 {
  orderId: string;
  orderName: string;
  operationTag: string;
  financialStatus: string;
  adminUrl: string;
  totalAmount: string;
  currency: string;
}

export type CustomerInfoReceiptFieldV1 = "firstName" | "lastName" | "email" | "phone";

export interface CustomerInfoReceiptFactsV1 {
  customerId: string;
  updates: Array<{ field: CustomerInfoReceiptFieldV1; value: string }>;
}

export interface CustomerNoteReceiptFactsV1 {
  customerId: string;
  previousNoteSha256: string;
  appendedNoteSha256: string;
  resultingNoteSha256: string;
  resultingNoteLength: number;
  appendState: "appended";
}

export interface GiftCardReceiptFactsV1 {
  giftCardId: string;
  customerId: string;
  amount: string;
  currency: string;
  codeSha256: string;
  lastCharacters: string;
  expiresOn: string | null;
  notificationRequested: true;
}

export interface FlashSaleReceiptFactsV1 {
  flashSaleId: string;
  appliesTo: "entire_catalog" | "variants";
  variantIds: string[];
  discountPercentage: string;
  startsAt: string;
  endsAt: string;
  providerStatus: string;
}

export interface EndFlashSaleReceiptFactsV1 {
  flashSaleId: string;
  confirmation: "deleted" | "absent_after_ambiguous_response";
}

export interface VariantPriceReceiptChangeV1 {
  productId: string;
  variantId: string;
  originalPrice: string;
  requestedPrice: string;
  observedPrice: string | null;
}

export interface VariantPriceReceiptBatchV1 {
  productId: string;
  outcome: "succeeded" | "failed" | "unknown";
  confirmation: "mutation_response" | "read_after_ambiguous_response" | "provider_rejected" | "not_attempted";
  changes: VariantPriceReceiptChangeV1[];
}

export interface VariantPriceReceiptFactsV1 {
  currency: string | null;
  batches: VariantPriceReceiptBatchV1[];
}

export interface InternalNoteReceiptFactsV1 {
  threadId: string;
  messageId: string;
  contentSha256: string;
}

export interface ThreadStatusReceiptFactsV1 {
  threadId: string;
  beforeStatus: string;
  afterStatus: string;
}

export interface ThreadTagReceiptFactsV1 {
  threadId: string;
  beforeTag: string | null;
  afterTag: string;
}

export interface TicketSpamReceiptFactsV1 {
  threadId: string;
  beforeFilterState: string;
  afterFilterState: "filtered";
  decidedAt: string;
}

export interface CommunicationReceiptFactsV1 {
  logicalResponseId: string;
  messageId: string;
  threadId: string;
  destination: { kind: "thread" | "email"; id: string };
  contentSha256: string;
  deliveryState: "accepted" | "sent" | "delivered" | "unknown";
  providerMessageId: string | null;
}

export type ReceiptSuccessV1 =
  | (ReceiptBaseV1<"create_refund"> & {
      outcome: "succeeded";
      providerReference: string;
      facts: RefundReceiptFactsV1;
    })
  | (ReceiptBaseV1<"create_partial_refund"> & {
      outcome: "succeeded";
      providerReference: string;
      facts: PartialRefundReceiptFactsV1;
    })
  | (ReceiptBaseV1<"cancel_order"> & {
      outcome: "succeeded";
      providerReference: string | null;
      facts: CancellationReceiptFactsV1;
    })
  | (ReceiptBaseV1<"create_return"> & {
      outcome: "succeeded";
      providerReference: string;
      facts: ReturnReceiptFactsV1;
    })
  | (ReceiptBaseV1<"create_exchange"> & {
      outcome: "succeeded";
      providerReference: string;
      facts: ExchangeReceiptFactsV1;
    })
  | (ReceiptBaseV1<"attach_return_label"> & {
      outcome: "succeeded";
      providerReference: string;
      facts: ReturnLabelReceiptFactsV1;
    })
  | (ReceiptBaseV1<"fulfill_order"> & {
      outcome: "succeeded";
      providerReference: string;
      facts: FulfillmentReceiptFactsV1;
    })
  | (ReceiptBaseV1<"update_shopify_order_address"> & {
      outcome: "succeeded";
      providerReference: string;
      facts: OrderAddressReceiptFactsV1;
    })
  | (ReceiptBaseV1<"edit_shopify_order"> & {
      outcome: "succeeded";
      providerReference: string;
      facts: OrderEditReceiptFactsV1;
    })
  | (ReceiptBaseV1<"create_shopify_order"> & {
      outcome: "succeeded";
      providerReference: string;
      facts: OrderCreationReceiptFactsV1;
    })
  | (ReceiptBaseV1<"update_shopify_customer_info"> & {
      outcome: "succeeded";
      providerReference: string;
      facts: CustomerInfoReceiptFactsV1;
    })
  | (ReceiptBaseV1<"add_shopify_customer_note"> & {
      outcome: "succeeded";
      providerReference: string;
      facts: CustomerNoteReceiptFactsV1;
    })
  | (ReceiptBaseV1<"create_gift_card"> & {
      outcome: "succeeded";
      providerReference: string;
      facts: GiftCardReceiptFactsV1;
    })
  | (ReceiptBaseV1<"create_flash_sale"> & {
      outcome: "succeeded";
      providerReference: string;
      facts: FlashSaleReceiptFactsV1;
    })
  | (ReceiptBaseV1<"end_flash_sale"> & {
      outcome: "succeeded";
      providerReference: string;
      facts: EndFlashSaleReceiptFactsV1;
    })
  | (ReceiptBaseV1<"set_variant_prices"> & {
      outcome: "succeeded";
      providerReference: string;
      facts: VariantPriceReceiptFactsV1;
    })
  | (ReceiptBaseV1<"add_internal_note"> & {
      outcome: "succeeded";
      providerReference: string;
      facts: InternalNoteReceiptFactsV1;
    })
  | (ReceiptBaseV1<"update_thread_status"> & {
      outcome: "succeeded";
      providerReference: string;
      facts: ThreadStatusReceiptFactsV1;
    })
  | (ReceiptBaseV1<"update_thread_tag"> & {
      outcome: "succeeded";
      providerReference: string;
      facts: ThreadTagReceiptFactsV1;
    })
  | (ReceiptBaseV1<"mark_ticket_spam"> & {
      outcome: "succeeded";
      providerReference: string;
      facts: TicketSpamReceiptFactsV1;
    })
  | (ReceiptBaseV1<"send_reply" | "send_email" | "send_ticket_reply"> & {
      outcome: "succeeded";
      providerReference: string;
      facts: CommunicationReceiptFactsV1;
    });

export type ReceiptToolV1 = ReceiptSuccessV1["tool"];

type ReceiptFailureWithoutPartialFactsV1 = ReceiptBaseV1<ReceiptToolV1> & {
  outcome: "not_found" | "rejected" | "failed" | "unknown";
  code: string;
  facts?: never;
};

type OrderAddressPartialUnknownReceiptV1 = ReceiptBaseV1<"update_shopify_order_address"> & {
  outcome: "unknown";
  code: string;
  facts: OrderAddressReceiptFactsV1;
};

type OrderEditPartialUnknownReceiptV1 = ReceiptBaseV1<"edit_shopify_order"> & {
  outcome: "unknown";
  code: string;
  facts: OrderEditReceiptFactsV1;
};

type VariantPricePartialUnknownReceiptV1 = ReceiptBaseV1<"set_variant_prices"> & {
  outcome: "unknown";
  code: string;
  providerReference: string;
  facts: VariantPriceReceiptFactsV1;
};

type CommunicationPartialUnknownReceiptV1 = ReceiptBaseV1<"send_reply" | "send_email" | "send_ticket_reply"> & {
  outcome: "unknown";
  code: string;
  providerReference: string;
  facts: CommunicationReceiptFactsV1;
};

export type ReceiptFailureV1 =
  | ReceiptFailureWithoutPartialFactsV1
  | OrderAddressPartialUnknownReceiptV1
  | OrderEditPartialUnknownReceiptV1
  | VariantPricePartialUnknownReceiptV1
  | CommunicationPartialUnknownReceiptV1;

export type ReceiptV1 = ReceiptSuccessV1 | ReceiptFailureV1;

export interface ToolResult {
  status: ToolStatus;
  message: string;
  data?: unknown;
  receipt?: ReceiptV1;
}

/**
 * The answer to "may this compensation spend against today's budget?".
 *
 * A tool whose amount is on the call the model made is reserved before dispatch
 * and never sees this. A tool whose amount only exists once the provider has
 * priced the selection asks for it mid-execution instead, so the refusal has to
 * travel back as the result the adapter should return rather than as a thrown
 * error it would have to translate.
 */
export type CompensationReservation =
  | { kind: "reserved" }
  | { kind: "refused"; result: ToolResult; policyBlocked: boolean };

