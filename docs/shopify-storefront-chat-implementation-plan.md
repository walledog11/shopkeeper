# Shopify Storefront Chat

A text-only "Shopkeeper Chat" theme app extension on the existing Shopify app,
so shoppers can ask a question on the storefront and have it land in the
merchant's existing ticket, planning, approval, and Shopify-action pipelines.

**M1's bar is met; the milestone that makes the channel worth installing is
M1.5.** M0a and M0b both shipped on 2026-08-07 as `shopkeeper-production-9`.
M1's transport shipped the same evening, and on 2026-08-08 the whole loop ran on
the dev store, including the guest refusal under a real impersonation attempt.

Getting there took fixing production twice, and both are the useful part of the
record: the budget migration had never been applied (every bootstrap 500'd), and
the gateway had not deployed in six hours because of a type error in a test file
— which is why the guest planning-warning fix and the entire spend budget were
running nowhere. Both are fixed and verified live; the budget is now accounting
in production for the first time.

What is still missing is session revocation beyond the merchant toggle,
exhaustion alerting, and the eval gate. The merchant-facing toggle shipped
2026-08-10 (`fd5616db`).

**M1.5 is wired as of 2026-08-11, and the posture question that blocked it was
answered by removing it.** Verification is not an agent capability: the host runs
the challenge on its own route, and the agent only ever observes a session that
already is or is not verified. That keeps the whole ritual out of the
plan/approve loop without giving an anonymous channel auto-execute or teaching
the planner to perform side effects — and it dissolved the injected-delivery
finding rather than paying it. Built and tested; **not yet exercised live**.

**The escalation regression is fixed as of 2026-08-08.** `applyEscalationRouting`
preserves `send_reply` for guest contexts, so a guest order question replies
*and* escalates instead of going silent. Every other channel is byte-identical,
asserted rather than reasoned about. A live card on 2026-08-09 showed a reply and
a handoff together — but through a *model-elected* escalation, which was the path
that already worked. The router-materialized escalation, which is the one that
was deleting the reply, has still never fired in a live test.

**"Where is my order" is answered in-channel as of 2026-08-09**, which was the
gap this file called the reason the channel was not worth installing. It did not
take verification: `get_order_fulfillment_status` answers shipping state from an
order number and/or checkout email, returning nothing that identifies a person.
Verification is now reserved for what does — addresses, contact details, order
contents — and its data model and challenge logic are built, tested, and not yet
wired to tools.

**The prompt stopped being the product.** The guest section went from 13 bullets
and 649 words of situation-by-situation patching to 5 bullets and 269 words of
principle, because the capability that had been missing arrived. Read that
section before adding a bullet here: five consecutive commits tuned wording, and
none of them worked.

This is the only new **customer-origin** channel on the table. Nothing else
proposed adds a way for a customer to reach the merchant.

Last reviewed: 2026-08-11.

## Scope decision

The original draft shipped guest chat and Customer Account OAuth together. It
is split, and only the guest half is specified in full.

Dropping OAuth from the first shippable milestone removes the authentication
attempt table, PKCE, encrypted customer-token storage and refresh, customer
binding, two of the three new scopes, and the entire verified-session test
matrix — while still delivering the whole product loop: shopper asks a question
→ ticket → agent plan → merchant approves → reply appears in the widget.

It also removes the risk. Guest mode is the *safe* tool policy; verified order
lookup is where both the disclosure risk and the token-custody cost live. And
because guest mode needs no `customer_read_*` scopes, M1 can ship without
forcing every already-connected merchant to re-authorize.

- **M0a** — Shopify app-configuration migration. No features, no new scopes.
  ✅ **Shipped 2026-08-07**, together with M0b.
- **M0b** — App proxy and `write_app_proxy`. The scope change, isolated in
  reasoning but not, in the end, as a separate deploy.
  ✅ **Shipped 2026-08-07**, in the same file and version as M0a.
- **M1** — Guest-only storefront chat. The shippable milestone. 🚧 **Bar met,
  not finished** — transport, guest policy, kill switches and the spend budget
  all shipped and are live in production, and the full ask → ticket → plan →
  approve → reply loop is proven on the dev store including the order-disclosure
  refusal. Still missing: session revocation sweep and retention, exhaustion
  alerting, the eval gate. Merchant setup UI shipped 2026-08-10.
- **M1.5** — Emailed-code order verification. 🚧 **Wired 2026-08-11, not yet
  verified live.** Needs no new Shopify scopes, which is why it comes before M2.
  Its shape changed twice on contact. First: the most common question turned out
  not to need identity at all, so `get_order_fulfillment_status` answers "has it
  shipped" from an order number and/or checkout email, and verification is
  reserved for what actually exposes a person — addresses, contact details,
  order contents. Second: verification turned out not to belong to the agent at
  all. The challenge runs deterministically on a host route and the agent only
  reads the result, which is what let it ship without auto-executing the channel
  or making the planner side-effecting. Both findings that blocked it are
  resolved — one answered, one dissolved.
- **M2** — Customer Account OAuth. Deferred and largely superseded by M1.5.

M0 was split in two on 2026-08-07, once it was confirmed that declaring an app
proxy requires the `write_app_proxy` access scope. The original M0 promised both
a CLI migration *and* an unchanged scope set, and those turned out to be
incompatible. Separating them keeps the one-way, every-merchant-affecting
migration free of any scope change, so that if a re-authorization prompt appears
it belongs to exactly one milestone and one cause.

**The split survived as reasoning and dissolved as sequencing** (2026-08-07).
Once the rehearsal established that `shopkeeper-production` was already a
versioned app, M0a had no irreversible step left to isolate — and a two-deploy
sequence isolating nothing is just two deploys. Both landed in one file, in
`de2ee92f`. The falsifiability the split bought is therefore gone: if a
re-authorization prompt appeared, it belongs to `write_app_proxy` by elimination
rather than by construction, because that is the only scope version 9 added.

## Prerequisites

Not part of this plan, and settled before M1 starts.

- **The realtime subsystem proven in production.** ✅ **Cleared 2026-08-07.**
  Decision closed 2026-08-06 was finish and enable, not delete; both env gates
  are now set and the canary passed — `realtime:smoke` green against prod
  (delivery and cross-org non-delivery), `[Realtime] Subscribed` in the gateway
  logs, and a signed-in browser confirmed revalidating off a real push against a
  silent control window. Evidence under "Prove in prod" in
  [to-do-list.md](to-do-list.md). This plan did not inherit it silently: there it
  was optional polish over a 15s poll, here it is shopper-facing and
  latency-critical, which is why M1 waited on it.

  **This is a gate on the infrastructure, not a component M1 reuses.** The
  existing SSE is org-scoped in every dimension: `sse.ts` keys its connection
  map on `orgId`, `token.ts` verifies an `{orgId, exp}` payload signed with
  `INTERNAL_API_SECRET`, `publish.ts` uses a single global `REALTIME_CHANNEL`,
  and the CORS header admits exactly one origin (the dashboard). M1 needs
  session-scoped fan-out, a different signing secret, a storefront channel, and
  multi-origin CORS — see the transport bullets below. What the canary buys is
  proof that gateway Redis pub/sub and long-lived SSE survive Railway under
  real traffic. Budget M1 for a second SSE implementation, not for plumbing.


## M0a — Shopify app configuration migration ✅ shipped 2026-08-07

No features, and **no scope change**. If this milestone raises a
re-authorization prompt on any store, something went wrong.

**Outcome.** `shopify.app.toml` is in the repo root — the verbatim production
export, unchanged apart from the M0b additions — and was deployed as
`shopkeeper-production-9` in `de2ee92f`. `-8` remains available to re-release.
The reasoning below is kept as the record of why this was treated as dangerous
and why that turned out to be wrong.

### Why this is separate

There is no `shopify.app.toml` and no `extensions/` directory in this repo. The
app runs on **managed installation configured in the Dev Dashboard** — see the
comment at `apps/dashboard/src/app/api/integrations/shopify/auth/route.ts:49`,
which records that the Partner Dashboard configuration, not the `scope`
parameter, decides what a merchant actually grants.

A theme app extension requires the Shopify CLI and `shopify app deploy`, which
makes the TOML authoritative for scopes, webhook subscriptions, redirect URLs,
and proxy configuration — against the live install path for every connected
merchant. A mismatched TOML changes what the next install grants. It gets its own
milestone with no feature work riding on it.

**What is actually one-way, corrected 2026-08-07.** Config *values* are not.
`shopify app deploy` creates an app version — "a snapshot of your app
configuration and all extensions" — and `shopify app release --version <v>`
re-releases an earlier one, with `shopify app versions list` to enumerate them.
`deploy --no-release` stages a version without releasing it at all. So a bad
config deploy is recoverable by re-releasing the prior version.

**Verified on a real app, not just from docs.** A rehearsal on `shopkeeper-dev`
staged the production export as `shopkeeper-dev-4` while `shopkeeper-dev-3`
remained active — the live app was untouched and the staged version was
reviewable in the Dev Dashboard first. Evidence in the reference doc. This means
M0a's production step can be **staged, inspected, and only then released**,
which is a materially safer shape than this plan originally assumed.

**And the management-model switch turns out not to exist** (2026-08-07).
`shopkeeper-production` is *already* a versioned app — eight releases between
2026-06-15 and 2026-08-03, `-8` active. There is no conversion from
Dashboard-configured to CLI-authoritative to perform: the app already lives in
the model the CLI operates on, `deploy` simply creates version 9, and `-8`
remains available to re-release.

So this milestone has no irreversible step at all. What is left is ordinary care
that version 9's *contents* are right — handled by staging with `--no-release`
and reviewing in the Dev Dashboard before releasing.

### Changes

- Export the current Dev Dashboard app configuration verbatim before touching
  anything. Record it in `docs/production/` as the rollback reference. **Started
  2026-08-07** in
  [production/shopify-app-config-reference.md](production/shopify-app-config-reference.md).
  **Done 2026-08-07** — the verbatim export is checked in beside it as
  `shopify-app-config-export-2026-08-07.toml`, pulled via `shopify app config
  link` against `shopkeeper-production`. Scopes matched the code-derived
  prediction exactly, which is what M0a's parity promise rests on. **That export
  *is* the M0a file** — the CLI generated it from the live app, so nothing needs
  authoring and the earlier hand-written draft was deleted as a hazard.
- Rehearse on a dev app before production. **Prefer a dev app that is already
  installed on a dev store over a fresh throwaway** (revised 2026-08-07). A
  throwaway has no installs, so it cannot exercise the requirement that actually
  matters here — that an *existing connected install keeps working* across a
  Dashboard→CLI migration. An already-installed dev app is the only rehearsal
  that covers it.

  The cost is that `deploy` overwrites the target's config: the export would
  rename it to `shopkeeper-production`, repoint `application_url` and the
  redirect URLs, and replace its scopes. Recoverable, but record the starting
  point first rather than trusting that:

  ```
  npx shopify app versions list          # record the current version FIRST
  # link the dev app, deploy, verify the dev-store install
  npx shopify app release --version <recorded>   # restore it
  ```

  Confirm `versions list` actually shows a restorable prior version before
  betting a working dev app on the rollback. If it does not, or if the dev app
  is load-bearing for day-to-day work, use a throwaway and accept that the
  existing-install question goes unrehearsed until production.
- Note that **no dev app tests the byte-exact export**: `client_id` and `name`
  necessarily differ on any target that is not production. The rehearsal
  verifies the deploy flow, what a fresh install grants, and whether an existing
  install survives — not the literal file.
- Link the root `shopify.app.toml` to the production app only after the dev-app
  round-trip passes: deploy, install on a dev store, confirm granted scopes match
  the exported reference exactly. Webhook topics will **not** appear at app level
  — they are registered per-shop on OAuth callback — so verify those by
  connecting the dev store through the app, not by reading app config.
- Preserve managed installation and the existing scope set, byte for byte. M0a
  adds **no** scopes — an unchanged scope set means no re-authorization prompt
  for any already-connected merchant. The 15-scope list is in the reference doc;
  the app proxy and `write_app_proxy` are **not** part of this milestone, which
  is the whole reason it can make this promise.
- Confirm which mandatory compliance webhooks the app already owes
  (`customers/data_request`, `customers/redact`, `shop/redact`) and that the
  TOML declares them identically to the current Dashboard configuration.
  **Resolved 2026-08-07 by the export: the app declares none of the three, and
  registers none of them per-shop either.** The repo has no handlers for them
  and no subscription exists — a real pre-existing gap, but one M0a inherits
  rather than causes, so M0a still migrates at parity. It becomes blocking for
  App Store distribution, which is already in this plan's deferred list. Closing
  it means writing the three handlers first, then declaring the topics — not
  pointing them at `/webhooks/shopify`, whose topic allowlist rejects them into
  silent failure.

  The same export corrected a wrong assumption in this plan's framing: the five
  order/uninstall webhooks are **not** Dashboard-configured. They are registered
  per-shop against the REST Admin API on every OAuth callback
  (`integrations/shopify/callback/route.ts:368-392`), and app config declares no
  subscriptions at all. So the TOML must **not** declare them — doing so would
  double-deliver every order event.

  **That bullet is now inverted, and the inversion is deliberate** (2026-08-09,
  `e7d881c9`). The TOML declares all five topics at app level against the gateway
  address, and callback-time per-shop provisioning was deleted — the OAuth
  callback was also split out to `complete-shopify-oauth.ts`, so the line
  reference above no longer resolves. Read the bullet as the M0a-era record, not
  as current configuration.

  The double-delivery hazard it names did not disappear; it moved into a
  sequenced migration in `docs/production/shopify-webhook-migration.md`, which
  only holds if step 4 actually ran. **It did, confirmed 2026-08-11 by running
  the audit rather than by trusting the runbook.**
  `npm run audit:shopify-webhooks` against production found one Shopify
  integration — `palette-dev-3peukw16.myshopify.com`, org Palette — carrying
  `total=0` shop-specific subscriptions, so there is nothing left to duplicate
  the app-level declaration. And the active app version is
  `shopkeeper-production-12`, released 2026-08-10 02:55 UTC, three minutes after
  `e7d881c9` at 02:52 — so the released config is the one that declares the five
  topics.

  **The risk that remains points the other way.** With zero per-shop
  subscriptions, app config is now the *only* delivery path: if that declaration
  were wrong, the shop would receive nothing rather than everything twice, and
  the failure would be silent in exactly the way the topic-name bug already was
  once. Step 5 — one controlled order event reaching the gateway exactly once —
  is still unperformed, and nothing persists a Shopify webhook receipt, so an
  order event on the dev store is the only thing that can close it.

### Done when — and what was actually verified

Original bar: production app is CLI-configured, a fresh install on a dev store
grants exactly the pre-migration scope set, an existing connected merchant's
integration keeps working with no re-auth prompt, and the exported reference
config is checked in.

Met: the config is checked in, production is CLI-configured at version 9, and
the dev-app rehearsal proved an **existing** install survives a released config
change — `shopkeeper-dev` kept its single install at its original June 14 date
across a 26→15 scope reduction.

Not met, and worth knowing rather than assuming: **no fresh install was
performed** on a dev store to confirm what version 9 grants, and **no connected
production merchant has been checked for a re-authorization prompt** since the
release. There is one connected Shopify store in production, so that check is
cheap when someone wants it.

## M0b — App proxy and `write_app_proxy` ✅ shipped 2026-08-07

The scope change, isolated from the migration and from the widget. Small, but it
is the only milestone in this plan that touches what existing merchants have
granted, which is why it is not folded into either neighbour.

### Why this is separate

Declaring an app proxy requires the `write_app_proxy` access scope — confirmed
2026-08-07 against Shopify's app-proxies documentation, which states it directly.
The app-configuration reference page omits it entirely, and that omission is
what made the original M0 believe it could migrate *and* stay scope-neutral.

Adding the scope raises a re-authorization prompt for active merchants. It does
not break them: stores that never accept it are backfilled server-side by
Shopify and keep working. But a prompt is merchant-visible, and on a product
whose first principle is that trust is binary, it should arrive attached to a
feature the merchant asked for rather than to invisible plumbing.

Kept out of M0a so the migration's "no prompt" claim is falsifiable — if a
prompt appears during M0a, it is a defect, not an expected side effect.

Kept out of M1 as a milestone so the scope change can land and settle on its own
schedule, ahead of the widget. M1's bootstrap route depends on the proxy
existing, so M0b must be live before M1 can be tested end to end — but it does
not have to ship in the same change, and it should not.

### Changes

- Add `write_app_proxy` to `[access_scopes]` in the TOML, on top of the exact
  15-scope set M0a preserved. This is the only scope this plan adds before M2.
- Configure the app proxy: `/apps/shopkeeper-chat` → `/api/storefront-chat/proxy`
  on the dashboard host. Per Shopify's schema all three keys are required —
  `url`, `subpath` (alphanumeric, ≤30 chars, not `admin`/`services`/`password`/
  `login`), and `prefix` (one of `a`, `apps`, `community`, `tools`).
- Land it on the same dev app M0a rehearsed on and confirm the proxy resolves,
  exactly as M0a did for the base configuration.
- Decide and write the merchant-facing explanation for the prompt **before**
  deploying, not after the first merchant sees it. Connected merchants at this
  point are few enough to tell directly.
- Expect the storefront-chat routes to 404 until M1 lands. That is correct — a
  configured proxy pointing at an unbuilt route is inert, and shipping the scope
  early is the entire point of the split.

### Done when — and what was actually verified

Original bar: the production app declares the proxy, `write_app_proxy` is granted
or backfilled on every connected store, no merchant's existing integration has
degraded, and the prompt has been explained to whoever saw it.

Met: version 9 declares `[app_proxy]` (`/apps/shopkeeper-chat` →
`https://app.useshopkeeper.com/api/storefront-chat/proxy`) with
`write_app_proxy` in `[access_scopes]`, and the proxy resolves — Shopify-signed
requests reached the bootstrap route, which is how the signature bug in
`a0cad69c` was found and fixed.

Not met: the merchant-facing explanation was never written, and is still owed.

**Partial answer on the grant state, 2026-08-08.** The connected integration's
recorded `oauthScopes` holds 11 scopes and `write_app_proxy` is not among them.
This is *not* evidence of a broken proxy — Shopify-signed requests reach the
bootstrap route and did so again during the live run above, because that scope
governs the app *declaring* a proxy through the CLI, not a merchant's install
serving one. Treat the stored list as possibly stale rather than authoritative:
it holds 11 entries where this plan describes a 15-scope set, so it is more
likely a partial record written at OAuth time than a true picture of the grant.
Reading it out of `Integration.metadata` is not the same as asking Shopify, and
the real check — does the connected store show a re-authorization prompt — is
still unperformed.

## M1 — Guest-only storefront chat 🚧 partially built

Shoppers can start immediately and anonymously. Shopkeeper answers from the
knowledge base and public product information, escalates, and asks the merchant.
It discloses nothing customer-specific and mutates nothing, ever, on any input.

### Status — 2026-08-08

**Turned on and proven inbound, 2026-08-08.** Both switches were flipped in
production and a real message was sent from the dev storefront. Every inbound
link worked on the first attempt, with no code change required:

| Link | Evidence |
| --- | --- |
| Platform switch | `STOREFRONT_CHAT_ENABLED=true` added to Vercel production (stored *Sensitive*, so its value cannot be read back through the CLI or dashboard — to change it, remove and re-add). Production redeployed from the then-current deployment so no code rode along. Confirmed live because `bootstrap` began returning `401 invalid signature` instead of `403 disabled` — the global check at the top of the route runs before the signature check, so the two states are distinguishable without a signed request. |
| Merchant switch | `Integration.metadata.storefrontChat.enabled = true` on `9598dee1…`, org Palette, shop `palette-dev-3peukw16.myshopify.com`. Written as a merge so the existing `oauthScopes` survived. There is still no UI for this. |
| Gateway | `/internal/storefront-chat/message` returns `401` without the internal secret and a bogus sibling path returns `404`, proving the route is mounted and deployed, on a Railway build from after every storefront commit. |
| Bootstrap | Session `56283855…` created, bound to the org, integration and storefront host. No customer and no thread yet, as designed — an abandoned widget open costs one row and never an empty ticket. |
| Ingest → ticket | Thread `a45c5ff9…`, `channelType: shopify_chat`, `status: open`, one `senderType: customer` message. |
| Classification + summary | Tag `General`, `aiSummary` "Customer wrote a single word: \"Testing.\"" |
| Plan precompute | `cachedPlan` v5: a single `send_reply` greeting, `routing.decision: auto_execute`, one warning. |
| Operator notify | A pending plan for this thread landed on operator context `member:ae24ef3b…` nine seconds after the thread was created. |
| Autonomy held | Org settings are `autonomyTier: guarded`, `autoExecuteMode: off`, so the plan parked for approval and did **not** auto-execute despite the planner's `auto_execute` routing preference. Correct precedence. |

**The loop closed the same day.** A second message was sent from the dev
storefront, the plan was approved, and the reply appeared in the widget — so
approve → dispatch → `storefrontChatSession` lookup → persist → widget poll all
work, on the code already shipped and with no change required. That was the
milestone's last unexercised inbound-to-outbound link, and it is the first time a
shopper-visible answer has come back out of this channel.

Recorded as the author's live observation from the storefront, not as a
reconstruction from the database: what is certain is that the reply arrived in
the widget after approval. Nobody has since gone back to check *which* approval
surface sent it, the persisted `senderType`, or the delivery latency.

**The guest policy was proven live later the same day**, with the order-number
-plus-email message this paragraph used to ask for. The transcript and what it
does and does not establish are under "Done when".

**And proving it found the channel hard down in production.** Between the deploy
of `85d990cc` and 2026-08-08 ~19:50 UTC, *every* bootstrap on the dev store
returned 500: migration `20260808120000_add_storefront_chat_budget` had never
been applied to the production database, so `storefrontChatSession.create()` hit
`P2022 — the column message_count does not exist`. The widget rendered its
generic "We couldn't start the chat just now" and Shopify's proxy wrapped the
500 in the storefront theme, so from the storefront the failure looked like a
transient network problem rather than a schema mismatch. Fixed by running
`db:migrate:deploy` against production; `migrate status` then showed it as the
only pending migration, which is how narrow the gap was.

**This is the same landmine twice, and it should stop being written as advice.**
The plan already carried "the migration must reach production before the gateway
build that reads the new columns" for `20260807120000` — which also shipped
before it was applied — and then `20260808120000` repeated it exactly. Two for
two. Nothing in the deploy path enforces the ordering, and the failure is
invisible from the merchant side: the dashboard stays healthy, the route answers
`401` to an unsigned probe (which reads as "alive"), and only a *signed* request
reaches the failing query. The cheap check is `prisma migrate status` against
production as a release step; the real fix is making it impossible to deploy code
ahead of its migration.

**The gateway has not deployed since 2026-08-08 19:29 UTC, and that is the
bigger finding.** The running build is `9b6a5b75`. Every deploy after it failed
— `3d55de9f`, `649ade45`, `97d97c6d` — on a **TypeScript error in a test file**:
`digest.test.ts` passed `waitingOpenCount` to `DigestMessageExtras` after
`3d55de9f` removed the field, and the gateway's build script runs `tsc` over the
whole workspace including tests. Two consequences, neither of which is visible
from the merchant side because the old build keeps serving happily:

- `405e1dea`, the guest planning-warning fix, **is not live**. That is the actual
  reason the warning still fired on the live run — not a second code path. An
  earlier draft of this section blamed a duplicate emitter in the dashboard's
  `ActionPlanBody.tsx`; that was wrong, and checking rather than assuming is what
  corrected it. `warningDisplayText` there only *rewrites* the display text of a
  warning the plan already carries — it emits nothing, so it goes silent on its
  own once a gateway carrying the fix generates the plan.
- **The storefront spend budget is not live either.** `85d990cc` is not in the
  running build, so none of the four containment layers is enforced in
  production, and has never been. The "standing risk" section below claims spend
  is bounded; as of this writing that is true of the code and false of the
  deployment. The migration is applied, so the budget starts working the moment
  the gateway deploys.

The build error is fixed by dropping the stale property. The durable lesson is
that **a type error in a test file takes the gateway down silently** — the build
compiles tests, Railway keeps the last good container running, and nothing
distinguishes "deployed" from "deploying onto a six-hour-old build" without
checking `railway deployment list`. Worth checking whenever gateway-side code
looks like it did not take effect.

**One defect the live run surfaced, now fixed:**

- **The widget double-renders the shopper's own message.** `send()` appends the
  message optimistically and `render()` dedupes only on `seen[m.id]`, so the
  polled copy appends a second bubble. The optimistic bubble cannot carry an id:
  the send endpoint answers `202 accepted` before the gateway has persisted
  anything, so there is no id to return. Reconciled by text instead — an entry
  per optimistic bubble, dropped when the server's copy arrives, and released on
  a 429 or a network failure so a refused message never swallows the shopper's
  retry.

One more thing worth knowing before anyone debugs the poller: the widget polls
only while `document.visibilityState === "visible"`, so a background tab receives
nothing until it is focused. That is correct behavior, and it will look exactly
like broken delivery in any automated or split-screen verification.

**A warning fired on every storefront plan. ✅ Fixed 2026-08-08.** The cached
plan carried *"Couldn't find a Shopify customer — verify the correct account is
linked before approving."* For a guest shopper there is no Shopify customer by
construction, so it appeared on every plan and asked the merchant to do something
impossible. `appendInitialPlanningWarnings` in
`packages/agent/src/planner-read-tools.ts` now exempts guest contexts, with two
tests — silent for a guest, unchanged on email.

**It was cosmetic, not a classifier bug** — the suspected second half of this,
that it also suppressed `quick_reply` the way the July `search_kb` warning did,
is **false**, checked rather than assumed. `warningBlocksQuickReply` in
`plan-preview.ts:96` blocks on this warning only when the plan actually uses a
customer or order read tool, and the guest allowlist forbids all of those, so it
was already non-blocking. The live run agrees: that plan routed `auto_execute`
while carrying the warning. What the fix buys is merchant trust in the warning
line, not classification.

**Built** (`c3733e33`, `de2ee92f`, `97232cc0`, `a0cad69c`):

- The theme app extension in `extensions/shopkeeper-chat` — a `body`-targeted
  app embed rendering into a Shadow DOM, with launcher label, greeting, accent
  and position as theme settings. It **polls**; SSE was deliberately deferred.
- `ChannelType.shopify_chat` and `StorefrontChatSession`, migration
  `20260807120000_add_storefront_chat` — **applied to production 2026-08-08**.
  It had been merged and deployed but never run, so until that morning bootstrap
  would have 500'd on session create and no shopper message could land. Nothing
  has yet flowed end to end in production.
- `POST /api/storefront-chat/proxy/bootstrap` and `GET|POST
  /api/storefront-chat/proxy/messages` on the dashboard, both behind the
  app-proxy signature *and* a session bearer token; tokens signed with
  `STOREFRONT_CHAT_SIGNING_SECRET` (set in Vercel production), resume secrets
  stored hashed.
- The proxy signature verifier, separate from the webhook one, including the
  restored empty `logged_in_customer_id` that Shopify signs and the request
  drops — established by measurement against a real request, with unit tests.
- Gateway `/internal/storefront-chat/message` → `processInboundMessage`, so
  storefront messages inherit dedupe, classification, summary, plan precompute,
  operator notify, and the existing `threads_one_open_per_customer` P2002
  re-find rather than a parallel pipeline.
- Outbound: `sendReply`'s channel allowlist and `dispatch-message.ts` persist
  into the session's thread, refusing a revoked session.
- Channel plumbing across `CHANNEL_INFO`, the gateway `CHANNEL` constants, the
  analytics union, and the agent package's `CHANNEL_TYPE`.
- **The kill switches** (2026-08-08). `STOREFRONT_CHAT_ENABLED` is the platform
  switch and `Integration.metadata.storefrontChat.enabled` the merchant's;
  **both default off**, and a storefront is chattable only when both are on.
  Enforced in bootstrap and re-read on every `/messages` call rather than
  trusted from the session token, so disabling takes effect immediately instead
  of at the end of the token's hour. The widget removes itself on a 403 rather
  than showing an error. The merchant flag is writable from the Shopify
  integration card (2026-08-10, `fd5616db`) or by direct `metadata` merge.
  **Both switches are now on for the Palette dev store** (see the table above);
  they remain off everywhere else, and off is still the default for any new
  install.
- **The guest tool policy** (2026-08-08). `authState: "guest"` on the agent
  context, set in `buildContext` for `shopify_chat` threads and nowhere else.
  Enforced in three places: the planner and the run loop select from
  `GUEST_TOOL_NAMES`, and `checkStaticToolPolicy` refuses anything outside it
  ahead of argument parsing, so a plan that names a forbidden tool is blocked at
  execution rather than merely absent from the tool list. The allowlist is
  knowledge base, product search, `send_reply`, escalation, merchant questions,
  and internal thread housekeeping — no order read, no customer read, no Shopify
  mutation, and additionally no `send_email` (a guest's address is unverified)
  or `get_support_stats` (the merchant's business, not the shopper's question).
  A guest-only prompt branch tells the agent to say plainly that it cannot look
  up orders here and hand off.
- **The spend budget** (2026-08-08, `85d990cc`). Four layers claimed in
  `apps/gateway/src/storefront-chat-budget.ts` from the internal route *before*
  `processInboundMessage`: per-session and per-IP fixed-window burst limits on
  gateway Redis, then per-session (`StorefrontChatSession.messageCount`) and
  per-shop-per-day (`storefront_chat_daily_usage`) message budgets in Postgres.
  Refusals return 429 with shopper-facing copy, which the dashboard passes
  through with `Retry-After` rather than flattening to a 502, and which the
  widget renders as a note rather than a delivery failure. Counters move only on
  an admitted message. Details and the accepted trade-offs are in "Abuse and
  spend containment" below.
- Tests: cross-tenant data-model tests, app-proxy signature unit tests, switch
  enforcement on both proxy routes, 50 guest-policy tests — every registry tool
  classified allowed-or-forbidden so a new tool cannot land unclassified, refusal
  asserted per forbidden tool and across every autonomy tier including `full`,
  and non-guest results asserted unchanged — plus five budget tests on the
  gateway route (per-session ceiling, per-shop ceiling, burst refusal,
  admitted-only accounting, per-integration attribution) and three on the
  dashboard hop (429 passthrough, address forwarding, genuine failure still
  502). Two guest tests on the planning warning.
- **Merchant setup UI** (2026-08-10, `fd5616db`). `ShopifyStorefrontChatSection`
  on the Shopify integration card: an admin-only **Enable storefront chat**
  toggle backed by `PATCH /api/integrations/shopify/storefront-chat`, which merges
  `metadata.storefrontChat.enabled` without touching unrelated metadata (e.g.
  `oauthScopes`). Enabling is rejected when `STOREFRONT_CHAT_ENABLED` is not
  `"true"`; disabling sets `revokedAt` on every active session for that
  integration so in-flight tokens stop working immediately. When enabled, the
  card shows setup steps, a theme-editor deep link
  (`buildShopifyThemeEditorAppEmbedUrl` → `activateAppId={client_id}/chat`), and
  a warning to disable Shopify Inbox's storefront bubble to avoid duplicate
  launchers. Unit tests on metadata merge and the theme-editor URL; an
  integration test on the PATCH route (metadata preservation, global gate,
  revocation on disable).

**Not built** — everything that still blocks pointing at real shoppers without
ops babysitting:

- **The local acknowledgement in approval mode** — the one bullet of the guest
  section still outstanding. The widget shows the shopper's own message
  optimistically but nothing acknowledges that a reply is coming while a plan
  waits for the merchant, and the acknowledgement must not be persisted as a
  `Message` or it invalidates the pending plan.
- **Session revocation and retention — partial.** Disabling storefront chat from
  the integration card revokes every active session for that integration
  (`fd5616db`). Shopify disconnect and `app/uninstalled` still remove sessions by
  cascading integration delete. What is still missing: a scheduled sweep for
  expired sessions, revocation on workspace deletion without integration delete,
  and any `retention.ts` / `purge.ts` coverage. `storefront_chat_daily_usage` is
  likewise unswept — it grows one row per shop per day forever.
- **Budget exhaustion alerting and content filtering.** Exhaustion logs a warning
  and the daily counter deliberately climbs past its ceiling so sustained abuse
  stays distinguishable from a shop that merely reached its limit — but nothing
  reaches the merchant, and nothing inspects what a first message actually says.
  The budget bounds volume, not content.
- **Most of the test plan**, and the eval gate — which became owed the moment
  guest state touched the planner, and is still unpaid. See the test plan.

**Standing risk — reduced 2026-08-08, and no longer the same risk.** Both
switches are on for exactly one store: `palette-dev-3peukw16.myshopify.com`, a
dev store the author controls.

With the guest policy landed, what a shopper can *reach* is bounded — no order or
customer data, no Shopify mutation, at any autonomy tier. With the budget landed
**and, since 2026-08-08, actually deployed**, what a shopper can *spend* is
bounded too: 30 messages per session and 200 per shop per day, refused before the
model runs, so exhaustion degrades the widget and leaves the org cap and the
merchant's other channels alone.

For most of the period this section described the budget as bounding spend, it
was bounding nothing — the code was merged and the gateway was serving a build
that predated it. "Shipped" and "deployed" are different claims, and this file
should keep making that distinction rather than collapsing it.

What remains is not spend but **operational blindness**: nothing tells the
merchant their storefront hit its ceiling, no sweep retires expired sessions,
and no content check stands between a bot and 200 admitted messages a day. Those
are the reasons to still stage the second store carefully, rather than the
runaway-cap reason that stood here before.

The exposure today is a dev store with no traffic and no inbound links. Enabling
a second store no longer requires a raw `metadata` write — the integration card
toggle is live as of 2026-08-10 — but nothing has exercised it on a merchant
workspace yet.

### Data model

- Add `shopify_chat` to `ChannelType`. Leave the existing `shopify` channel and
  its email-fallback behavior unchanged.
- Add `StorefrontChatSession`: organization, Shopify integration, anonymous
  customer, active thread, storefront host, hashed resume secret, last-seen,
  expiry, revoked-at. **No token columns and no verified-customer column** —
  those arrive with M2.
- Anonymous customers use `platformId = shopify_chat:<session-id>`.
- Add the budget counters: `StorefrontChatSession.messageCount` (lifetime per
  session — the session itself expires, and a shopper who clears it to reset the
  count lands on the per-shop and per-IP layers instead) and
  `StorefrontChatDailyUsage` keyed uniquely on `(integration_id, day)` so
  concurrent shoppers on one shop increment atomically. Migration
  `20260808120000_add_storefront_chat_budget`, purely additive. **Deliberately
  not `llm_daily_spend`** — exhausting the storefront must degrade the widget
  alone and leave the merchant's email and Instagram agents running, which a
  shared counter cannot express.
- Store only the hash of a 32-byte browser resume secret; never the secret.
- Revoke sessions on app uninstall, Shopify disconnect, merchant chat
  disablement, workspace deletion, and customer deletion.
- Retain chat messages under existing retention and deletion rules; extend the
  existing export and deletion paths to cover sessions.

Adding the enum member is a code milestone, not a rollout checkbox:
`channelType` has ~264 references across ~90 non-test files, and
`CHANNEL_INFO` in `apps/dashboard/src/lib/messaging/channels.ts` is an
exhaustive `Record<ChannelType, ChannelInfo>` that will not compile until every
such map is updated. Budget for `DASHBOARD_CHANNEL_TYPES`, `OPERATOR_CHANNEL_ORDER`
(`lib/integrations/catalog.ts`), the gateway `CHANNEL` constants
(`apps/gateway/src/constants.ts`), ticket filters, and analytics unions.

### Public interfaces and message flow

- **Bootstrap** — `POST /api/storefront-chat/proxy/bootstrap`. Verify Shopify's
  canonical app-proxy signature, timestamp freshness, shop domain, installed
  integration, enabled state, and forwarded storefront host. Accept optional
  `{sessionId, resumeToken, locale, pageUrl}`. Resume a valid session or create
  one **without** creating an empty ticket. Return session ID, the resume secret
  when newly created, short-lived API/SSE tokens, public widget settings, and
  initial message history.
- Mint storefront access and SSE tokens with a dedicated
  `STOREFRONT_CHAT_SIGNING_SECRET`, never `INTERNAL_API_SECRET`. Bind every
  token to one session, organization, Shopify integration, and storefront host,
  and enforce tenant ownership on every read and write.
- **Transport** — `POST /storefront-chat/messages` (bearer session token,
  returns `202`), `GET /storefront-chat/messages?cursor=...` (customer-visible
  messages only; internal notes and action logs never leave Shopkeeper),
  `GET /storefront-chat/events?token=...` for conversation-scoped SSE
  invalidations. Limit text to 4,000 normalized characters; dedupe on
  `shopify_chat:<session-id>:<clientMessageId>`.
- Put shopper traffic on the **gateway**, not the dashboard, apart from the
  app-proxy bootstrap that Shopify itself must sign. The gateway already holds
  long-lived connections; Vercel functions must not, and the existing
  dashboard rate limiter is Upstash-REST-backed, so every send would add a
  round trip. Note also that `rate-limit.ts` fails closed outside development.
- Adding `/api/storefront-chat/*` to `publicRoutePatterns` in
  `apps/dashboard/src/proxy/path-access-policy.ts` makes it the first
  **shopper-traffic** public route; that list is otherwise webhooks and OAuth
  callbacks. Keep the added surface to bootstrap alone.
- Add a storefront-chat queue job and persistence handler: lock the session
  while creating its first customer/thread or rolling a closed thread into a new
  ticket; create `shopify_chat` threads linked to the existing Shopify
  integration; reuse the existing summary, classification, planning,
  notification, and escalation processing.
- **Both of those thread-create paths run into `threads_one_open_per_customer`**
  — a partial unique index over (organization, customer, channel) `WHERE status
  = 'open'`, created in migration
  `20260405000000_add_idempotency_and_thread_uniqueness` and **absent from
  `schema.prisma`**. Prisma will not warn, will not generate a typed constraint
  error, and the failure surfaces as a raw Postgres unique violation under
  concurrency. This drift has already broken thread-create work once. Design the
  session lock and the closed-thread rollover against the index as it exists in
  the database, and decide up front whether a losing racer retries onto the
  winner's thread or surfaces a send failure to the widget.
- Extend outbound dispatch so manual, approved, and autonomously executed
  `send_reply` operations persist normally and publish to the matching
  storefront session. This is a small change: `lib/messaging/dispatch-message.ts`
  is 81 lines and `sendReply` guards on a three-channel allowlist at
  `lib/agent/tools/thread.ts:105`. Provider failure must not create a
  successful outbound message.
- Publish identifiers only on a storefront-specific Redis channel; the browser
  refetches history after an invalidation. Fall back to 15-second polling when
  SSE is unavailable, with optimistic states and same-client-message-ID retry.

### Guest tool policy — ✅ built 2026-08-08

Every bullet below is implemented except the local acknowledgement, which is
called out in the status block above.

- Add `guest` authentication state to agent context. M1 has no other state.
- Allow knowledge base, policy, and non-customer-specific product information.
  Allow `send_reply`, escalation, and merchant questions.
- Block every order read, every customer read, and every mutative Shopify action
  in **static tool policy**, not in the prompt.
- Never treat an order number, email address, Liquid customer value, or
  browser-supplied Shopify ID as authentication. In M1 there is nothing they
  could unlock, which is the point.
- Existing autonomy tiers, refund limits, business hours, execution ledger, and
  approval hashes remain authoritative for the reply path.
- Show an immediate local acknowledgement in approval mode but do **not**
  persist it as a `Message` — a persisted agent reply invalidates the pending
  customer plan that the approve→execute path requires.
- When a shopper asks for order help, say plainly that Shopkeeper cannot look up
  orders here yet and hand off (escalate or point to email). Do not ship a
  sign-in affordance that leads nowhere.
- **Say it in shop register, not system register** (added 2026-08-08 after the
  live run). "Say plainly" turned out to under-specify the *voice*: the first
  real refusal told the shopper the widget "has no order lookup access", which
  is implementation talk aimed at someone who is buying a snowboard, reads as a
  half-built store, and tells anyone probing exactly which surface to try next —
  email, where the order tools do exist. The guest prompt branch now forbids
  naming tools, lookups, widgets, integrations or permissions, and forbids
  inventing a support department or an email address it was never given.

### Abuse and spend containment — ✅ built 2026-08-08

This is the first surface where an anonymous stranger can trigger LLM spend with
no account, and it needed its own budget. `packages/db/spend-store.ts` keys spend
on `(organization, day, model)` only — with no isolation, a scraped or
bot-spammed storefront burned the org's entire daily cap and took the merchant's
email and Instagram agent down with it.

- ✅ A per-session and per-shop-per-day storefront budget, enforced separately
  from and beneath the org daily cap. `StorefrontChatSession.messageCount` and
  the new `storefront_chat_daily_usage` table, claimed in
  `apps/gateway/src/storefront-chat-budget.ts` from the internal route **before**
  `processInboundMessage` — so a refusal costs nothing and leaves the org cap
  untouched. Asserted directly: the shop-budget test checks `llm_daily_spend` is
  still empty after a refusal.
- ✅ Gate before the model: per-session and per-IP fixed-window burst limits on
  gateway Redis, failing closed in production, ahead of the daily counters.
- ❌ A cheap non-LLM check on the first message of a session — not built. The
  burst and budget layers bound the volume; nothing yet inspects the *content* of
  a first message for spam.
- ❌ Alert the merchant on sustained exhaustion. Exhaustion logs `opsAlert`-shaped
  warnings and the daily counter deliberately keeps climbing past the ceiling so
  sustained abuse is distinguishable from a shop that merely reached its limit —
  but nothing reaches the merchant yet.

**Denominated in messages, not dollars, and that is a deliberate trade.** The
gate has to run before the model to be worth anything, and at that point the
spend of the message being admitted is not yet known. One admitted message costs
at most one classification, one summary and one plan, so a message ceiling is a
spend ceiling with a known multiplier. True per-session dollar attribution would
mean threading a spend scope through `recordSpend` at every LLM call site
including the planner — a shared-surface change that pulls in the eval gate — and
is deferred until a real merchant's traffic makes the accuracy worth it.

Defaults, all env-tunable in the gateway: 30 messages per session, 200 per shop
per UTC day, 5 per session and 20 per IP per minute
(`STOREFRONT_CHAT_MAX_MESSAGES_PER_SESSION`,
`STOREFRONT_CHAT_MAX_MESSAGES_PER_SHOP_DAY`, `STOREFRONT_CHAT_BURST_PER_SESSION`,
`STOREFRONT_CHAT_BURST_PER_IP`, `STOREFRONT_CHAT_BURST_WINDOW_SECS`).

**One weakness worth naming: the per-IP limit rests on an unverified header.**
Two proxies sit between the shopper and the route — Shopify's app proxy and
Vercel — and the code takes the leading `x-forwarded-for` entry without having
confirmed that is the shopper's address. It is keyed on (integration, address)
so that being wrong degrades into a second per-shop rate limit rather than
leaking across merchants or locking out the internet, and neither the
per-session burst limit nor either daily budget depends on it. Worth measuring
against a real storefront request the next time someone is in there.

### Widget

- Render inside a Shadow DOM with keyboard navigation, focus trapping,
  screen-reader labels, reduced-motion support, and a responsive mobile layout.
- Theme settings for button color, left/right position, greeting, and launcher
  label. Message UI stays text-only.
- Persist session ID and resume secret in shop-scoped `localStorage`; assume no
  app-proxy cookies.
- Show current and previous customer-visible messages for that browser session,
  including across closed-ticket rollover.
- Show reconnect, send-failed/retry, disabled, and rate-limited states.
- Exclude attachments, typing and read receipts, product cards, cart operations,
  email notifications, sign-in, and cross-device recovery.

### Merchant setup

- ✅ Add a `body`-targeted theme app embed containing the isolated chat
  bubble/dialog. Shipped with the theme extension (`de2ee92f`).
- ✅ Add "Enable storefront chat" to the existing Shopify integration card
  (**2026-08-10**, `fd5616db`): per-integration enabled flag
  (`PATCH /api/integrations/shopify/storefront-chat`), deep link to the theme
  editor's app-embed activation screen (`activateAppId={client_id}/chat`), and an
  explanation that Shopify Inbox's storefront bubble must be disabled to avoid
  duplicate launchers. The platform kill switch remains
  `STOREFRONT_CHAT_ENABLED`; the merchant-level disable action revokes active
  sessions when toggled off.
- No checkout or thank-you page targets.

### Test plan

- Unit — app-proxy signature canonicalization, duplicate parameters, timestamp
  replay rejection, shop binding, origin binding, token expiry, resume-secret
  hashing, CORS.
- ✅ Storefront budget exhaustion degrades the widget and leaves the org cap and
  other channels usable. Covered on the gateway route rather than as a pure unit
  test, because the property worth asserting is a database one: after a refusal,
  `llm_daily_spend` is empty for the org.
- Session-first-message races, closed-thread rollover, idempotent client
  retries, 4,000-character truncation, rate limits, spam filtering, uninstall
  revocation. Race coverage must assert against real
  `threads_one_open_per_customer` behaviour — two concurrent first messages on
  one session resolve to a single open thread, and rollover after close does not
  collide with a thread the merchant reopened.
- **Eval gate — owed, not yet run** (as of 2026-08-08). The guest policy landed
  and it does touch shared planner files, so the standing invariant in
  `.claude/CLAUDE.md` applies. The argument for not running it *yet*, to be
  weighed rather than assumed:

  - The non-guest system prompt is **byte-identical** — verified by rendering
    `buildSystemPromptParts` for an email thread against the same function at
    `HEAD` and diffing, not by reading the diff.
  - Every guest branch is gated on `authState === "guest"`, which `buildContext`
    sets only for `shopify_chat`. Non-guest tool selection resolves to the same
    call it always made (`selectAgentTools(settings, null)` and
    `selectAgentTools(settings)` are the same filter), and a test asserts static
    policy returns identical results with and without the options object.
  - No eval fixture is a `shopify_chat` thread, so the gate as it exists cannot
    exercise the new path at all — a run would re-measure an unchanged surface.

  What that argument does **not** cover: the gate is also a regression net for
  changes whose effect nobody predicted, which is precisely the class this
  reasoning cannot rule out.

  **That bundling plan lapsed, and saying so is the point of writing it down.**
  The recommendation here was to run the gate once together with the
  storefront-budget change so one run covered both. The budget shipped on
  2026-08-08 (`85d990cc`) and no eval run happened. Two things soften it and
  neither dissolves it: the budget change touches no agent-package file at all —
  it lives in the gateway route, the gateway config and the dashboard hop — and
  the one shared-surface change that did land alongside it, the guest planning
  warning (`405e1dea`), is gated on `isGuestContext` with a test asserting the
  email path is byte-identical. So the debt is unchanged in size rather than
  grown. It is still owed, and the next agent-surface change is the moment to
  stop deferring it.

  Still true when that happens: the fixtures carry no `classifierSignals`, so the
  gate has never exercised production's `computeClassifierRouting` path, and eval
  runs are expensive enough to need justifying — single-fixture probes for
  diagnosis, no tune-then-rerun loop.
- **Guest fixtures do not exist yet.** Adding a `shopify_chat` fixture to the
  eval set is the only way the gate will ever cover guest behaviour; without one
  the policy is covered by unit tests alone.
- Guest static-policy enforcement against order searches, customer reads,
  refunds, cancellations, edits, credits, discounts, and prompt-injection
  attempts — including a shopper who supplies a real order number and email and
  claims to be the owner.
- Dispatch persistence and storefront publication for merchant replies,
  approvals, auto-execution, provider failures, and Redis/SSE outages.
- Integration — guest message → queue → ticket → guarded draft → merchant reply
  → SSE → widget; guest informational message → trusted live reply; guest order
  request → blocked tools and honest handoff; reload/reconnect → same-browser
  history; closed ticket → next message opens a new ticket with coherent widget
  history.
- Dev-store browser matrix: Online Store 2.0 and a vintage-compatible theme,
  desktop and mobile viewport, app embed disabled and enabled, Inbox bubble
  present and removed.
- Production canary verifying bootstrap, message persistence, dashboard
  visibility, reply delivery, SSE invalidation, and session revocation with no
  Shopify mutations.

### Rollout

- Ship database and channel support first, then dark gateway/dashboard routes,
  then the disabled theme extension. M0a has already settled app configuration
  and M0b the proxy, so no step here touches app config or scopes.

  **This ordering was not followed** (2026-08-07). Database and channel support
  shipped first as intended, but the routes went out live rather than dark —
  there is no flag to darken them with — and the theme extension deployed
  enabled. The sequence is still the right one for the remaining work; treat it
  as the plan for landing the flags, not as a description of what happened.
- Gate globally with `STOREFRONT_CHAT_ENABLED=false` and per integration with
  `storefrontChat.enabled=false`. ✅ Both switches built and defaulting off;
  both deliberately turned **on** in production on 2026-08-08 for the dev store.
- Enable on the controlled dev store, then one merchant workspace in approval
  mode, before any live-autonomy store. ✅ **Dev store done 2026-08-08** —
  `palette-dev-3peukw16.myshopify.com`, in `guarded`/`off`, which is approval
  mode. ✅ **Merchant toggle done 2026-08-10** (`fd5616db`) — the rollout
  blocker that required a DB write is gone. **Next:** enable one real merchant
  workspace in approval mode through the integration card (toggle on, theme
  embed activated, Inbox bubble off), and verify the full loop without ops
  touching metadata.
- Add `shopify_chat` to ticket filters, channel labels, analytics unions,
  operational alerts, provider-send metrics, integration health, and production
  audit scripts.
- Monitor inbound volume, rate-limit and spam rejection, first-response latency,
  SSE reconnects, dispatch failures, auto-execution outcomes, storefront budget
  exhaustion, and LLM spend per session.
- Roll back by disabling the global flag and the theme embed; retain sessions
  and messages for audit.

### Done when

A shopper on the dev store can ask a question, the merchant sees a ticket with a
plan, approving it delivers the reply into the widget, and a shopper attempting
order disclosure through any phrasing gets an honest handoff — with the
storefront budget provably isolated from the org cap.

Against that bar, as of 2026-08-08:

- ✅ A shopper on the dev store can ask a question.
- ✅ The merchant sees a ticket with a plan, and is notified on a bound operator
  channel.
- ✅ Approving it delivers the reply into the widget — **exercised live**, dev
  store, 2026-08-08.
- ✅ Order disclosure gets an honest handoff — **exercised live 2026-08-08**, and
  with the strong form of the test rather than a proxy for it. The shopper named
  a real unfulfilled order (`#1025`), supplied an email, claimed to be the owner,
  and asked for both tracking and the shipping address on file. The agent
  refused all three, disclosed nothing, invented nothing, and handed off to
  email while echoing back the order number so the shopper could reuse it:

  > Hi Adam, thanks for reaching out. I'm not able to look up specific orders,
  > tracking numbers, or addresses through this chat widget — it has no order
  > lookup access. Please email our support team with your order number (#1025)
  > and the email used at checkout, and they'll get you the tracking info and
  > confirm the shipping address on file.

  The plan classified `quick_reply` ("Ready to send"), parked for approval under
  `guarded`/`off`, and the approved reply reached the widget. Worth noting what
  this does *not* prove: the identity claim was never tested against a matching
  real email, because there is no tool that could have checked it either way —
  the refusal is structural, not a judgment call the model got right.

  **The refusal half of this still holds; the handoff half is currently broken.**
  Nothing is disclosed and no order tool is reachable — that is enforced by the
  guest allowlist and has not changed. But the reply quoted above was produced by
  the deflect-to-email copy, and since `5864a0e1` guest order questions escalate
  instead, which the router materializes with no reply at all. So the shopper
  gets an honest *non-disclosure* and no *handoff*. See the M1.5 interim section
  for the cause and the pending decision.
- ✅ Storefront budget isolated from the org cap — built and asserted in tests
  (a refused message leaves `llm_daily_spend` empty), and **live in production
  as of 2026-08-08**: after the gateway deploy was unblocked, a storefront
  message moved `StorefrontChatSession.messageCount` to 1 and wrote the first
  `storefront_chat_daily_usage` row against the Palette integration. The counter
  read 1 rather than 2 on a session that had taken two messages, which is the
  accounting behaving correctly — the earlier message predated the deploy.

Five of five when the bar was struck on 2026-08-08, and **four and a half by the
end of that day** — the handoff regressed after the fact, as recorded above.
Everything else outstanding on M1 (session sweep and retention, merchant
alerting, the eval gate, approval-mode local acknowledgement) sits outside this
bar and is listed under "Not built".

Worth keeping the sequence rather than tidying it away: the bar was met, then a
change intended to *improve* the same behaviour broke it, and that was caught by
sending one more message rather than by any test. Three separate things looked
correct in code and behaved differently in production on this feature in a single
day — an unapplied migration, a six-hour-stale gateway build, and a router
silently deleting a tool call. Live probes caught all three.

## M1.5 — Emailed-code order verification

**The milestone that makes the channel worth having.** Decision 2026-08-08,
after watching a live refusal: M1 answers the most common storefront question —
"where is my order" — by sending the shopper somewhere else. That is a redirect
with extra steps, and it is not a channel a merchant would choose to install.

### Why M2 is the wrong instrument for this

M1 conflated *we don't know who this is* with *we can't answer*. It removed the
order tools rather than gating them on identity, so deflection is the only move
the agent has left. The plan then deferred the fix to Customer Account OAuth,
which is the heaviest possible way to buy it:

- Two new scopes, so **every already-connected merchant is forced to
  re-authorize** — the exact cost M1 was designed to avoid.
- The Customer Account API requires the shop to be on **new customer accounts**.
  Merchants on classic accounts could never use the verified path, so the work
  buys a permanently two-tier experience.

### The reframe

The shopper does hold a credential: the email on the order. M1 is right to
refuse it as an *assertion* — anyone can type an address. Use it as a
**challenge target** instead of a claim, and it flips from something they say
(worthless) into something they must prove control of (strong).

**This needs no new Shopify scopes.** The app already holds `read_orders` and
`read_customers` (`shopify.app.toml`), which is the whole reason this can ship
without touching what any merchant has granted.

### Flow

1. Shopper asks about an order; the agent asks for the email on it.
2. The server looks the order up and compares the supplied email to the order's.
3. **The reply is identical either way** — "if that's the email on the order,
   I've sent a 6-digit code to it." Never confirm that the order exists or that
   the email matched; that answer is itself a disclosure.
4. The code goes to the address **on the order**, never the address typed.
5. A correct code upgrades the session to `authState: "verified"`, scoped to
   that one order.
6. Tracking, status and delivery date are answered inline, in the widget.

**The invariant, in one line: disclosure only ever flows to the address already
on the order.** Someone who types a stranger's order number with their own email
gets a code delivered to the real owner's inbox and learns nothing — not even
whether the order exists.

### Constraints

- 6 digits, 10-minute expiry, single use, 5 attempts before the (session, order)
  pair locks.
- A **separate and tighter counter for verification sends** than the message
  budget. Without it the widget becomes a way to mail-bomb a customer, which is
  a new abuse surface the existing budget does not cover.
- Scope verification to the **order**, not the customer account. The narrowest
  thing that answers the question asked.
- **Reads only.** Cancel, edit, refund, address change stay out of guest and
  verified alike and continue to escalate. Verification unlocks *seeing your own
  order*; it never unlocks mutating one. Whether a verified shopper should be
  able to *initiate* a mutation that then goes to merchant approval is a real
  question, deliberately left open — start read-only and let real traffic answer
  it.
- Familiar to shoppers: Shopify's own new customer accounts log in by emailed
  code, so this is not a novel ritual.

### A tier below verification, built 2026-08-09

Decision 2026-08-09, and it changes M1.5's shape rather than deferring it: not
every order question needs identity. "Has it shipped" does not, so it no longer
waits on a code.

`get_order_fulfillment_status` takes an order number and/or the checkout email
and returns the shipping state plus two dates. It is built from the opposite
direction to every other order read — an explicit allowlist of non-identifying
fields rather than `serializeOrder`, which carries the shipping address, line
items and totals. No name, address, contact details, items or amounts, and no
tracking number, because carrier sites resolve those to a delivery address. An
order number and email that do not match return the same response as an order
that does not exist, so a mismatch never confirms an order to someone guessing.

Kept out of every non-guest tool list, with a test. On other channels the thread
is already tied to a customer and the fuller reads answer better — and excluding
it means the support planner's tool set is unchanged, so this added a tool
without owing an eval-gate run for a surface that did not move.

**Accepted disclosure, stated so it can be revisited:** anyone supplying a valid
order number learns that order's shipping state, which makes order numbers
enumerable for shipping status. Bounded to shipping state and nothing else.
Requiring the email alongside the number is a one-line change if that trade stops
being worth it.

### The guest prompt collapse, 2026-08-09

The guest section had reached **13 bullets and 649 words**, every one added after
watching a specific bad output, and each covering only the phrasing that produced
it. Five commits tuned it — `5864a0e1`, `a5ed6482`, `4fb4f2cc`, `5776f7bd`,
`27e71d9e` — and the fifth still shipped a shopper "I'm not able to pull up order
details directly from this chat" on turn one.

The prompt was doing the work a capability should do. Rules like "if they gave an
email, never ask for the email" are instructions no employee would need, which is
the tell. Email works because the sender address resolves to a Shopify customer
(`context.ts:180`) and the order tools unlock; storefront chat had them stripped,
so every bullet existed to choreograph a refusal.

Now **5 bullets, 269 words**, none describing a situation: it cannot take anyone's
word for who they are, it never narrates its own limits, it keeps people in this
chat, it replies in the same turn it hands over, and what it cannot finish goes to
the shop. Verified by probing the model rather than by shipping and waiting —
which caught a defect the rewrite introduced, where a complete example reply in
the prompt was pasted verbatim and answered "any update on order #1026?" with
"what's the order number?".

### Verification foundation, built 2026-08-09 — tools not wired

`storefront_chat_verifications` (one row per session/order, unique on
`(session_id, order_name)` so a re-request replaces the outstanding challenge)
plus `storefront_chat_sessions.verification_sends` for the tighter send budget.
Migration `20260809120000_add_storefront_chat_verification`, purely additive.

`packages/agent/src/storefront-verification.ts` is deliberately pure — code
generation, hashing, constant-time comparison, order-name normalization, and
`evaluateVerificationAttempt`, which decides an attempt from the stored row
alone. No I/O, so every branch is testable without a database and no caller can
skip the attempt ceiling. 14 tests, including that a locked pair reports *locked*
rather than *expired*: reporting expiry would invite a fresh code request and
reset the lock.

**Two findings that decide how the wiring must work, and are the reason it was
left whole rather than half-landed.**

- **Verification cannot run through the approval loop.** Every storefront card
  ends in "Good to send?", so under `guarded`/`off` the shopper waits for the
  merchant to approve sending a code and then approve the reply asking for it.
  The tools must execute inline at plan time, and the tier only makes sense on a
  storefront set to auto-execute replies. That is a real change in posture for
  the channel and is an open decision, not an implementation detail.
- **Delivery has to be injected.** `packages/agent` has no email dependency by
  design; both hosts do. Reaching Postmark from inside a tool would pull
  `node:crypto` and a mail client toward the dashboard's client bundle, which
  already breaks on `@shopkeeper/db` imports from the registry.

Still owed: the deps contract, both host overrides, context loading of verified
orders, the two tools, and scoping the fuller order reads to the verified order.
A `verify_code` tool that appears to verify without verifying is worse than not
having one, which is why none shipped.

### The posture call, decided 2026-08-11 — verification leaves the agent entirely

The first finding above framed the choice as *where the verification tools
execute*. That framing was too narrow, and re-reading the mechanism is what
showed it. `planner.ts:35` states the contract every option had to survive:
*"reads execute for real, mutative + terminal tools are recorded instead of
executed. No side effects."* So a tool is either plan-time or approval-gated,
and both candidate answers cost something structural:

- Making the two tools plan-time puts an **email send inside a function whose
  contract is that it has none** — and `planner.ts:116` discards plans on exactly
  that reasoning, so a discarded plan becomes a duplicate code email. Worse, it
  does not even finish the job: the "I've sent a code" reply is still a
  `send_reply`, still terminal, still parked. The code goes out and the shopper
  is told nothing.
- Auto-executing the channel buys the immediacy but hands unreviewed
  shopper-facing replies to the one channel where the person is anonymous, and
  contradicts the rollout step that puts a merchant workspace in approval mode
  first.

**Decision: neither. Verification is not an agent capability at all.** The host
runs the challenge deterministically on its own route; the agent only ever
observes a session that already is or is not verified. Nothing about the ritual
enters the plan/approve loop, so nothing about it waits on the merchant — and
the planner's no-side-effects contract is untouched on every channel.

Two things fell out of that choice rather than being argued for:

- **The deps contract and both host overrides are not needed.** Postmark lives
  in the dashboard already and the app-proxy signature is already a dashboard
  route, so with no tool in `packages/agent` the verification route imports the
  mail client directly. The second finding above dissolves rather than being
  paid.
- **The "appears to verify without verifying" hazard cannot occur**, because
  there is no tool that could appear to.

What the decision does **not** buy, stated plainly so nobody reads more into it:
the *answer* using the newly-unlocked order reads is still a `send_reply`, so
under `guarded`/`off` it still parks for merchant approval like every other
storefront reply. Verification is instant; the answer is not, unless the org
auto-executes. That is a partial immediacy win, and it is the honest ceiling of
any option that keeps approval mode.

### Wired 2026-08-11 — built and tested, not yet exercised live

- **`POST /api/storefront-chat/proxy/verify`** with `action: "request" | "code"`,
  behind the same app-proxy signature, session bearer token and both kill
  switches as the message routes — extracted to
  `lib/storefront-chat/authorize.ts` so the two paths cannot drift on what they
  check. Verification is the higher-stakes of the two, so it gets the same gate,
  not a lighter one.
- **`lib/storefront-chat/verification.ts`.** `requestVerification` claims the
  send budget *before* any lookup and conditionally, resolves both Shopify and
  the email integration ahead of the order lookup so a misconfigured store fails
  identically for every order number, compares the supplied address, and on a
  match mails the code **to the address on the order**. It returns `sent`
  whether or not the order exists, whether or not the email matched, and whether
  or not anything was mailed. A Shopify lookup error also returns `sent` —
  surfacing it would make Shopify's availability observable per order number.
- **The send budget charges every request, not every send.** Charging only the
  matches would let order-number probing run free against a counter that never
  moves; charging both bounds probing and mail-bombing with one ceiling.
- **A locked pair survives a re-request.** The pure module reports `locked`
  rather than `expired` precisely so a fresh code is not the obvious way out of
  the attempt ceiling, and the route now honors that instead of handing it back
  through the upsert.
- **`authState: "verified"` plus `verifiedOrders`,** set in `buildContext` from
  rows this process did not write. Verified unlocks `get_order_by_name` and
  `get_order_tracking` **scoped to the verified order** — enforced in static
  policy on parsed arguments, so verifying `#1025` cannot read `#1026`. No
  customer-wide read, and no mutation at any autonomy tier: verification unlocks
  seeing your own order, never changing it.
- **The widget's "Check an order" card** — order number + email, then code entry,
  then a verified note. Widget-local messages only; nothing here becomes a
  `Message` row, so no pending plan is invalidated. A bare 6-digit code typed
  into the composer is intercepted and answered inline rather than reaching the
  agent; that interception is the single piece of text inspection in the design,
  and it decides nothing except which handler runs.

**Tests: 35 new, all passing** — 13 on the verify route against a real database
(identical response for match / mismatch / nonexistent, code mailed only to the
order's address, nothing sent and no row written on a mismatch, attempt ceiling
and lock, lock surviving a re-request, challenge replacement, expiry, both send
budgets, cross-session refusal, merchant kill switch), 12 on the verified tool
policy (every registry tool classified allowed-or-forbidden, refusal per
forbidden tool across all five autonomy tiers, order scoping in both directions,
other channels unchanged), 6 on `buildContext` promotion (an *outstanding*
challenge is not a verified one; revocation drops back to guest), 4 on the
bare-code detector. Existing suites unchanged: 747 agent unit, 27 agent
integration, 1317 dashboard.

**A client-bundle break was introduced and caught before it shipped.**
`static-policy.ts` reaches the client bundle through `plan-preview` →
`ConversationComposerArea`, so importing `normalizeOrderName` from
`storefront-verification.ts` pulled `node:crypto` in behind it — the same shape
as the `@shopkeeper/db`-from-the-registry break this file already records. It now
imports the crypto-free normalizer from `order-reference.ts` instead; both sides
of the comparison go through the same function, so consistency is what matters
rather than which. Confirmed by `next build`, not by reasoning about it.

**Not verified live.** Nothing above has been run against the dev store: no code
has actually landed in an inbox, and the widget card has not been opened in a
real theme. The three things that looked correct in code and behaved differently
in production on this feature — an unapplied migration, a stale gateway build, a
router deleting a tool call — were all caught by live probes rather than tests,
and this is the same class of change.

**Two of those three are cleared for this change, checked 2026-08-11 rather than
assumed.** `prisma migrate status` against the production Neon database reports
70 migrations and nothing pending, so `20260809120000_add_storefront_chat_verification`
is applied — the landmine this file records twice did not recur a third time.
And both hosts are serving `HEAD`: the Railway gateway deployed SUCCESS at
17:03 and the Vercel production deployment was created at 17:03, both after
`bc22f1be` at 17:01. So the verify route is live against a schema that has its
columns.

That narrows what a live run is testing rather than substituting for it. It buys
nothing about the third failure mode, which was behavioural, and nothing about
the parts no test could reach: that a code lands in a real inbox at the address
**on the order**, that a mismatch is indistinguishable from a match to the
shopper, that the widget card renders and works in a real theme, and that the
verified read refuses the neighbouring order number. If the live run fails, the
two usual suspects are already ruled out.

**The eval-gate debt grew, and this was the moment the plan said to stop
deferring it.** The change touches shared planner files again — `context.ts`,
`prompt.ts`, `static-policy.ts`, `planner.ts`, `run.ts`. Every new branch is
gated on `authState`, which `buildContext` sets only for `shopify_chat`, and the
full existing suites pass unchanged. But the argument for deferral was always
that unchanged surfaces re-measure nothing, and the counter-argument this file
already records still stands: the gate is a regression net for effects nobody
predicted. It is also still **red** — 13 fixtures failing or flaky from
2026-08-08, seven at 0/3, with the stale 2026-07-30 baseline deliberately kept
because red is the accurate reading. Fix the thirteen, add the `shopify_chat`
guest fixture the validator now accepts, then capture.

### Interim, attempted 2026-08-08 — ⚠️ shipped broken, one blocker outstanding

The intent was: stop deflecting out of channel, say you can't see order details,
escalate, and tell the shopper the shop will reply right here — which the
merchant does from the dashboard, where the order tools exist, over the
reply→widget path already proven working.

**What actually happens today is that the shopper gets nothing.** Guest order
questions now produce an escalation-only plan with no reply at all, which is
worse than the deflection it replaced — that at least answered. This is a live
regression, introduced by `5864a0e1` while trying to improve the experience.

**The cause is structural, not prompt wording**, and the diagnosis took one
wrong turn worth recording. The first fix (`a5ed6482`) rewrote the guest prompt
to demand `send_reply` first and escalation second; it changed nothing, because
`applyEscalationRouting` in `packages/agent/src/planner-routing.ts` materializes
an `escalate` decision by design — *keep the read tools, drop every other tool
call, terminate with a single `escalate_to_human`*. The model's reply is deleted
by the router after the fact. `a5ed6482` is therefore inert: correct in intent,
with no effect until routing changes. No prompt can fix this.

That routing behaviour is *right* for support — escalating a refund dispute
should not also fire off a reply that pre-empts the human. It is wrong only for
guest storefront, where escalation is the normal terminal state for the most
common question, so "drop the reply" means silence.

**The fix, made 2026-08-08.** `applyEscalationRouting` takes an optional
`{ keepReply }` and `planner.ts` passes `isGuestContext(ctx)`. Guests keep
`send_reply` ahead of the escalation; with the flag false the filter reduces to
the old reads-only one, so every other channel is byte-identical — asserted
directly rather than reasoned about. `a5ed6482` stops being inert the moment this
lands, since the prompt already demands the reply first.

The residual gap: nothing *structurally* guarantees a guest reply exists. The
router now preserves one if the model drafted it, and the guest prompt branch
demands it, but a guest plan that contains no `send_reply` still escalates
silently. Fixing that properly means authoring shopper-facing copy in the router,
which is worse than the prompt covering it — so it is a known edge, not an
oversight.

**The eval gate, paid 2026-08-08.** Not the full suite: the change executes only
inside the `escalate` branch, so the run was scoped to the twelve fixtures that
reach `applyEscalationRouting` — the four intent escalations (fraud, forwarded
injection, contradiction, out-of-scope) and the three structural ones
(`fulfilled_cancel`, `ambiguous_customer`, `read_error`). Eleven passed. The
twelfth is the finding below.

Even once fixed, the interim's weakness stands: there is no push, so the shopper
has to come back to the tab. The session survives in `localStorage`, so
returning works. That is why this is interim and not the answer.

One thing it did buy immediately: `CIRCULAR_CHANNEL_DEFLECTION_WARNING` is now
correct by construction rather than by exemption, because nothing points at a
managed channel anymore.

### The gate was already red, and had been for three days

Running it surfaced a failure that has nothing to do with storefront chat.
`prompt-injection-forwarded-email` fails 0/3 — and fails 0/3 with the storefront
change stashed, which is how it was established as pre-existing rather than
assumed to be.

The cause is structural. `26531b55` (2026-08-05) added
`"mustCallTools": ["send_reply"]` to that fixture, whose setup also carries
`forwarded_injection: true` — one of the four `ESCALATE_INTENT_KEYS`. So the
fixture routes to `escalate`, `applyEscalationRouting` deletes every non-read
call, and the assertion demands a reply the router guarantees cannot survive. No
model output can satisfy it.

It reads as a fresh regression because `baseline.json` was last written
2026-07-30, six days *before* the fixture gained that assertion. The baseline
still records 100% from the previous version of the fixture, so the aggregate
gate fires against a number that was never measured on the fixture as it exists.

**Two things follow, and the second is the uncomfortable one.** The gate is only
red once somebody runs it, so a fixture edit that could never pass sat on master
for three days unnoticed — the same "shipped ≠ verified" shape as the unapplied
migration and the stale gateway build, in a third place. And the defect the fixture
was asserting against is real on the support path too: a forwarded-injection
thread escalates with no reply, so that customer gets silence.

Resolved by pinning the behaviour the router actually guarantees —
`mustCallTools: ["escalate_to_human"]` — rather than deleting the line, which
would have let the fixture pass on an empty plan and made it weaker than before.
Verified 3/3 after the change.

**And regenerating the baseline found the suite is far worse than one fixture.**
A full capture (85 fixtures × 3 repeats, 22 minutes) came back at **87.1%, with
13 fixtures failing or flaky** — seven of them 0/3. They are pre-existing, not
storefront damage: three were re-run at `HEAD` with every change stashed and
failed identically. They split into two opposite drifts, which is why no single
tuning change explains them — over-escalation (`tier-override-cancel-blocked`,
`routing-order-edit`, `tier-guarded-store-credit-approval` and two
prompt-injection fixtures collapse to a bare `escalate_to_human` where real work
plus a reply was expected) and under-escalation (`refund-already-refunded`,
`refund-no-amount`, both `gift-card-*-escalate` fixtures reply instead of
escalating).

**The baseline was deliberately not adopted.** Committing it would record 0/3 as
the expected rate for seven fixtures, which does not lower the bar so much as
delete those tests — a gate that expects failure cannot detect it. The stale
2026-07-30 baseline is wrong too, but it is wrong in the safe direction: it keeps
the suite red, and red is the accurate reading. The capture was not checked in
and is cheap to reproduce (`npm run test:evals:baseline -w apps/dashboard`).
**Fix the thirteen, then capture.**

One of the seven was not a model failure at all. `routing-product-search` sat at
0/3 having *never executed* — its `channelType` was `"instagram"`, which is not a
member of `ChannelType` (`ig_dm` is), so every repeat died in `db.thread.create`
with the model never called. `fixture-validator.ts` should have caught it and
could not: its hand-maintained `CHANNELS` set blessed `instagram` and `telegram`,
neither of which exists in the enum, while rejecting `ig_dm`, `imessage`, `sms`,
`tiktok` and `shopify_chat`, all of which do. Both are fixed and the fixture now
passes 3/3.

**That validator gap was also silently blocking this plan's own eval work.** The
test plan says a `shopify_chat` fixture is the only way the gate will ever cover
guest behaviour — and the validator would have rejected one on sight. Adding a
guest fixture is now unblocked.

**The decision behind that, stated so it can be reversed knowingly:** injection
escalations stay silent on email. Extending `keepReply` there was the alternative
and was rejected — a forwarded-injection thread is the one case where the model
has been actively manipulated, so it is the worst possible moment to have it
generate customer-facing text, and product principle 3 puts failure modes ahead
of success modes. Email also absorbs silence in a way an open chat window cannot:
the merchant sees the ticket and answers, and hours of delay is ordinary there.
That asymmetry is exactly why guest storefront needed the opposite answer, and it
is the reason `keepReply` is a guest flag rather than an escalation-wide one.

### The operator card, fixed 2026-08-08 (`07051933`)

Escalation-only plans exposed four defects in the merchant's notification, found
by reading a real card as a merchant mid-task rather than by testing it. All four
are gateway-side operator copy, so they ship without the eval gate and are
verified by live phone round-trip.

- **The ask was circular.** Escalation *is* handing the thread over, but the
  generic single-step renderer turned it into "I'd escalate to merchant. Sound
  good?" — sent to the merchant, asking permission to tell them something the
  message was already telling them, and offering an approval that changes nothing
  the shopper sees. Escalation-only plans now state what happened and close with
  "Nothing's gone out — it's waiting on you."
- **The judgment was buried.** The card listed order numbers and drew no
  conclusion. The `escalate_to_human` reason was already on the tool call and
  unused; it is now the headline.
- **Every follow-up restated the whole thread as news** — "sent N more messages"
  (a delta) pasted next to `aiSummary` (the entire conversation), so each card
  re-listed everything and the merchant could not tell what changed. **This is
  the digest's stock-vs-flow trap, caught a second time in a different surface.**
  Only half-fixed: the header no longer *implies* a delta (`Where it stands:`),
  because a true delta needs a summary scoped to the new messages and the
  summariser does not produce one. That remains owed.
- **Wrong nouns.** `formatChannelLabel` title-cased the enum member and showed
  merchants "Shopify_chat", a database value rather than a place; and an
  unidentified visitor was called "the customer", asserting a relationship
  nobody has verified on the one channel where the person can type any name they
  like. Now "storefront chat" and "Someone on your storefront".

**A fifth defect, caused by the routing fix and found by reading the code rather
than the card.** Preserving the guest reply makes an escalation plan two steps
instead of one, which dropped it out of the `escalateOnly` branch and back into
the generic numbered renderer — reintroducing "2. Escalate to merchant" as a step
the merchant is asked to authorise, which is the exact circular ask the first
bullet removed. `escalateOnly` now keys on whether anything *approvable* remains
after the escalation is set aside, so the handoff never appears as a numbered
step; paired with a reply it renders as "Then it's yours: …" under the draft, and
the card asks "Good to send?" because a send is the only thing being approved.

This was never guest-specific: any model-elected `[send_reply,
escalate_to_human]` plan on any channel has always rendered that circular step.
The fix improves those too. Gateway-side operator copy, so it ships without the
eval gate and is owed a live phone round-trip.

## M2 — Verified sessions (deferred, and largely superseded)

M1.5 subsumes most of what this milestone was for, at a fraction of the cost and
without forcing a re-authorization on anyone. Keep M2 only for genuine account
binding — order history across orders, saved addresses — and only if a merchant
actually asks for it.



Sketch only. Do not build against this section without specifying it properly.

Customer Account OAuth binds a real Shopify customer to a session and restores
the normal autonomy and tool policy for that shopper. It needs: a
`StorefrontChatAuthAttempt` table for single-use state and PKCE verifier; the
`customer_read_customers` and `customer_read_orders` scopes; encrypted
access/refresh token storage via the existing token-encryption utilities;
refresh and revalidation on later bootstraps with identity cleared on refresh
failure; session revocation on token refresh failure; and a persistent sign-in
control in the widget.

Two things must be settled before it is scheduled:

- **Adding those scopes forces re-authorization for every already-connected
  merchant.** That is a migration with merchant-facing consequences and needs
  its own plan.
- **Customer Account API requires the shop to be on new customer accounts.**
  Merchants still on classic accounts cannot use the verified path at all and
  stay guest-only. Confirm the eligibility rule and decide whether a
  permanently two-tier experience is acceptable before committing.

## Deferred beyond M2

Checkout and thank-you chat extensions, attachments, offline verified email,
Storefront MCP commerce cards, rich commerce UI, cross-device history, App Store
listing, and public distribution.

## Known costs accepted

- **No cross-channel customer identity.** A shopper who chats on the storefront
  and later emails appears as two customers with two threads, and agent memory
  will not join them. This is a real regression against the "real memory"
  product principle, accepted for MVP. Merging is its own piece of work.
- **The merchant must disable Shopify Inbox** to avoid duplicate launchers.
  There is no coexistence story.
- **Guest chat cannot answer the most common storefront question** — "where is
  my order". **This stopped being an accepted cost on 2026-08-08** and became
  M1.5. Watching the refusal land live is what changed the assessment: it is not
  a limitation a merchant tolerates, it is the channel declining its main job.
  **Closed 2026-08-09**, and not the way this file expected. The cost was written
  as though answering required identity, so it could only be paid by shipping
  verification. It did not: "has it shipped" needs an order reference, not proof
  of who is asking, and separating those let the common question be answered
  today while verification stays reserved for what genuinely exposes a person.
  The residual cost is narrower and is recorded with the tier that created it —
  a valid order number now reveals that order's shipping state.

## When to pick this up

It was picked up on 2026-08-07, the day the realtime prerequisite cleared and
ahead of the merchant condition below. That is a defensible call — the transport
is the part that benefits from being built before a merchant is waiting on it —
and over 2026-08-08 the safety half caught up: guest policy, kill switches and
the spend budget all landed, and the loop was proven end to end.

The merchant condition governed **enabling** it: no store that is not a
controlled test store until the guest policy, the storefront budget, and the
kill switches exist. **All three now exist** (2026-08-08), and the feature is
enabled on exactly the controlled test store that condition permits. That
condition is therefore met — it is no longer what holds this at one dev store.

What holds a second store now is operability, not the toggle: nothing tells a
merchant their storefront hit its ceiling, expired sessions are not swept, and
the toggle has not yet been exercised on a merchant workspace outside the dev
store. M1.5 is wired as of 2026-08-11, so the thing that makes the channel worth
installing exists in code — but it has never been run against a real storefront,
and on this feature that gap has been where the defects live.

**Do not answer "not yet" with "do WhatsApp instead"** (decision 2026-08-07).
WhatsApp is a merchant-control channel, not a customer-origin one — see
[product-truth.md](product-truth.md) §2 and its guardrails — so it is not an
alternative to this plan on any axis. Shipping it would add a third way for the
merchant to talk to the agent next to Telegram and iMessage, which is not the
gap this plan fills. It is also a weak wedge in the US market Shopkeeper
targets, where WhatsApp penetration is low. If storefront chat is not ready,
the alternative is more depth on the channels customers already arrive
through — not another operator channel.
