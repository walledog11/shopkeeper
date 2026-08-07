# Shopify app configuration — rollback reference

Rollback reference for **M0a** and **M0b** of
[shopify-storefront-chat-implementation-plan.md](../shopify-storefront-chat-implementation-plan.md),
the migration from Dev-Dashboard-configured app settings to a CLI-authoritative
`shopify.app.toml`.

This record contains sanitized configuration only. It intentionally omits the
client secret, access tokens, and the app secret. `SHOPIFY_CLIENT_ID` and
`SHOPIFY_CLIENT_SECRET` live in Vercel; `SHOPIFY_APP_SECRET` lives in both.

Started 2026-08-07. **The verbatim export is not captured yet** — see
"Outstanding" at the bottom. Everything in "Expected configuration" below is
derived from the source tree, not from the Dashboard, and exists so the export
has something to be diffed against. Where they disagree, **the Dashboard is
authoritative** and the difference is a finding, not a typo to correct.

## Expected configuration (code-derived)

### Installation

Managed installation, configured in the Dev Dashboard. The `scope` parameter on
the authorize URL does **not** decide the grant — see the comment at
`apps/dashboard/src/app/api/integrations/shopify/auth/route.ts:50-54`, which
records that token exchange has returned scopes the request never asked for.

### OAuth

| Field | Value |
| --- | --- |
| Authorize URL | `https://{shop}/admin/oauth/authorize` |
| Redirect URI | `https://app.useshopkeeper.com/api/integrations/shopify/callback` |
| Redirect construction | `lib/env/index.ts:54`, `${APP_URL}` + fixed path |

`APP_URL` is equality-checked against `NEXT_PUBLIC_APP_URL` in production, so the
redirect host cannot drift without failing boot.

### Access scopes

15 scopes, from `SHOPIFY_OAUTH_SCOPES` in
`packages/agent/src/shopify/integration-health.ts:50-66`:

```
read_customers, write_customers, read_orders, write_orders, write_order_edits,
read_merchant_managed_fulfillment_orders, write_merchant_managed_fulfillment_orders,
read_returns, write_returns, read_products, read_content, write_gift_cards,
write_discounts, read_store_credit_accounts, write_store_credit_account_transactions
```

This list is what the app *requests* and what `missingShopifyScopes()` checks a
connected store against. It is not proof of what the Dashboard grants.

### Webhooks

Endpoint: `POST https://clerk-production-e37f.up.railway.app/webhooks/shopify`
(gateway `shopkeeper` service, `routes/webhooks-shopify.ts:18`, mounted under
`/webhooks` by `routes/webhooks.ts:25`).

| Topic | Handling |
| --- | --- |
| `orders/create` | queued; also triggers order-risk monitor when `ORDER_RISK_MONITOR_ENABLED` |
| `orders/fulfilled` | queued |
| `orders/updated` | queued |
| `orders/cancelled` | queued |
| `app/uninstalled` | handled separately, before the topic allowlist |

There is **no webhook registration code anywhere in the repo** — no
`webhookSubscriptions` mutation, no `registerWebhook` call. Subscriptions are
Dashboard-configured, which is exactly why the TOML becomes authoritative the
moment the app is CLI-linked.

## Findings

### 1. No compliance webhook handlers exist

`customers/data_request`, `customers/redact`, and `shop/redact` have **zero
handlers in the source tree**. The only GDPR-adjacent route is
`/api/org/gdpr-export`, which is the merchant exporting their own workspace data
— unrelated to Shopify's mandatory topics.

Shopify requires all three for any app distributed through the App Store, and
`shopify app deploy` will carry whatever the TOML declares. Three cases, and the
export decides which:

- Dashboard declares them pointing at a live endpoint → find it, because it
  isn't in this repo.
- Dashboard declares them pointing at a dead URL → pre-existing compliance gap
  that M0a surfaces but does not cause.
- Dashboard declares nothing → the TOML must not invent them either, or the
  first deploy starts sending traffic at handlers that do not exist.

Do not paper over this by declaring the topics in the TOML and pointing them at
`/webhooks/shopify`. That endpoint's topic allowlist
(`webhooks-shopify.ts:15`) does not include them, so they would be rejected —
a silently failing compliance webhook is worse than an absent one.

### 2. `write_app_proxy` is required, which broke the original M0's no-new-scopes invariant

The plan says to "verify whether app-proxy declaration in the TOML needs an
access scope at all before writing `write_app_proxy` anywhere." Verified —
**it does**. Shopify's app-proxy documentation states directly: "In
`shopify.app.toml` in the root of your app, add the `write_app_proxy` access
scope." The app-configuration reference page omits this, which is the source of
the contradiction; the app-proxies page is the operative one.

