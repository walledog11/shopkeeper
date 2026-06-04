// Input types mirror the parameter schemas in tool-schemas.ts.

export interface SearchShopifyProductsInput {
  query: string;
  limit?: number;
}

export interface SearchShopifyCustomersInput {
  query: string;
  limit?: number;
}

export interface GetShopifyCustomerInput {
  customer_id: string;
}

export interface UpdateShopifyCustomerInfoInput {
  customer_id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
}

export interface GetShopifyOrdersInput {
  customer_id: string;
}

export interface UpdateShopifyOrderAddressInput {
  order_id: string;
  customer_id: string;
  address1: string;
  address2?: string;
  city: string;
  province: string;
  zip: string;
  country: string;
}

export interface AddShopifyCustomerNoteInput {
  customer_id: string;
  note: string;
}

export interface GetOrderByNameInput {
  order_name: string;
}

export interface CreateRefundInput {
  order_id: string;
  amount?: string;
  reason?: string;
}

export interface CancelOrderInput {
  order_id: string;
  reason?: "customer" | "fraud" | "inventory" | "declined" | "other";
  restock?: boolean;
}

export interface CreateShopifyOrderLineItem {
  variant_id?: string;
  title?: string;
  price?: string;
  quantity: number;
}

export interface CreateShopifyOrderInput {
  email: string;
  first_name: string;
  last_name: string;
  address1: string;
  address2?: string;
  city: string;
  province: string;
  zip: string;
  country: string;
  line_items: CreateShopifyOrderLineItem[];
  note?: string;
}

export interface AddInternalNoteInput {
  text: string;
}

export interface SendReplyInput {
  text: string;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  body: string;
}

export interface UpdateThreadStatusInput {
  status: "open" | "pending" | "closed";
}

export interface UpdateThreadTagInput {
  tag: string;
}

export interface EscalateToHumanInput {
  reason: string;
}

export interface EditShopifyOrderInput {
  order_id: string;
  variant_id?: string;
  quantity?: number;
  remove_variant_id?: string;
}

export interface GetOrderTrackingInput {
  order_id: string;
}

export interface SearchKbInput {
  query: string;
}
