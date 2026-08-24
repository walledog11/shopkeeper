export const SHOPIFY_SIMULATOR_DOMAIN = "demo-store.shopkeeper.test";
export const SHOPIFY_SIMULATOR_TOKEN = "shopkeeper-development-simulator";

export interface ShopifySimulatorRequest {
  method?: string;
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
}

export type ShopifySimulatorResult =
  | { ok: true; data: unknown; headers: Headers }
  | { ok: false; status: number; payload: unknown };

interface SimulatorAddress {
  id: number;
  address1: string;
  city: string;
  province: string;
  country_name: string;
  zip: string;
}

interface SimulatorCustomer {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  note: string | null;
  created_at: string;
  default_address: SimulatorAddress | null;
}

interface SimulatorLineItem {
  id: number;
  title: string;
  quantity: number;
  current_quantity: number;
  variant_title: string | null;
  product_id: number | null;
  sku: string | null;
}

interface SimulatorOrder {
  id: number;
  name: string;
  created_at: string;
  financial_status: string;
  fulfillment_status: string | null;
  total_price: string;
  current_total_price: string;
  currency: string;
  customer_id: number | null;
  line_items: SimulatorLineItem[];
}

interface SimulatorProduct {
  id: number;
  title: string;
  images: { src: string }[];
}

interface SimulatorState {
  customers: SimulatorCustomer[];
  orders: SimulatorOrder[];
  products: SimulatorProduct[];
}

const UNPAID_FINANCIAL = new Set(["pending", "authorized", "partially_paid"]);
const UNFULFILLED = new Set(["", "unfulfilled", "partial", "partially_fulfilled"]);

let state: SimulatorState = createSeedState();

export function isShopifySimulatorContext(ctx: { shop: string; accessToken?: string }): boolean {
  return normalizeSimulatorShop(ctx.shop) === SHOPIFY_SIMULATOR_DOMAIN
    || ctx.accessToken === SHOPIFY_SIMULATOR_TOKEN;
}

export function resetShopifySimulatorStore(): void {
  state = createSeedState();
}

export function handleShopifySimulatorRest(
  ctx: { shop: string },
  path: string,
  options: ShopifySimulatorRequest = {},
): ShopifySimulatorResult | null {
  if (!isShopifySimulatorContext(ctx)) return null;

  const method = (options.method ?? "GET").toUpperCase();
  const query = options.query ?? {};
  const normalizedPath = path.replace(/^\/+/, "").split("?")[0] ?? "";

  if (normalizedPath === "shop.json" && method === "GET") {
    return jsonOk({ shop: { id: 1, name: "Linen & Loom", myshopify_domain: SHOPIFY_SIMULATOR_DOMAIN } });
  }
  if (normalizedPath === "products.json" && method === "GET") {
    return listProducts(query);
  }
  if (normalizedPath === "orders.json" && method === "GET") {
    return listOrders(query);
  }
  if (normalizedPath === "customers.json" && method === "GET") {
    return listCustomers(query);
  }
  if (normalizedPath === "customers/search.json" && method === "GET") {
    return searchCustomers(query);
  }

  const customerMatch = normalizedPath.match(/^customers\/(\d+)\.json$/);
  if (customerMatch) {
    const customerId = Number(customerMatch[1]);
    if (method === "GET") return getCustomer(customerId);
    if (method === "PUT") return updateCustomer(customerId, options.body);
  }

  return { ok: false, status: 404, payload: { errors: "Not Found" } };
}

