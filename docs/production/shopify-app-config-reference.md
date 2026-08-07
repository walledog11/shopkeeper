# Shopify app configuration — rollback reference

Rollback reference for **M0a** and **M0b** of
[shopify-storefront-chat-implementation-plan.md](../shopify-storefront-chat-implementation-plan.md),
the migration from Dev-Dashboard-configured app settings to a CLI-authoritative
`shopify.app.toml`.

This record contains sanitized configuration only. It intentionally omits the
client secret, access tokens, and the app secret. `SHOPIFY_CLIENT_ID` and
`SHOPIFY_CLIENT_SECRET` live in Vercel; `SHOPIFY_APP_SECRET` lives in both.

**Verbatim export captured 2026-08-07** via `shopify app config link
--client-id … --path <scratch>` against app `shopkeeper-production`, org
`40511769`. It is checked in beside this file as
[shopify-app-config-export-2026-08-07.toml](shopify-app-config-export-2026-08-07.toml)
— named so it does **not** match the `shopify.app*.toml` pattern the CLI
discovers, so no stray `shopify app deploy` can ever target it.

"Expected configuration" below is the code-derived prediction written *before*
the export, kept because the divergences are the interesting part. Where the two
disagree, **the export is authoritative**. See "Export divergences" for what
actually differed.

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

**Correction (2026-08-07).** An earlier revision of this file — and the commit
message that introduced it, `ea1d12ee` — claimed there was "no webhook
registration code anywhere in the repo" and concluded subscriptions were
Dashboard-configured. **Both halves are wrong.** The registration lives at
`apps/dashboard/src/app/api/integrations/shopify/callback/route.ts:368-392`: on
every OAuth callback the app POSTs each of `SHOPIFY_WEBHOOK_TOPICS`
(`route.ts:30`, the same five topics above) to the REST Admin `webhooks.json`,
pointing at `${GATEWAY_INTERNAL_URL}/webhooks/shopify`. The original grep
searched for `webhookSubscriptions`/`registerWebhook`/`topics:` and matched none
of them, because this is REST rather than GraphQL.

So subscriptions are **per-shop, registered at install time** — not app-level
config. The export confirms it from the other side: `[webhooks]` carries an
`api_version` and no subscriptions at all.

This matters for M0a. Because the five order topics are per-shop, the TOML does
not need to declare them and **must not** start doing so casually: app-level
subscriptions and per-shop subscriptions would both fire, double-delivering
every order event to a gateway whose dedupe is keyed on `externalMessageId`, not
on webhook ID.

## Export divergences

What the export said versus what the code predicted. Scopes matched exactly —
all 15, same set, different order — which is the one that mattered most, since
M0a's whole promise rests on migrating at parity.

| Field | Predicted | Actual | Note |
| --- | --- | --- | --- |
| `access_scopes.scopes` | 15 scopes | same 15 | ✅ parity confirmed |
| `optional_scopes` | — | `[ ]` | empty |
| `use_legacy_install_flow` | `false` | `false` | ✅ managed installation |
| `application_url` | `https://app.useshopkeeper.com` | same | ✅ |
| `webhooks.api_version` | `TODO(export)` | `2026-04` | — |
| `webhooks.subscriptions` | 5 topics | **none** | per-shop instead; see Webhooks above |
| `[app_proxy]` | absent | absent | ✅ as expected, M0b adds it |
| `embedded` | `false` | **`true`** | see below |
| `auth.redirect_urls` | 1 entry | **2 entries** | see below |

**`embedded = true`.** Predicted `false` because the dashboard is a standalone
Next.js app with no App Bridge anywhere in the tree. Production says otherwise.
Left exactly as-is for M0a — parity means carrying it across even when it looks
wrong — but worth understanding before anyone "corrects" it, because flipping it
changes how Shopify frames the app in admin.

**Two redirect URLs.** The export allows both the canonical
`https://app.useshopkeeper.com/api/integrations/shopify/callback` and
`https://dashboard-shopkeeper.vercel.app/api/integrations/shopify/callback` —
the raw Vercel alias, which `vercel inspect` confirms is a live alias on the
production deployment. Carry both across in M0a; dropping one is a behaviour
change, not a cleanup.

It is worth knowing *why* the second one is load-bearing-looking but risky. Per
`.claude/CLAUDE.md`, the `*_oauth_*` handshake cookies are host-only, and
`src/proxy/canonical-host.ts` 307s `/api/integrations` onto the `APP_URL` host
precisely so a connect started on a sibling host does not lose them across the
provider hop. A merchant who somehow began OAuth on the Vercel alias would be
redirected back to that alias — and the canonical-host redirect is what saves
the flow. Removing the alias from this list is plausibly correct eventually; it
is not an M0a decision.

## Findings

### 1. Compliance webhooks are declared nowhere and handled nowhere — RESOLVED

