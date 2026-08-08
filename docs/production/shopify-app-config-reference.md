# Shopify app configuration — rollback reference

Rollback reference for **M0a** and **M0b** of
[shopify-storefront-chat-implementation-plan.md](../shopify-storefront-chat-implementation-plan.md),
the migration from Dev-Dashboard-configured app settings to a CLI-authoritative
`shopify.app.toml`.

**Both shipped 2026-08-07** as `shopkeeper-production-9`, in one file rather than
two deploys. This file stays useful as the rollback path: `-8` is the
pre-storefront-chat configuration and remains re-releasable with
`npx shopify app release --version shopkeeper-production-8`. See "Outstanding"
for what was skipped along the way.

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

## Rehearsal evidence — 2026-08-07

Run against **`shopkeeper-dev`** (client `d572ec7e98dcdf62bed17032929fbc46`, org
`40511769` "The Case Market"). Note there is no `palette-dev` app; "Palette" is
a Shopkeeper workspace name, not a Shopify app. `shopkeeper-dev` is the local
development app — `application_url` was `http://localhost:3000/...` with a
26-scope set much broader than production's 15.

Proven:

- **The production export is a valid CLI config.** The CLI validated it and
  staged it without error, so nothing in the exported file needs fixing before
  M0a.
- **`deploy --no-release` stages without touching the live app.** It created
  `shopkeeper-dev-4` while `shopkeeper-dev-3` stayed `★ active`, confirmed via
  `app versions list`. This is the single most useful finding here: **the
  production migration can be staged and reviewed in the Dev Dashboard before
  anything goes live.**
- **The staged version renders the intended values exactly** — the production 15
  scopes, both redirect URLs, `https://app.useshopkeeper.com`, `embedded = true`,
  `api_version 2026-04`, and no webhook subscriptions.
- **Rollback history is real** — four versions listed, restorable with
  `app release --version`.
- **`embedded = true` is not a production anomaly.** `shopkeeper-dev` carries it
  too, as does `api_version = "2026-04"`. Both apps were set up the same way, so
  the divergence noted above is house style rather than misconfiguration.

Flag conflicts worth knowing: `--no-release` cannot be combined with
`--allow-updates` or `--allow-deletes`; the CLI errors out. And run the CLI from
the **repo root** with `--path`, not from inside the scratch directory — `npx
shopify` outside the workspace resolves a `shopify` package from the registry
instead of the pinned `@shopify/cli` devDependency.

### Release outcome

`shopkeeper-dev-4` was then released. Results:

- **The existing install survived.** Still 1 install, still dated
  **June 14, 2026** — the original date, so it was not dropped and re-added. A
  released config change, including a scope reduction from 26 to 15, left the
  installation intact.
- **`palette-dev` is a *store*, not an app.** It is the dev store
  `shopkeeper-dev` is installed on. Worth writing down because the name collides
  with the "Palette" Shopkeeper workspace and sent this investigation looking for
  an app that does not exist.
- The rehearsal **removed** scopes rather than adding them, so it did not
  exercise the re-authorization prompt. That is fine for M0a, which is parity and
  adds nothing. **M0b does add `write_app_proxy`, and that path remains
  unrehearsed.**

### The migration is smaller than this plan assumed

`shopkeeper-production` **is already a versioned app** — eight releases,
`shopkeeper-production-1` on 2026-06-15 through `shopkeeper-production-8` on
2026-08-03, with `-8` currently active.

So M0a is not a conversion from "Dashboard-configured" to "CLI-authoritative."
The app already lives in the versioned model the CLI operates on; `deploy` would
create `shopkeeper-production-9` exactly as `-8` was created, and `-8` stays
available to re-release. The plan's framing of an irreversible management-model
switch does not survive contact with the actual app.

What remains true: version 9 becomes the released config, so its *contents* must
be right. That risk is now handled by `--no-release` plus Dev Dashboard review.

### Unrelated production issue found — investigated 2026-08-07, already fixed

`shopkeeper-production` monitoring reports a **50.0% webhook failure rate over 7
days, flagged "High"**, at 494 ms p90 response time. Nothing to do with M0a —
found while confirming the app's version history.

**Every failure predates 2026-08-04 ~23:35 UTC. Nothing is broken now.** The
window is trailing, so the number decays on its own as clean days accumulate.

Per-topic: `orders/updated` 17 deliveries / 41.176% failed, `orders/cancelled`
7 / 71.429%, `orders/fulfilled` 1 / 100%, `orders/create` 1 / 0%. That is 26
deliveries and 13 failures — 50.0% exactly.

