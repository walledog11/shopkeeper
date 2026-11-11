# Shopify app configuration — rollback reference

> ## Rollback target — read this before rolling anything back
>
> This file does not record which version is active; the CLI is the only source
> of truth:
>
> ```sh
> npx shopify app versions list --json
> ```
>
> (`versions list` without `--json` paginates and blocks on input.) The active
> release is the one with `"status": "active"`. **The one-step rollback target is
> the next one below it by `createdAt` — not the oldest, and not `-8`.** Then:
>
> ```sh
> npx shopify app release --version <tag>
> ```
>
> What the CLI *cannot* tell you is what a given rollback costs you. The
> boundaries do not move; only how far back you are going changes.
>
> | Reverting past… | Costs you |
> | --- | --- |
> | `-26` (2026-08-18) | the `compliance_topics` declarations |
> | `-15`…`-25` (2026-08-15) | the chat widget UI work |
> | `-13`, `-14` (2026-08-12) | the M1.5 verification widget card |
> | `-9`…`-12` (2026-08-08/10) | the `write_app_proxy` scope and the `[app_proxy]` block |
> | `-8` (2026-08-03) | the app proxy entirely — pre-storefront-chat |
>
> So `-8` is re-releasable, but reaching for it reverts the whole storefront
> chat surface.

## Webhooks

The five order and uninstall subscriptions — `orders/create`,
`orders/fulfilled`, `orders/updated`, `orders/cancelled`, `app/uninstalled` — are
declared app-level in the root `shopify.app.toml` on Admin API version `2026-04`.
OAuth does not create per-shop subscriptions.

`npm run audit:shopify-webhooks` remains the way to inventory or repair per-shop
leftovers. It is read-only by default; both mutation modes require an exact
`myshopify.com` domain **and** `--execute`:

```sh
npm run audit:shopify-webhooks
npm run audit:shopify-webhooks -- --shop palette-garments.myshopify.com
npm run audit:shopify-webhooks -- remove --shop palette-garments.myshopify.com --execute
npm run audit:shopify-webhooks -- restore --shop palette-garments.myshopify.com --execute
```

`remove` deletes every duplicate of only those five topic/address pairs, then
verifies none remain. `restore` creates only missing pairs, then verifies exactly
one subscription per topic. Neither touches a webhook with a different topic or
address. If a release fails after a `remove`, run `restore` immediately; if the
released configuration is defective, release the prior app version first and then
`restore`.

**Verifying delivery.** A Shopify webhook does leave a durable receipt —
`webhooks-shopify.ts` passes `shopify:<shop>:<webhookId>` as `inboundMessageId`
and `handleShopifyJob` stores it as the message's `external_message_id`, so
deliveries are queryable after the fact. Exactly-once is enforced by the database
rather than by inspection: the partial unique index
`messages_org_external_id_unique` on `(organization_id, external_message_id)`
makes a duplicate delivery fail its insert. One trap when testing —
`handleShopifyJob` **drops** an order with neither `customer.email` nor
`customer.id`, logging a warn and returning, and such an order leaves no row at
all, which is indistinguishable from non-delivery. Place test orders with customer
identity attached.

## The app home inside Shopify admin

`embedded = true` with `application_url` at `https://app.useshopkeeper.com/shopify`:
opening Shopkeeper from a store's Apps list frames that page inside the admin.
Clerk stays out of it, since a third-party iframe holds no Clerk session:
`shopifyAppHomeProxy` takes the path instead of Clerk's middleware and sends
`frame-ancestors` naming only that shop and `admin.shopify.com`, and the root
layout renders App Bridge in place of Clerk. The page verifies the admin's ID
token (`verifyShopifySessionToken`); a missing or stale one bounces once through
App Bridge for a fresh token.

A linked shop gets three tabs: **Home** (what needs the merchant, its workspace's
counts and any setup steps left), **Website chat** (the dashboard's chat editor,
live preview included) and **Settings** (sync store policies and pages to Memory;
what the agent may do, read-only). An unlinked shop gets sign-up and connect links
with the store filled in. Links into the full app always open a new tab, so coming
back reloads what may have changed there (`/api/shopify/app/home`), and an unlinked
shop's page turns into the linked one once the store is connected. When the linked
row's token is dead, or its recorded grant is short of `SHOPIFY_OAUTH_SCOPES`, the
page re-issues the grant by token exchange.

The page calls `/api/shopify/app/*`, which `withShopifyAppRoute` authenticates with
a fresh ID token per request; the workspace is the one connected to the token's
shop. Anyone the store lets open the app can change website chat and run the sync
there (in the dashboard those need a workspace admin): Shopify's staff permissions
decide. What the agent may do (refunds, cancellations, limits) changes only in the
dashboard.

Before the route existed, `application_url` was the site root, which sends
`X-Frame-Options: SAMEORIGIN`, so the admin showed a blank frame. An
`application_url` change ships only with `shopify app deploy`.

## A setting that looks wrong and is not

It matches the production configuration on purpose, and is here because it
reads as an obvious cleanup to anyone who meets it fresh.

**Two OAuth redirect URLs.** The app allows both the canonical
`https://app.useshopkeeper.com/api/integrations/shopify/callback` and
`https://dashboard-shopkeeper.vercel.app/api/integrations/shopify/callback` — the
raw Vercel alias, which is a live alias on the production deployment. Dropping one
is a behaviour change, not a cleanup. Per `.claude/CLAUDE.md` the `*_oauth_*`
handshake cookies are host-only and `src/proxy/canonical-host.ts` 307s
`/api/integrations` onto the `APP_URL` host, so a connect begun on the alias is
rescued by that redirect rather than by this entry. Removing the alias is
plausibly correct eventually; it has never been the safe half of a config change.

## Source of truth

The current configuration is `shopify.app.toml` in the repo root, and its git
history is the durable record. This file contains sanitized configuration only.
`SHOPIFY_CLIENT_ID` and `SHOPIFY_CLIENT_SECRET` live in Vercel;
`SHOPIFY_APP_SECRET` lives in both.
