import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MEDIA_ORDER_SOURCE_ID,
  MEDIA_ORDER_TAG,
  MEDIA_PRODUCT_HANDLE,
  buildOrderCreateInput,
  buildProductSetInput,
  isDevelopmentStore,
  isOwnedMediaOrder,
  mediaSettings,
  missingScopes,
  normalizeShop,
  selectLocation,
} from './landing-media-fixture-lib.mjs';

test('normalizes and validates Shopify domains', () => {
  assert.equal(normalizeShop('Fixture-Shop'), 'fixture-shop.myshopify.com');
  assert.equal(normalizeShop('https://fixture-shop.myshopify.com/admin'), 'fixture-shop.myshopify.com');
  assert.throws(() => normalizeShop('example.com'), /valid/);
});

test('recognizes development stores without treating ordinary plans as safe', () => {
  assert.equal(isDevelopmentStore({ partnerDevelopment: true }), true);
  assert.equal(isDevelopmentStore({ publicDisplayName: 'Development' }), true);
  assert.equal(isDevelopmentStore({ restPlanName: 'staff_business' }), true);
  assert.equal(isDevelopmentStore({ publicDisplayName: 'Basic' }), false);
});

test('requires unambiguous active fulfillment location selection', () => {
  const locations = [
    { id: 'gid://shopify/Location/1', name: 'Main', isActive: true, fulfillsOnlineOrders: true },
    { id: 'gid://shopify/Location/2', name: 'Closed', isActive: false, fulfillsOnlineOrders: true },
  ];
  assert.equal(selectLocation(locations).id, 'gid://shopify/Location/1');
  assert.equal(selectLocation(locations, '1').id, 'gid://shopify/Location/1');
  assert.throws(
    () => selectLocation([...locations, { id: 'gid://shopify/Location/3', name: 'West', isActive: true, fulfillsOnlineOrders: true }]),
    /Pass --location-id/,
  );
});

test('keeps matching variant ids while resetting media product state', () => {
  const input = buildProductSetInput({
    tags: ['shopkeeper-media-fixture'],
    variants: {
      nodes: [{
        id: 'gid://shopify/ProductVariant/10',
        selectedOptions: [{ name: 'Color', value: 'Sand' }, { name: 'Size', value: 'Medium' }],
      }],
    },
  }, 'gid://shopify/Location/1');
  assert.equal(input.handle, MEDIA_PRODUCT_HANDLE);
  assert.equal(input.variants[0].id, 'gid://shopify/ProductVariant/10');
  assert.equal(input.variants[0].inventoryQuantities[0].quantity, 8);
  assert.equal(input.variants[1].inventoryQuantities[0].quantity, 12);
});

test('refuses to take over a product that lacks the fixture ownership tag', () => {
  assert.throws(
    () => buildProductSetInput({ tags: [], variants: { nodes: [] } }, 'gid://shopify/Location/1'),
    /refusing to replace/,
  );
});

test('builds a paid synthetic test order and recognizes only owned fixture orders', () => {
  const input = buildOrderCreateInput('gid://shopify/ProductVariant/10');
  assert.equal(input.name, '#3102');
  assert.equal(input.test, true);
  assert.equal(input.financialStatus, 'PAID');
  assert.equal(input.customer.toUpsert.firstName, 'Maya');
  assert.equal(input.lineItems[0].variantId, 'gid://shopify/ProductVariant/10');
  assert.equal(isOwnedMediaOrder({ test: true, tags: [MEDIA_ORDER_TAG], sourceIdentifier: MEDIA_ORDER_SOURCE_ID }), true);
  assert.equal(isOwnedMediaOrder({ test: false, tags: [MEDIA_ORDER_TAG], sourceIdentifier: MEDIA_ORDER_SOURCE_ID }), false);
});

test('merges the Ask first fixture settings without dropping unrelated settings', () => {
  assert.deepEqual(mediaSettings({ digestEnabled: true }).digestEnabled, true);
  assert.equal(mediaSettings({}).autonomyTier, 'guarded');
  assert.equal(mediaSettings({}).autoExecuteMode, 'off');
  assert.equal(mediaSettings({}).maxRefundAmount, 50);
});

test('reports missing setup scopes', () => {
  assert.deepEqual(missingScopes(['write_orders', 'write_customers']), ['read_locations', 'write_inventory', 'write_products']);
  assert.deepEqual(
    missingScopes(['read_locations', 'write_orders', 'write_customers', 'write_inventory', 'write_products']),
    [],
  );
});