This collided with the original M0's own constraint that it "adds **no** scopes — an
unchanged scope set means no re-authorization prompt for any already-connected
merchant." Configuring the proxy *is* a scope addition, and it *does* raise a
prompt for active merchants.

Severity is lower than it first looks: Shopify staff confirmed on the developer
forum that stores which never accept the new scope are backfilled server-side
and "won't experience any disruption." So it is a prompt, not a breakage.

**Resolved 2026-08-07: M0 is split.** Applied to the plan.

- **M0a** — TOML migration at the exact current scope set, no proxy, no new
  scopes, no prompt. Proves CLI configuration round-trips without touching what
  merchants granted.
- **M0b** — app proxy plus `write_app_proxy`, on its own schedule ahead of M1.
  It must be live before M1 can be tested end to end, but does not ship in the
  same change.

The operative consequence for this document: **the draft TOML below stays
proxy-free and stays at 15 scopes.** `write_app_proxy` and the `[app_proxy]`
block belong to M0b and must not appear in whatever lands during M0a — if a
re-authorization prompt shows up during the migration, that has to read as a
defect rather than an expected side effect.

## Draft TOML

**Not** at the repo root, deliberately. Placing a `shopify.app.toml` at the root
makes it the target of any stray `shopify app deploy`, and the plan's rule is
that the production app is never linked against an unverified file. Move it to
the root only when landing it on the throwaway dev app.

Values marked `TODO(export)` are the ones only the Dashboard can settle. This is
the **M0a** file: 15 scopes, no proxy.

```toml
client_id = "TODO(export)"
name = "TODO(export)"
application_url = "https://app.useshopkeeper.com"
embedded = false                       # TODO(export) — confirm; app is standalone, not App Bridge

[access_scopes]
scopes = "read_customers,write_customers,read_orders,write_orders,write_order_edits,read_merchant_managed_fulfillment_orders,write_merchant_managed_fulfillment_orders,read_returns,write_returns,read_products,read_content,write_gift_cards,write_discounts,read_store_credit_accounts,write_store_credit_account_transactions"
use_legacy_install_flow = false        # managed installation

[auth]
redirect_urls = [
  "https://app.useshopkeeper.com/api/integrations/shopify/callback"
]

[webhooks]
api_version = "TODO(export)"

  [[webhooks.subscriptions]]
  topics = ["app/uninstalled"]
  uri = "https://clerk-production-e37f.up.railway.app/webhooks/shopify"

  [[webhooks.subscriptions]]
  topics = ["orders/create", "orders/fulfilled", "orders/updated", "orders/cancelled"]
  uri = "https://clerk-production-e37f.up.railway.app/webhooks/shopify"

  # compliance_topics deliberately absent pending finding 1.

# [app_proxy] deliberately absent — it requires write_app_proxy, which is
# M0b. Adding either here would break M0a's no-prompt guarantee.
```

## Outstanding

Console and CLI steps that cannot be done from the repo.

- [x] **Install the Shopify CLI.** Done 2026-08-07 — `@shopify/cli@^4.6.1` as a
  root devDependency, so the version is pinned in the lockfile and every machine
  runs the same one. Invoke as `npx shopify`. Adds 14 packages and no new audit
  findings; the 8 that `npm audit` reports are pre-existing and none of them are
  in the added tree. `knip.json` sets `devDependencies: "off"`, so nothing
  importing it does not fail `lint:knip`.
- [ ] **Capture the verbatim export.** `shopify app config link` against the
  production app pulls remote configuration into a local TOML *without* pushing
  anything, which makes it the cleanest verbatim export. Pulling is safe; the
  one-way step is `shopify app deploy` afterward. Commit the pulled file here,
  then diff it against "Expected configuration" above and record every
  divergence.
- [ ] **Settle finding 1** from that export — what the Dashboard actually
  declares for the three compliance topics.
- [x] **Decide finding 2** — split applied 2026-08-07. M0a migrates at the
  current scope set; M0b adds the proxy and `write_app_proxy` separately.
- [ ] **Create the throwaway dev app** and land the TOML there first. Deploy,
  install on a dev store, confirm granted scopes and webhook topics match the
  export exactly.
- [ ] **Link production** only after that round-trip passes.
- [ ] **M0b, after M0a settles** — add `write_app_proxy` and the `[app_proxy]`
  block (`url`, `subpath`, `prefix`, all required), dev app first, with the
  merchant-facing explanation of the prompt written before deploy.
