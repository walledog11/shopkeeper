import { currencyAmount } from "../money.js";
import {
  parseNextPageInfo,
  shopifyGraphql,
  ShopifyRequestError,
  shopifySearchValue,
  type ShopifyContext,
} from "./client.js";
import { handleShopifySimulatorRest, isShopifySimulatorContext } from "./simulator-store.js";
import type { ShopifyCustomer } from "./types.js";

/**
 * Customer reads over the GraphQL Admin API, replacing REST `customers/{id}`,
 * `customers/search` and `customers`. Customers come back in the REST shape
 * (`ShopifyCustomer`), so a serialized customer the model reads is unchanged.
 */

const CUSTOMER_FIELDS = `
    legacyResourceId
    firstName
    lastName
    defaultEmailAddress { emailAddress }
    defaultPhoneNumber { phoneNumber }
    numberOfOrders
    amountSpent { amount currencyCode }
    note
    createdAt
    defaultAddress { address1 address2 city province provinceCode zip country countryCodeV2 }`;

export const CUSTOMER_QUERY = `query ShopkeeperCustomer($id: ID!) {
  customer(id: $id) {${CUSTOMER_FIELDS}
  }
}`;

export const CUSTOMERS_QUERY = `query ShopkeeperCustomers($query: String, $first: Int!, $after: String) {
  customers(first: $first, after: $after, query: $query, sortKey: UPDATED_AT, reverse: true) {
    nodes {${CUSTOMER_FIELDS}
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

interface CustomerNode {
  legacyResourceId: string;
  firstName: string | null;
  lastName: string | null;
  defaultEmailAddress: { emailAddress: string } | null;
  defaultPhoneNumber: { phoneNumber: string } | null;
  numberOfOrders: string;
  amountSpent: { amount: string; currencyCode: string };
  note: string | null;
  createdAt: string;
  defaultAddress: {
    address1: string | null;
    address2: string | null;
    city: string | null;
    province: string | null;
    provinceCode: string | null;
    zip: string | null;
    country: string | null;
    countryCodeV2: string | null;
  } | null;
}

function customerFromNode(node: CustomerNode): ShopifyCustomer {
  return {
    id: Number(node.legacyResourceId),
    first_name: node.firstName,
    last_name: node.lastName,
    email: node.defaultEmailAddress?.emailAddress ?? null,
    phone: node.defaultPhoneNumber?.phoneNumber ?? null,
    orders_count: Number(node.numberOfOrders),
    total_spent: currencyAmount(node.amountSpent.amount, node.amountSpent.currencyCode),
    currency: node.amountSpent.currencyCode,
    note: node.note,
    created_at: node.createdAt,
    default_address: node.defaultAddress
      ? {
          address1: node.defaultAddress.address1,
          address2: node.defaultAddress.address2,
          city: node.defaultAddress.city,
          province: node.defaultAddress.province,
          province_code: node.defaultAddress.provinceCode,
          zip: node.defaultAddress.zip,
          country: node.defaultAddress.country,
          country_code: node.defaultAddress.countryCodeV2,
          country_name: node.defaultAddress.country,
        }
      : null,
  };
}

export interface CustomerPage {
  customers: ShopifyCustomer[];
  nextCursor: string | null;
}

interface CustomerReadOptions {
  maxRetries?: number;
}

export async function fetchShopifyCustomer(
  ctx: ShopifyContext,
  customerId: string | number,
  options: CustomerReadOptions = {},
): Promise<ShopifyCustomer | null> {
  const id = String(customerId).trim();
  if (!/^\d+$/.test(id)) throw new ShopifyRequestError(`Invalid Shopify customer id "${id}".`);
  if (isShopifySimulatorContext(ctx)) {
    const result = handleShopifySimulatorRest(ctx, `customers/${id}.json`);
    return result?.ok ? (result.data as { customer?: ShopifyCustomer }).customer ?? null : null;
  }
  const data = await shopifyGraphql<{ customer: CustomerNode | null }>(
    ctx,
    CUSTOMER_QUERY,
    { id: `gid://shopify/Customer/${id}` },
    { maxRetries: options.maxRetries },
  );
  return data.customer ? customerFromNode(data.customer) : null;
}