function normalizeSimulatorShop(shop: string): string {
  return shop
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

function jsonOk(data: unknown, nextPageInfo: string | null = null): ShopifySimulatorResult {
  const headers = new Headers({ "content-type": "application/json" });
  if (nextPageInfo) {
    headers.set(
      "link",
      `<https://${SHOPIFY_SIMULATOR_DOMAIN}/admin/api/2026-04/resource.json?page_info=${nextPageInfo}>; rel="next"`,
    );
  }
  return { ok: true, data, headers };
}

function queryString(query: ShopifySimulatorRequest["query"], key: string): string {
  const value = query?.[key];
  return value == null ? "" : String(value);
}

function queryLimit(query: ShopifySimulatorRequest["query"]): number {
  const parsed = Number(queryString(query, "limit") || 25);
  if (!Number.isFinite(parsed)) return 25;
  return Math.min(Math.max(Math.trunc(parsed), 1), 50);
}

function pageSlice<T>(items: T[], query: ShopifySimulatorRequest["query"]): { items: T[]; nextPageInfo: string | null } {
  const limit = queryLimit(query);
  const pageInfo = queryString(query, "page_info");
  const offset = pageInfo.startsWith("sim:") ? Number(pageInfo.slice(4)) || 0 : 0;
  const sliced = items.slice(offset, offset + limit);
  const nextOffset = offset + sliced.length;
  return {
    items: sliced,
    nextPageInfo: nextOffset < items.length ? `sim:${nextOffset}` : null,
  };
}

function customerRecord(customer: SimulatorCustomer) {
  const orders = state.orders.filter((order) => order.customer_id === customer.id);
  const totalSpent = orders.reduce((sum, order) => sum + Number(order.current_total_price), 0);
  return {
    ...customer,
    orders_count: orders.length,
    total_spent: totalSpent.toFixed(2),
    currency: "USD",
  };
}

function orderRecord(order: SimulatorOrder) {
  const customer = state.customers.find((row) => row.id === order.customer_id) ?? null;
  return {
    ...order,
    customer: customer
      ? {
          id: customer.id,
          first_name: customer.first_name,
          last_name: customer.last_name,
          email: customer.email,
        }
      : null,
  };
}

function listCustomers(query: ShopifySimulatorRequest["query"]): ShopifySimulatorResult {
  const sorted = [...state.customers].sort((left, right) => right.created_at.localeCompare(left.created_at));
  const page = pageSlice(sorted, query);
  return jsonOk({ customers: page.items.map(customerRecord) }, page.nextPageInfo);
}

function searchCustomers(query: ShopifySimulatorRequest["query"]): ShopifySimulatorResult {
  const needle = queryString(query, "query").trim().toLowerCase();
  const matches = state.customers.filter((customer) => {
    if (!needle) return true;
    const haystack = [
      customer.first_name,
      customer.last_name,
      customer.email,
      customer.phone ?? "",
    ].join(" ").toLowerCase();
    return haystack.includes(needle.replace(/^email:/, ""));
  });
  const page = pageSlice(matches, query);
  return jsonOk({ customers: page.items.map(customerRecord) }, page.nextPageInfo);
}

function getCustomer(customerId: number): ShopifySimulatorResult {
  const customer = state.customers.find((row) => row.id === customerId);
  if (!customer) return { ok: false, status: 404, payload: { errors: "Not Found" } };
  return jsonOk({ customer: customerRecord(customer) });
}

function updateCustomer(customerId: number, body: unknown): ShopifySimulatorResult {
  const customer = state.customers.find((row) => row.id === customerId);
  if (!customer) return { ok: false, status: 404, payload: { errors: "Not Found" } };

  const payload = (body && typeof body === "object" && "customer" in body)
    ? (body as { customer?: Record<string, unknown> }).customer
    : null;
  if (!payload || typeof payload !== "object") {
    return { ok: false, status: 422, payload: { errors: { customer: ["expected"] } } };
  }

  if (typeof payload.first_name === "string") customer.first_name = payload.first_name;
  if (typeof payload.last_name === "string") customer.last_name = payload.last_name;
  if (typeof payload.email === "string") customer.email = payload.email;
  if (payload.phone === null || typeof payload.phone === "string") customer.phone = payload.phone;
  if (payload.note === null || typeof payload.note === "string") customer.note = payload.note;

  const addresses = Array.isArray(payload.addresses) ? payload.addresses[0] : null;
  if (addresses && typeof addresses === "object") {
    const next = addresses as Record<string, unknown>;
    customer.default_address = {
      id: customer.default_address?.id ?? customer.id * 10,
      address1: stringOrKeep(next.address1, customer.default_address?.address1 ?? ""),
      city: stringOrKeep(next.city, customer.default_address?.city ?? ""),
      province: stringOrKeep(next.province, customer.default_address?.province ?? ""),
      zip: stringOrKeep(next.zip, customer.default_address?.zip ?? ""),
      country_name: stringOrKeep(next.country, customer.default_address?.country_name ?? ""),
    };
  }

  return jsonOk({ customer: customerRecord(customer) });
}

function stringOrKeep(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function listOrders(query: ShopifySimulatorRequest["query"]): ShopifySimulatorResult {
  const customerId = queryString(query, "customer_id");
  const email = queryString(query, "email").trim().toLowerCase();
  const name = queryString(query, "name").trim().toLowerCase();
  const fulfillmentStatus = queryString(query, "fulfillment_status").toLowerCase();
  const financialStatus = queryString(query, "financial_status").toLowerCase();

  let orders = [...state.orders].sort((left, right) => right.created_at.localeCompare(left.created_at));

  if (customerId) {
    orders = orders.filter((order) => String(order.customer_id) === customerId);
  }
  if (email) {
    orders = orders.filter((order) => {
      const customer = state.customers.find((row) => row.id === order.customer_id);
      return customer?.email.toLowerCase() === email;
    });
  }
  if (name) {
    const wanted = name.startsWith("#") ? name : `#${name}`;
    orders = orders.filter((order) => order.name.toLowerCase() === wanted);
  }
  if (fulfillmentStatus && fulfillmentStatus !== "any") {
    orders = orders.filter((order) => matchesFulfillmentFilter(order.fulfillment_status, fulfillmentStatus));
  }
  if (financialStatus && financialStatus !== "any") {
    orders = orders.filter((order) => matchesFinancialFilter(order.financial_status, financialStatus));
  }

  const page = pageSlice(orders, query);
  return jsonOk({ orders: page.items.map(orderRecord) }, page.nextPageInfo);
}

function matchesFulfillmentFilter(status: string | null, filter: string): boolean {
  const normalized = (status ?? "").toLowerCase();
  if (filter === "unfulfilled") return UNFULFILLED.has(normalized);
  if (filter === "shipped" || filter === "fulfilled") return normalized === "fulfilled";
  if (filter === "partial") return normalized === "partial" || normalized === "partially_fulfilled";
  return normalized === filter;
}

function matchesFinancialFilter(status: string, filter: string): boolean {
  const normalized = status.toLowerCase();
  if (filter === "unpaid") return UNPAID_FINANCIAL.has(normalized);
  return normalized === filter;
}

function listProducts(query: ShopifySimulatorRequest["query"]): ShopifySimulatorResult {
  const ids = new Set(
    queryString(query, "ids")
      .split(",")
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value) && value > 0),
  );
  const products = ids.size === 0
    ? state.products
    : state.products.filter((product) => ids.has(product.id));
  return jsonOk({ products });
}

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function daysAgo(days: number): string {
  return minutesAgo(days * 24 * 60);
}

