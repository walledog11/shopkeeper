export const MEDIA_PRODUCT_HANDLE = 'shopkeeper-media-linen-jumpsuit';
export const MEDIA_PRODUCT_TAG = 'shopkeeper-media-fixture';
export const MEDIA_ORDER_TAG = 'shopkeeper-media-order-swap';
export const MEDIA_ORDER_SOURCE_ID = 'shopkeeper-media-order-swap-v1';
export const MEDIA_ORDER_NAME = '#3102';
export const MEDIA_CUSTOMER_EMAIL = 'maya.chen+shopkeeper-media@example.com';

export const DEVELOPMENT_PLAN_NAMES = new Set([
  'affiliate',
  'development',
  'partner_test',
  'plus_partner_sandbox',
  'shopify_alumni',
  'staff',
  'staff_business',
  'trial',
]);

export const SETUP_REQUIRED_SCOPES = [
  'read_locations',
  'write_customers',
  'write_inventory',
  'write_orders',
  'write_products',
];

export function readValueArg(argv, prefix) {
  const raw = argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length).trim();
  return raw || null;
}

export function normalizeShop(value) {
  const stripped = String(value ?? '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .toLowerCase();
  if (/^[a-z0-9][a-z0-9-]*$/.test(stripped)) return `${stripped}.myshopify.com`;
  if (/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(stripped)) return stripped;
  throw new Error('Expected a valid *.myshopify.com domain.');
}

export function isDevelopmentStore({ restPlanName, partnerDevelopment, publicDisplayName }) {
  if (partnerDevelopment === true) return true;
  const names = [restPlanName, publicDisplayName]
    .filter((value) => typeof value === 'string')
    .map((value) => value.trim().toLowerCase().replace(/\s+/g, '_'));
  return names.some((name) => DEVELOPMENT_PLAN_NAMES.has(name));
}

export function missingScopes(granted, required = SETUP_REQUIRED_SCOPES) {
  const held = new Set(granted.map((scope) => String(scope).trim().toLowerCase()).filter(Boolean));
  return required.filter((scope) => {
    if (held.has(scope)) return false;
    const readMatch = scope.match(/^read_(.+)$/);
    return !(readMatch && held.has(`write_${readMatch[1]}`));
  });
}

export function selectLocation(locations, requestedId = null) {
  const active = locations.filter((location) => (
    location?.isActive === true && location?.fulfillsOnlineOrders === true
  ));
  if (requestedId) {
    const normalized = requestedId.startsWith('gid://')
      ? requestedId
      : `gid://shopify/Location/${requestedId}`;
    const selected = active.find((location) => location.id === normalized);
    if (!selected) {
      throw new Error(`The requested location ${requestedId} is not active and able to fulfill online orders.`);
    }
    return selected;
  }
  if (active.length !== 1) {
    const choices = active.map((location) => `${location.name} (${location.id})`).join(', ') || 'none';
    throw new Error(
      `Expected one active online-fulfillment location; found ${active.length}. Pass --location-id. Choices: ${choices}.`,
    );
  }
  return active[0];
}

function optionsKey(selectedOptions) {
  return [...(selectedOptions ?? [])]
    .map((option) => `${String(option.name).toLowerCase()}:${String(option.value).toLowerCase()}`)
    .sort()
    .join('|');
}

export function buildProductSetInput(existingProduct, locationId) {
  if (existingProduct && !(existingProduct.tags ?? []).includes(MEDIA_PRODUCT_TAG)) {
    throw new Error(
      `Product handle ${MEDIA_PRODUCT_HANDLE} already exists without the fixture ownership tag; refusing to replace it.`,
    );
  }

  const existingByOptions = new Map(
    (existingProduct?.variants?.nodes ?? []).map((variant) => [optionsKey(variant.selectedOptions), variant]),
  );
  const variant = (size, quantity) => {
    const existing = existingByOptions.get(optionsKey([
      { name: 'Size', value: size },
      { name: 'Color', value: 'Sand' },
    ]));
    return {
      ...(existing?.id ? { id: existing.id } : {}),
      optionValues: [
        { optionName: 'Size', name: size },
        { optionName: 'Color', name: 'Sand' },
      ],
      price: '148.00',
      sku: `SK-MEDIA-LJ-${size === 'Medium' ? 'M' : 'S'}-SAND`,
      inventoryItem: { tracked: true },
      inventoryPolicy: 'DENY',
      inventoryQuantities: [{ locationId, name: 'available', quantity }],
    };
  };

  return {
    title: 'Linen Jumpsuit',
    handle: MEDIA_PRODUCT_HANDLE,
    descriptionHtml: '<p>A fictional product created only for Shopkeeper marketing capture.</p>',
    productType: 'Apparel',
    vendor: 'Linen & Loom',
    status: 'ACTIVE',
    tags: [MEDIA_PRODUCT_TAG, 'linen-and-loom'],
    productOptions: [
      { name: 'Size', position: 1, values: [{ name: 'Medium' }, { name: 'Small' }] },
      { name: 'Color', position: 2, values: [{ name: 'Sand' }] },
    ],
    variants: [variant('Medium', 8), variant('Small', 12)],
  };
}

export function findMediaVariants(product) {
  const variants = product?.variants?.nodes ?? [];
  const bySize = new Map();
  for (const variant of variants) {
    const options = new Map((variant.selectedOptions ?? []).map((option) => [option.name, option.value]));
    if (options.get('Color') === 'Sand') bySize.set(options.get('Size'), variant);
  }
  const medium = bySize.get('Medium');
  const small = bySize.get('Small');
  if (!medium?.id || !small?.id) {
    throw new Error('The media product does not contain both Medium / Sand and Small / Sand variants.');
  }
  return { medium, small };
}

export function isOwnedMediaOrder(order) {
  return order?.test === true
    && (order.tags ?? []).includes(MEDIA_ORDER_TAG)
    && order.sourceIdentifier === MEDIA_ORDER_SOURCE_ID;
}

export function buildOrderCreateInput(mediumVariantId) {
  const address = {
    firstName: 'Maya',
    lastName: 'Chen',
    address1: '3180 18th Street',
    city: 'San Francisco',
    provinceCode: 'CA',
    zip: '94110',
    countryCode: 'US',
  };
  return {
    name: MEDIA_ORDER_NAME,
    email: MEDIA_CUSTOMER_EMAIL,
    test: true,
    financialStatus: 'PAID',
    lineItems: [{ variantId: mediumVariantId, quantity: 1 }],
    customer: {
      toUpsert: {
        email: MEDIA_CUSTOMER_EMAIL,
        firstName: 'Maya',
        lastName: 'Chen',
      },
    },
    shippingAddress: address,
    billingAddress: address,
    tags: [MEDIA_ORDER_TAG, 'linen-and-loom'],
    sourceIdentifier: MEDIA_ORDER_SOURCE_ID,
    note: 'Synthetic Shopkeeper landing-page capture fixture. Never use real customer data here.',
  };
}

export function mediaSettings(current) {
  const base = current && typeof current === 'object' && !Array.isArray(current) ? current : {};
  return {
    ...base,
    aiContext: [
      'Linen & Loom sells apparel from San Francisco.',
      'Unfulfilled orders may swap size when the replacement is in stock and the price is unchanged.',
      'Ask the merchant before changing an order.',
    ].join(' '),
    brandVoice: 'Warm, direct, and concise. Confirm the concrete outcome without over-apologizing.',
    autonomyTier: 'guarded',
    autoExecuteMode: 'off',
    maxRefundAmount: 50,
    autoPlanOnOpen: true,
  };
}

export function buildManifest({ shop, organizationId, integrationId, location, product, order }) {
  const { medium, small } = findMediaVariants(product);
  const shopSlug = normalizeShop(shop).replace(/\.myshopify\.com$/, '');
  const orderLegacyId = String(order.id).replace(/^gid:\/\/shopify\/Order\//, '');
  const productLegacyId = String(product.id).replace(/^gid:\/\/shopify\/Product\//, '');
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    syntheticDataOnly: true,
    shop: normalizeShop(shop),
    organizationId,
    integrationId,
    location: { id: location.id, name: location.name },
    product: {
      id: product.id,
      handle: product.handle,
      title: product.title,
      adminUrl: `https://admin.shopify.com/store/${shopSlug}/products/${productLegacyId}`,
      variants: {
        mediumSand: { id: medium.id, inventoryQuantity: medium.inventoryQuantity },
        smallSand: { id: small.id, inventoryQuantity: small.inventoryQuantity },
      },
    },
    order: {
      id: order.id,
      name: order.name,
      test: order.test,
      financialStatus: order.displayFinancialStatus,
      fulfillmentStatus: order.displayFulfillmentStatus,
      adminUrl: `https://admin.shopify.com/store/${shopSlug}/orders/${orderLegacyId}`,
    },
    dashboard: {
      ticketsUrl: '/dashboard/tickets',
      actionLogUrl: '/dashboard/review',
      autonomySettingsUrl: '/dashboard/agent/configure',
    },
    resetRequest: 'hey! I ordered the linen jumpsuit in M but need S — can you switch it before it ships? order #3102',
  };
}
