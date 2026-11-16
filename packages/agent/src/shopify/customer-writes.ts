import {
  shopifyGraphql,
  ShopifyRequestError,
  type ShopifyContext,
  type ShopifyGraphqlUserError,
} from "./client.js";
import { addressFromNode, type AddressNode } from "./order-reads.js";
import { handleShopifySimulatorRest, isShopifySimulatorContext } from "./simulator-store.js";
import type { ShopifyCustomer, ShopifyCustomerAddress } from "./types.js";
import { legacyIdFromGid } from "./validation.js";

/**
 * Customer writes over the GraphQL Admin API, replacing REST `customers.json`
 * and `customers/{id}.json` writes. A write answers with the customer as Shopify
 * now holds it, in the REST shape callers confirm against, or with Shopify's
 * reasons for refusing it. The development simulator keeps its customers in
 * memory and answers in the same shape.
 */

// Mutation documents are written out in full: the registry test matches each
// one's source text against the string the schema harness validates.
export const CUSTOMER_UPDATE_MUTATION = `mutation ShopkeeperCustomerUpdate($input: CustomerInput!) {
  customerUpdate(input: $input) {
    customer { legacyResourceId firstName lastName defaultEmailAddress { emailAddress } defaultPhoneNumber { phoneNumber } note }
    userErrors { field message }
  }
}`;

export const CUSTOMER_CREATE_MUTATION = `mutation ShopkeeperCustomerCreate($input: CustomerInput!) {
  customerCreate(input: $input) {
    customer { legacyResourceId firstName lastName defaultEmailAddress { emailAddress } defaultPhoneNumber { phoneNumber } note }
    userErrors { field message }
  }
}`;

export const CUSTOMER_ADDRESS_UPDATE_MUTATION = `mutation ShopkeeperCustomerAddressUpdate($customerId: ID!, $addressId: ID!, $address: MailingAddressInput!) {
  customerAddressUpdate(customerId: $customerId, addressId: $addressId, address: $address, setAsDefault: true) {
    address { id firstName lastName address1 address2 city province provinceCode zip country countryCodeV2 }
    userErrors { field message }
  }
}`;

export const CUSTOMER_ADDRESS_CREATE_MUTATION = `mutation ShopkeeperCustomerAddressCreate($customerId: ID!, $address: MailingAddressInput!) {
  customerAddressCreate(customerId: $customerId, address: $address, setAsDefault: true) {
    address { id firstName lastName address1 address2 city province provinceCode zip country countryCodeV2 }
    userErrors { field message }
  }
}`;

/** A customer's own fields, as REST named them. Null clears one. */
export interface ShopifyCustomerFields {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  note?: string | null;
}

export interface ShopifyWriteResult<T> {
  /** What Shopify holds after the write; null when it refused. */
  value: T | null;
  userErrors: ShopifyGraphqlUserError[];
}

interface CustomerRecordNode {
  legacyResourceId: string;
  firstName: string | null;
  lastName: string | null;
  defaultEmailAddress: { emailAddress: string } | null;
  defaultPhoneNumber: { phoneNumber: string } | null;
  note: string | null;
}

type MailingAddressNode = AddressNode & { id: string };

function customerRecord(node: CustomerRecordNode): ShopifyCustomer {
  return {
    id: Number(node.legacyResourceId),
    first_name: node.firstName,
    last_name: node.lastName,
    email: node.defaultEmailAddress?.emailAddress ?? null,
    phone: node.defaultPhoneNumber?.phoneNumber ?? null,
    note: node.note,
  };
}

function customerInput(fields: ShopifyCustomerFields) {
  return {
    ...(fields.first_name !== undefined ? { firstName: fields.first_name } : {}),
    ...(fields.last_name !== undefined ? { lastName: fields.last_name } : {}),
    ...(fields.email !== undefined ? { email: fields.email } : {}),
    ...(fields.phone !== undefined ? { phone: fields.phone } : {}),
    ...(fields.note !== undefined ? { note: fields.note } : {}),
  };
}

/**
 * An address as a mutation takes it, from REST's field names. Province and
 * country are passed as written: REST accepted a name or a code for either, and
 * the deprecated `province` and `country` inputs are the ones that still do.
 */
export function mailingAddressInput(address: Record<string, string | null | undefined>) {
  return Object.fromEntries(Object.entries({
    firstName: address.first_name,
    lastName: address.last_name,
    address1: address.address1,
    address2: address.address2,
    city: address.city,
    province: address.province,
    zip: address.zip,
    country: address.country,
  }).filter(([, value]) => value !== undefined));
}

// A customer's address in the REST shape, keeping the global id a write names.
function mailingAddressRecord(node: MailingAddressNode): ShopifyCustomerAddress & { gid: string } {
  return { ...addressFromNode(node), id: legacyIdFromGid(node.id), gid: node.id };
}