The route has no per-topic branch except the `orders/create` review enqueue, so
a topic-correlated rate has to be time-correlated. It is:

- `orders/fulfilled` had **one** delivery and it failed. The only fulfillment in
  the window is order #1018 on 2026-07-31.
- Order #1019 (2026-08-04 23:13 UTC, created and cancelled) produced **no rows**.
- Order #1020 (23:35 UTC) produced the **first** webhook-derived message in the
  database, at 23:35:29 UTC. Every delivery after it succeeded, including 6/6 on
  Aug 7.
- `orders/create` shows 0% because it was only registered on Aug 7 at 07:24 UTC
  — see the topic-name bug in `b1bd4fb8` — and exactly one order followed it.

The failures were **fast pre-I/O rejections**, not timeouts or slow 500s.
Measured against production: a wrong-secret 401 returns in 24–125 ms, a success
carrying a real order payload in 144–362 ms. The two single-delivery rows
bracket those exactly (117 ms failed, 250 ms succeeded), and failure rate is
monotonically anticorrelated with average response time across all four topics.

Not an outage — Postmark and Gmail inbound landed on the gateway every day
across the failure window. Not a code change — `webhooks-shopify.ts` was
untouched between 2026-07-24 and 2026-08-07, and no push landed at the
transition. That leaves a Railway environment change, and the only
Shopify-route-specific input is `SHOPIFY_APP_SECRET`.

**Unproven step:** Railway exposes no variable history through the CLI and keeps
only 20 deployments (back to Aug 7), so the variable that changed cannot be
recovered. That it is fixed is measured; the cause is inferred.

**The local secret is not the bug — do not "fix" it.** `apps/gateway/.env` holds
`708f4bfa…` against production's `38150f36…`, and that is correct:
`apps/dashboard/.env.local` pins `SHOPIFY_CLIENT_ID = d572ec7e…`, so local dev
runs against the **`shopkeeper-dev`** app and `708f4bfa…` is that app's secret.
Overwriting it with production's would break the local Shopify flow.

What it does mean is that the local gateway pairs a **dev Shopify app** with the
**production database**, so a script that loads the local env and signs a payload
will 401 against production while reading real production rows. Sign prod probes
with the value pulled from Railway, not from `.env`. It also shows how the dev
secret could plausibly reach Railway by copy-paste — the mechanism behind the
inferred cause above, not evidence for it.

Current state, verified 2026-08-07: 55+ signed probes across all five topics
plus 9 replays of real order payloads, all 200. Use
`apps/gateway/src/scripts/inspect-shopify-webhooks.ts` to list what Shopify
actually holds — the REST `webhooks.json` list is the only place per-shop
subscriptions are visible, and they never appear in app config.

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
- [x] **Rehearse on a dev app** — done 2026-08-07 against `shopkeeper-dev`,
  which was already installed on the `palette-dev` store. Evidence and outcome
  under "Rehearsal evidence" above: staged with `--no-release`, reviewed,
  released, and the existing install survived a 26→15 scope reduction with its
  original June 14 install date intact.
- [x] **Link production** — done 2026-08-07. `shopify.app.toml` is in the repo
  root and released as `shopkeeper-production-9` (commit `de2ee92f`); `-8`
  remains re-releasable. The management-model switch this item was cautious
  about does not exist — the app was already versioned, as recorded above.
- [x] **M0b** — shipped in the same file and the same version rather than as a
  second deploy, once M0a had no irreversible step left to isolate.
  `write_app_proxy` is in `[access_scopes]` and `[app_proxy]` points
  `/apps/shopkeeper-chat` at `https://app.useshopkeeper.com/api/storefront-chat/proxy`.
  The proxy resolves — Shopify-signed requests reached the route, which is how
  the empty `logged_in_customer_id` signature bug was found.
- [ ] **Two M0b follow-ups were skipped, not completed.** The merchant-facing
  explanation of the re-authorization prompt was supposed to be written before
  deploying and was not, and nobody has checked whether the one connected
  production store shows `write_app_proxy` as granted or backfilled — or whether
  it prompted at all.
- [x] **Apply `20260807120000_add_storefront_chat` to production** — done
  2026-08-08 via `prisma migrate deploy`. Verified after: `shopify_chat` is in
  the `ChannelType` enum and `storefront_chat_sessions` exists with all seven
  foreign keys including the three tenant-consistency ones. It had been merged
  and deployed on 2026-08-07 but never run, so the storefront routes were live
  against a database with no table behind them.
