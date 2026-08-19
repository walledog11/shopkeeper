# Shopify app-specific webhook migration

The production app declares one app-specific subscription in the root
`shopify.app.toml` for these topics:

- `orders/create`
- `orders/fulfilled`
- `orders/updated`
- `orders/cancelled`
- `app/uninstalled`

All five target exactly
`https://clerk-production-e37f.up.railway.app/webhooks/shopify` on Admin API
version `2026-04`. OAuth callbacks do not provision shop-specific webhooks.

## Guarded utility

The migration utility is read-only by default:

```sh
npm run audit:shopify-webhooks
npm run audit:shopify-webhooks -- --shop palette-garments.myshopify.com
```

Mutation modes require both an exact `myshopify.com` domain and `--execute`:

```sh
npm run audit:shopify-webhooks -- remove --shop palette-garments.myshopify.com --execute
npm run audit:shopify-webhooks -- restore --shop palette-garments.myshopify.com --execute
```

`remove` deletes every duplicate of only the five topic/address pairs above,
then verifies that none remain. `restore` creates only missing pairs, then
verifies exactly one subscription per topic. Neither mode changes webhooks with
a different topic or address.

## Production sequence

1. Deploy the dashboard code first. Existing shop-specific subscriptions keep
   delivering while callback-time creation is disabled.
2. Stage an unreleased app version and record the version identifier:

   ```sh
   npx shopify app deploy --no-release
   ```

3. Audit the explicit production shop and verify the five matching legacy
   subscriptions and gateway address.
4. Run `remove` for that shop, then immediately release the staged version:

   ```sh
   npx shopify app release --version <prepared-version>
   ```

5. Confirm the released version lists all five app-specific subscriptions, the
   audit reports no matching shop-specific subscriptions, and one controlled
   order event reaches the gateway exactly once.

## Step 5 evidence — closed 2026-08-19

App-level declaration delivered a real order event exactly once. Order #1028 on
`palette-dev-3peukw16.myshopify.com`, org `9b81d9c8` (Palette):

```
2026-08-18T01:50:30.273Z  "New order #1028 was placed."
  external_message_id: shopify:palette-dev-3peukw16.myshopify.com:81973476-cf11-5d57-969f-95d3eafedfac
  -> thread "Order #1028", tag "Order Status"
```

The surrounding `orders/updated` events for the same order landed too, so the
declared topic set is live, not just `orders/create`.

**A Shopify webhook does leave a durable receipt** — the earlier belief that
nothing persists one was wrong, and it is what made this step look unverifiable.
`webhooks-shopify.ts` passes `shopify:<shop>:<webhookId>` as `inboundMessageId`,
and `handleShopifyJob` stores it as the message's `external_message_id`. So the
receipt is queryable after the fact, and **exactly-once is enforced by the
database, not by inspection**: the partial unique index
`messages_org_external_id_unique` on `(organization_id, external_message_id)`
makes a duplicate delivery fail its insert rather than create a second row.

Re-check any time by querying messages whose `external_message_id` starts with
`shopify:`, newest first. One trap: `handleShopifyJob` **drops** an order with
neither `customer.email` nor `customer.id`, logging a warn and returning — such
an order leaves no row at all, which is indistinguishable from non-delivery.
Place test orders with customer identity attached.

If releasing fails after removal, run `restore` immediately. If the released
configuration is defective, release the prior app version and then run
`restore`. Retain the utility for ongoing audits and rollback.