function simulatorCustomerWrite(ctx: ShopifyContext, customerId: string, body: Record<string, unknown>) {
  const result = handleShopifySimulatorRest(ctx, `customers/${customerId}.json`, {
    method: "PUT",
    body: { customer: { id: customerId, ...body } },
  });
  if (!result?.ok) {
    throw new ShopifyRequestError("Shopify API request failed.", { status: result?.status, payload: result?.payload });
  }
  return (result.data as { customer?: ShopifyCustomer }).customer ?? null;
}

export async function updateShopifyCustomerRecord(
  ctx: ShopifyContext,
  customerId: string,
  fields: ShopifyCustomerFields,
): Promise<ShopifyWriteResult<ShopifyCustomer>> {
  if (isShopifySimulatorContext(ctx)) {
    return { value: simulatorCustomerWrite(ctx, customerId, { ...fields }), userErrors: [] };
  }
  const data = await shopifyGraphql<{
    customerUpdate: { customer: CustomerRecordNode | null; userErrors: ShopifyGraphqlUserError[] };
  }>(ctx, CUSTOMER_UPDATE_MUTATION, {
    input: { id: `gid://shopify/Customer/${customerId}`, ...customerInput(fields) },
  });
  const { customer, userErrors } = data.customerUpdate;
  return { value: customer ? customerRecord(customer) : null, userErrors };
}

export async function createShopifyCustomerRecord(
  ctx: ShopifyContext,
  fields: ShopifyCustomerFields,
): Promise<ShopifyWriteResult<ShopifyCustomer>> {
  if (isShopifySimulatorContext(ctx)) {
    return { value: null, userErrors: [{ message: "The demo store does not create customers." }] };
  }
  const data = await shopifyGraphql<{
    customerCreate: { customer: CustomerRecordNode | null; userErrors: ShopifyGraphqlUserError[] };
  }>(ctx, CUSTOMER_CREATE_MUTATION, { input: customerInput(fields) });
  const { customer, userErrors } = data.customerCreate;
  return { value: customer ? customerRecord(customer) : null, userErrors };
}

export const CUSTOMER_DEFAULT_ADDRESS_QUERY = `query ShopkeeperCustomerDefaultAddress($id: ID!) {
  customer(id: $id) {
    defaultAddress { id firstName lastName address1 address2 city province provinceCode zip country countryCodeV2 }
  }
}`;

/** The customer's default address, with the global id an address write names; null when they have none. */
export async function fetchShopifyCustomerDefaultAddress(
  ctx: ShopifyContext,
  customerId: string,
  options: { maxRetries?: number } = {},
): Promise<(ShopifyCustomerAddress & { gid: string }) | null> {
  if (isShopifySimulatorContext(ctx)) {
    const result = handleShopifySimulatorRest(ctx, `customers/${customerId}.json`);
    const address = result?.ok ? (result.data as { customer?: ShopifyCustomer }).customer?.default_address : null;
    return address ? { ...address, gid: `gid://shopify/MailingAddress/${address.id ?? customerId}` } : null;
  }
  const data = await shopifyGraphql<{ customer: { defaultAddress: MailingAddressNode | null } | null }>(
    ctx,
    CUSTOMER_DEFAULT_ADDRESS_QUERY,
    { id: `gid://shopify/Customer/${customerId}` },
    { maxRetries: options.maxRetries },
  );
  const address = data.customer?.defaultAddress;
  return address ? mailingAddressRecord(address) : null;
}

/**
 * Writes the customer's default address: the one they have, changed in place,
 * or a new one when they have none.
 */
export async function saveShopifyCustomerDefaultAddress(
  ctx: ShopifyContext,
  customerId: string,
  currentAddressGid: string | null,
  address: Record<string, string | null | undefined>,
): Promise<ShopifyWriteResult<ShopifyCustomerAddress & { gid: string }>> {
  if (isShopifySimulatorContext(ctx)) {
    const customer = simulatorCustomerWrite(ctx, customerId, { addresses: [address] });
    const saved = customer?.default_address;
    return {
      value: saved ? { ...saved, gid: `gid://shopify/MailingAddress/${saved.id ?? customerId}` } : null,
      userErrors: [],
    };
  }
  const customerGid = `gid://shopify/Customer/${customerId}`;
  const input = mailingAddressInput(address);
  if (currentAddressGid) {
    const data = await shopifyGraphql<{
      customerAddressUpdate: { address: MailingAddressNode | null; userErrors: ShopifyGraphqlUserError[] };
    }>(ctx, CUSTOMER_ADDRESS_UPDATE_MUTATION, { customerId: customerGid, addressId: currentAddressGid, address: input });
    const { address: saved, userErrors } = data.customerAddressUpdate;
    return { value: saved ? mailingAddressRecord(saved) : null, userErrors };
  }
  const data = await shopifyGraphql<{
    customerAddressCreate: { address: MailingAddressNode | null; userErrors: ShopifyGraphqlUserError[] };
  }>(ctx, CUSTOMER_ADDRESS_CREATE_MUTATION, { customerId: customerGid, address: input });
  const { address: saved, userErrors } = data.customerAddressCreate;
  return { value: saved ? mailingAddressRecord(saved) : null, userErrors };
}
