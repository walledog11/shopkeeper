export interface ShopifyProductVariant {
  id: number | string;
  title: string;
  price: string;
  inventory_quantity?: number | null;
}

export interface ShopifyProduct {
  id: number | string;
  title: string;
  variants?: ShopifyProductVariant[];
}

export interface ShopifyCustomerAddress {
  id?: number | string;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  province?: string | null;
  zip?: string | null;
  country?: string | null;
  country_name?: string | null;
}

export interface ShopifyCustomer {
  id: number | string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  orders_count?: number;
  total_spent?: string;
  default_address?: ShopifyCustomerAddress | null;
  note?: string | null;
}

export interface ShopifyOrderLineItem {
  id?: number | string;
  variant_id?: number | string | null;
  title: string;
  quantity: number;
  fulfillable_quantity?: number;
  current_quantity?: number;
  fulfillment_status?: string | null;
}

export interface ShopifyOrder {
  id: number | string;
  name?: string;
  order_number?: number | string;
  created_at?: string;
  financial_status?: string | null;
  fulfillment_status?: string | null;
  total_price?: string;
  current_total_price?: string;
  currency?: string;
  line_items?: ShopifyOrderLineItem[];
  shipping_address?: ShopifyCustomerAddress | null;
}

export interface ShopifyTransaction {
  id?: number | string;
  parent_id?: number | string;
  kind: string;
  gateway: string;
  amount: string;
  currency?: string;
  maximum_refundable?: string;
  status?: string;
}

export interface ShopifyCalculatedRefundLineItem {
  line_item_id: number | string;
  quantity: number;
  restock_type: string;
  location_id?: number | string | null;
}

export interface ShopifyFulfillment {
  tracking_number?: string | null;
  tracking_numbers?: string[] | null;
  tracking_company?: string | null;
  tracking_url?: string | null;
  tracking_urls?: string[] | null;
  status: string;
  shipment_status?: string | null;
  created_at?: string;
}