function createSeedState(): SimulatorState {
  const customers: SimulatorCustomer[] = [
    customer(1001, "Maya", "Ellison", "maya.ellison@example.com", "+1 415 555 0142", 18, {
      address1: "128 Filbert Street",
      city: "San Francisco",
      province: "CA",
      zip: "94133",
      country_name: "United States",
    }),
    customer(1002, "Devon", "Park", "devon.park@example.com", "+1 503 555 0194", 16, {
      address1: "44 Division Street",
      city: "Portland",
      province: "OR",
      zip: "97214",
      country_name: "United States",
    }),
    customer(1003, "Priya", "Raman", "priya.raman@example.com", null, 14, {
      address1: "901 W Adams Street",
      city: "Chicago",
      province: "IL",
      zip: "60607",
      country_name: "United States",
    }),
    customer(1004, "Jonas", "Weber", "jonas.weber@example.com", "+1 212 555 0177", 21, {
      address1: "18 Grove Street",
      city: "New York",
      province: "NY",
      zip: "10014",
      country_name: "United States",
    }),
    customer(1005, "Alice", "Fournier", "alice.fournier@example.com", null, 9, {
      address1: "6 Rue des Archives",
      city: "Montreal",
      province: "QC",
      zip: "H2Y 1Z5",
      country_name: "Canada",
    }),
    customer(1006, "Malik", "Hassan", "malik.hassan@example.com", "+1 312 555 0118", 4, {
      address1: "742 Evergreen Terrace",
      city: "Springfield",
      province: "IL",
      zip: "62704",
      country_name: "United States",
    }),
    customer(1007, "Rina", "Kobayashi", "rina.kobayashi@example.com", null, 11, null),
    customer(1008, "Gary", "Cole", "gary.cole@example.com", null, 7, {
      address1: "2201 Pacific Avenue",
      city: "Santa Monica",
      province: "CA",
      zip: "90405",
      country_name: "United States",
    }),
  ];

  const products: SimulatorProduct[] = [
    { id: 501, title: "Flax Duvet Set", images: [{ src: "https://images.unsplash.com/photo-1505693416388-bd47d360f351?auto=format&fit=crop&w=400&q=80" }] },
    { id: 502, title: "Stonewashed Sheet Set", images: [{ src: "https://images.unsplash.com/photo-1631049307264-da0ec9d70304?auto=format&fit=crop&w=400&q=80" }] },
    { id: 503, title: "Linen Pillowcases", images: [{ src: "https://images.unsplash.com/photo-1584100936595-c0654b55a2e2?auto=format&fit=crop&w=400&q=80" }] },
    { id: 504, title: "Framed Linen Print", images: [{ src: "https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=400&q=80" }] },
    { id: 505, title: "Clay Throw", images: [{ src: "https://images.unsplash.com/photo-1540518614846-7eded433c457?auto=format&fit=crop&w=400&q=80" }] },
  ];

  const orders: SimulatorOrder[] = [
    order(1042, 1001, "paid", null, "248.00", 18, [
      line(1, "Flax Duvet Set", 1, "Queen / Natural", 501, "LIN-DV-Q"),
    ]),
    order(1048, 1001, "paid", "fulfilled", "186.00", 9 * 24 * 60, [
      line(2, "Stonewashed Sheet Set", 1, "Queen / Oatmeal", 502, "LIN-SH-Q"),
    ]),
    order(1055, 1001, "paid", "fulfilled", "78.00", 21 * 24 * 60, [
      line(3, "Linen Pillowcases", 2, "Standard / Clay", 503, "LIN-PC-ST"),
    ]),
    order(1051, 1002, "paid", null, "128.00", 44, [
      line(4, "Flax Duvet Set", 1, "Full / Natural", 501, "LIN-DV-F"),
    ]),
    order(1071, 1002, "paid", "partial", "64.00", 6 * 24 * 60, [
      line(5, "Linen Pillowcases", 2, "Standard / Oatmeal", 503, "LIN-PC-ST"),
    ]),
    order(1033, 1003, "pending", null, "240.00", 130, [
      line(6, "Flax Duvet Set", 1, "King / Natural", 501, "LIN-DV-K"),
    ]),
    order(1062, 1006, "authorized", null, "148.00", 14, [
      line(7, "Clay Throw", 1, "Oversized", 505, "LIN-TH-OS"),
    ]),
    order(1078, 1005, "partially_paid", null, "96.00", 70, [
      line(8, "Framed Linen Print", 1, "18x24", 504, "LIN-PR-1824"),
    ]),
    order(1029, 1004, "paid", "fulfilled", "188.00", 12 * 24 * 60, [
      line(9, "Stonewashed Sheet Set", 1, "King / Flax", 502, "LIN-SH-K"),
    ]),
    order(1038, 1004, "paid", "fulfilled", "42.00", 20 * 24 * 60, [
      line(10, "Linen Pillowcases", 1, "King / Natural", 503, "LIN-PC-KG"),
    ]),
    order(1044, 1005, "paid", "fulfilled", "64.00", 5 * 24 * 60, [
      line(11, "Linen Pillowcases", 2, "Standard / Sand", 503, "LIN-PC-ST"),
    ]),
    order(1068, 1008, "paid", "fulfilled", "86.00", 3 * 24 * 60, [
      line(12, "Clay Throw", 1, "Standard", 505, "LIN-TH-ST"),
    ]),
    order(1084, 1001, "paid", null, "148.00", 3, [
      line(13, "Clay Throw", 1, "Oversized", 505, "LIN-TH-OS"),
      line(14, "Linen Pillowcases", 1, "Standard / Clay", 503, "LIN-PC-ST"),
    ]),
    order(1019, 1008, "refunded", "fulfilled", "54.00", 28 * 24 * 60, [
      line(15, "Framed Linen Print", 1, "12x16", 504, "LIN-PR-1216"),
    ]),
  ];

  return { customers, orders, products };
}