`customers/data_request`, `customers/redact`, and `shop/redact` have **zero
handlers in the source tree**. The only GDPR-adjacent route is
`/api/org/gdpr-export`, which is the merchant exporting their own workspace data
— unrelated to Shopify's mandatory topics.

The export settles the open question, and lands on the worst of the three cases
this section originally listed: **the app declares nothing.** `[webhooks]` in
the export holds `api_version = "2026-04"` and no subscriptions, and the
per-shop registration list (`SHOPIFY_WEBHOOK_TOPICS`) contains only the five
order/uninstall topics. All three compliance topics are absent from both paths.

This is a **pre-existing compliance gap, not something M0a causes** — the app is
in exactly this state in production today. But it becomes blocking the moment
distribution is on the table, since Shopify requires all three for any app in
the App Store, and "App Store listing" already sits in this plan's deferred
list.

Do not paper over it by declaring the topics in the TOML and pointing them at
`/webhooks/shopify`. That endpoint's topic allowlist (`webhooks-shopify.ts:15`)
does not include them, so they would be rejected — a silently failing compliance
webhook is worse than an absent one. Closing this properly means writing the
three handlers first, then declaring the topics.

Out of scope for M0a, which must migrate at parity. Tracked separately.

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

## The M0a file

The hand-written draft that used to live here is deleted. It is obsolete, and
keeping it would be actively harmful — it invented `[[webhooks.subscriptions]]`
blocks the production app does not have, which would have double-delivered every
order event alongside the per-shop registrations.

**The M0a file is the export, verbatim.** That is what migrating at parity means:
[shopify-app-config-export-2026-08-07.toml](shopify-app-config-export-2026-08-07.toml)
is already a valid, complete, CLI-authoritative config for this app, because the
CLI generated it from the live app. Nothing needs authoring.

Rules for handling it:

- **Do not add `[[webhooks.subscriptions]]`.** The five order/uninstall topics
  are registered per-shop at OAuth callback. Declaring them at app level too
  would double-deliver.
- **Do not add `[app_proxy]` or `write_app_proxy`.** That is M0b.
- **Do not add `compliance_topics`.** Finding 1 — no handlers exist yet.
- **Do not "fix" `embedded = true` or drop the second redirect URL.** Both look
  wrong and both are what production has. See "Export divergences."

Which reduces M0a to: copy the export to the repo root as `shopify.app.toml`,
rehearse it on a dev app, verify the round-trip, then link production. The file
content is a solved problem; the remaining risk is entirely in the deploy path.

## Outstanding

Console and CLI steps that cannot be done from the repo.

- [x] **Install the Shopify CLI.** Done 2026-08-07 — `@shopify/cli@^4.6.1` as a
  root devDependency, so the version is pinned in the lockfile and every machine
  runs the same one. Invoke as `npx shopify`. Adds 14 packages and no new audit
  findings; the 8 that `npm audit` reports are pre-existing and none of them are
  in the added tree. `knip.json` sets `devDependencies: "off"`, so nothing
  importing it does not fail `lint:knip`.
- [x] **Capture the verbatim export.** Done 2026-08-07 against
  `shopkeeper-production` (org `40511769`). Confirmed read-only: the CLI's own
  verbose trace shows only `appByKey` / `specifications` **queries** and a local
  file write, no mutation. Divergences recorded above.
- [x] **Settle finding 1** — resolved by the export. The app declares no
  compliance topics at all, and none are registered per-shop either. Real
  pre-existing gap; blocking only for App Store distribution, not for M0a.
- [ ] **Write the three compliance webhook handlers** and declare the topics —
  separately from M0a, which migrates at parity. Blocking for distribution.
- [x] **Decide finding 2** — split applied 2026-08-07. M0a migrates at the
  current scope set; M0b adds the proxy and `write_app_proxy` separately.
- [ ] **Rehearse on a dev app** — preferring one already installed on a dev store
  over a fresh throwaway, since only an existing install rehearses "a connected
  merchant survives the migration." Record `npx shopify app versions list` first;
  `deploy` overwrites the target's name, URLs, and scopes, and
  `npx shopify app release --version <recorded>` is how you put it back. Confirm
  a restorable prior version actually exists before betting a working dev app on
  it. Webhook topics will **not** appear at app level — they arrive per-shop on
  OAuth callback, so verify them by connecting the dev store through the app
  rather than by reading app config.
- [ ] **Link production** only after that round-trip passes. Config values are
  recoverable by re-releasing a prior version; what does not obviously reverse is
  the Dashboard→CLI **management model** switch. That is the step to be careful
  about.
- [ ] **M0b, after M0a settles** — add `write_app_proxy` and the `[app_proxy]`
  block (`url`, `subpath`, `prefix`, all required), dev app first, with the
  merchant-facing explanation of the prompt written before deploy.