// Who a customer is and nothing more: what a search result, a name lookup or an
// email match needs. Their address, spend and notes stay unread.
export const CUSTOMER_IDENTITIES_QUERY = `query ShopkeeperCustomerIdentities($query: String!, $first: Int!) {
  customers(first: $first, query: $query, sortKey: UPDATED_AT, reverse: true) {
    nodes { legacyResourceId firstName lastName defaultEmailAddress { emailAddress } defaultPhoneNumber { phoneNumber } }
  }
}`;

export interface ShopifyCustomerIdentity {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
}

/** Customers matching Shopify's customer search syntax, identity fields only. */
export async function searchShopifyCustomerIdentities(
  ctx: ShopifyContext,
  query: string,
  options: CustomerReadOptions & { first: number },
): Promise<ShopifyCustomerIdentity[]> {
  if (isShopifySimulatorContext(ctx)) {
    const { customers } = await searchShopifyCustomers(ctx, query, options);
    return customers.map((customer) => ({
      id: Number(customer.id),
      first_name: customer.first_name ?? null,
      last_name: customer.last_name ?? null,
      email: customer.email ?? null,
      phone: customer.phone ?? null,
    }));
  }
  const data = await shopifyGraphql<{
    customers: {
      nodes: Pick<
        CustomerNode,
        "legacyResourceId" | "firstName" | "lastName" | "defaultEmailAddress" | "defaultPhoneNumber"
      >[];
    };
  }>(ctx, CUSTOMER_IDENTITIES_QUERY, { query, first: options.first }, { maxRetries: options.maxRetries });
  return data.customers.nodes.map((node) => ({
    id: Number(node.legacyResourceId),
    first_name: node.firstName,
    last_name: node.lastName,
    email: node.defaultEmailAddress?.emailAddress ?? null,
    phone: node.defaultPhoneNumber?.phoneNumber ?? null,
  }));
}

/** The customer with exactly this email, identity fields only, or null. */
export async function findShopifyCustomerByEmail(
  ctx: ShopifyContext,
  email: string,
  options: CustomerReadOptions = {},
): Promise<ShopifyCustomerIdentity | null> {
  const wanted = email.trim().toLowerCase();
  const matches = await searchShopifyCustomerIdentities(ctx, `email:${shopifySearchValue(wanted)}`, { first: 5, ...options });
  return matches.find((customer) => (customer.email ?? "").trim().toLowerCase() === wanted) ?? null;
}

/**
 * Customers matching Shopify's customer search syntax (free text matches name,
 * email and phone), newest activity first. An empty query lists every customer.
 */
export async function searchShopifyCustomers(
  ctx: ShopifyContext,
  query: string,
  options: CustomerReadOptions & { first: number; after?: string | null },
): Promise<CustomerPage> {
  if (isShopifySimulatorContext(ctx)) {
    const result = handleShopifySimulatorRest(ctx, query.trim() ? "customers/search.json" : "customers.json", {
      query: { query: query.replace(/"/g, ""), limit: options.first, ...(options.after ? { page_info: options.after } : {}) },
    });
    if (!result?.ok) return { customers: [], nextCursor: null };
    return {
      customers: (result.data as { customers?: ShopifyCustomer[] }).customers ?? [],
      nextCursor: parseNextPageInfo(result.headers),
    };
  }
  const data = await shopifyGraphql<{
    customers: { nodes: CustomerNode[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
  }>(
    ctx,
    CUSTOMERS_QUERY,
    { query: query.trim() || null, first: options.first, after: options.after ?? null },
    { maxRetries: options.maxRetries },
  );
  return {
    customers: data.customers.nodes.map(customerFromNode),
    nextCursor: data.customers.pageInfo.hasNextPage ? data.customers.pageInfo.endCursor : null,
  };
}