function customer(
  id: number,
  firstName: string,
  lastName: string,
  email: string,
  phone: string | null,
  createdDaysAgo: number,
  address: Omit<SimulatorAddress, "id"> | null,
): SimulatorCustomer {
  return {
    id,
    first_name: firstName,
    last_name: lastName,
    email,
    phone,
    note: null,
    created_at: daysAgo(createdDaysAgo),
    default_address: address ? { id: id * 10, ...address } : null,
  };
}

function order(
  number: number,
  customerId: number,
  financialStatus: string,
  fulfillmentStatus: string | null,
  total: string,
  createdMinutesAgo: number,
  lineItems: SimulatorLineItem[],
): SimulatorOrder {
  return {
    id: 6_000_000_000 + number,
    name: `#${number}`,
    created_at: minutesAgo(createdMinutesAgo),
    financial_status: financialStatus,
    fulfillment_status: fulfillmentStatus,
    total_price: total,
    current_total_price: total,
    currency: "USD",
    customer_id: customerId,
    line_items: lineItems,
  };
}

function line(
  id: number,
  title: string,
  quantity: number,
  variantTitle: string | null,
  productId: number,
  sku: string,
): SimulatorLineItem {
  return {
    id,
    title,
    quantity,
    current_quantity: quantity,
    variant_title: variantTitle,
    product_id: productId,
    sku,
  };
}
