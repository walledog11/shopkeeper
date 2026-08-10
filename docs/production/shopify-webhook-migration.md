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

If releasing fails after removal, run `restore` immediately. If the released
configuration is defective, release the prior app version and then run
`restore`. Retain the utility for ongoing audits and rollback.
