# Shopkeeper To-Do List

Open work only. An entry says **what is left and what would close it** — never how it
got to this state. Completed work is deleted, not archived; git history is the record.
Do not add "recently completed" sections, and do not let an entry grow into an account
of its own fix: the moment an item reads as evidence rather than as an instruction, cut
it back. Evidence checklists, failure drills, and standing procedure live in the linked
docs.

Last reviewed: 2026-08-29.

Work is grouped by **what kind of action it needs**, not by when it was filed.

---

## Deploy surfaces

A behind surface outranks everything else in this file, because every one of them fails
silently. There are four: Vercel, Railway, the production database, and the Shopify app
version. Read the deployed commit off the deployment record itself — Vercel's
`meta.githubCommitSha` via the API, Railway's `meta.commitHash` via
`railway deployment list --json`. Never infer it from a timestamp sitting near a commit,
and never from `/health`, which is liveness-only and cannot report a commit at all.

- [ ] **Restore the production Postmark forwarding integration after a credential
  canary.** Verify the dashboard's configured `POSTMARK_API_KEY` can send from
  `hello@useshopkeeper.com`, then recreate that forwarding integration and make it the
  workspace default. If the canary fails, leave Gmail as the default and reconnect
  Postmark through the dashboard instead of writing a live-looking row that cannot send.

---

## Prove in prod

Shipped code awaiting a production canary, an observation window, or a configured
provider. **None of these is a code task.**

### Storefront chat

- [ ] **One real merchant workspace, in approval mode.** Toggle on through the
  integration card, activate the theme embed, remove the Shopify Inbox bubble, then run
  the full loop with no ops touching metadata. Never exercised outside the dev store the
  author controls. The released app carries the current widget, so a merchant connecting
  now gets it; nothing blocks this.
- [ ] **Dev-store browser matrix.** Online Store 2.0 and a vintage theme, desktop and
  mobile, embed on and off, Shopify Inbox bubble present and removed. The automated
  remainder is already covered. Matrix and evidence:
  [storefront-chat-verification-2026-08.md](production/storefront-chat-verification-2026-08.md).
- [ ] **Fire the router-materialized escalation path once.** Guest escalations that
  arrived with no reply were fixed by passing `keepReply` into `applyEscalationRouting`,
  but that branch has still never run live. Three attempts missed it the same way: the
  model elected `escalate_to_human` itself, so the `existing` branch preserved the
  model's tool-use id instead of synthesizing `tu_route_escalate`. Firing it needs a
  message the model believes it *can* answer, where `routePlan` returns `escalate`
  anyway. Storefront chat, dev store.
- [ ] **Episode boundary, end to end on the dev store.** Widget, dashboard, operator
  notification and reply/approval paths together — the last open box in
  [conversation-context-and-cross-channel-memory-plan.md](conversation-context-and-cross-channel-memory-plan.md).
- [ ] **One live order attributed as `chat_assisted`.** Talk to the widget, verify an
  email, buy something, then confirm the `conversation_attributions` row lands and the
  next briefing reports it. When reading those numbers: attribution covers shoppers who
  verified an email or already exist as a customer record — see the anonymous-shopper
  gap under Parked.

### Operator and agent

- [ ] **Approve a plan in prose, by phone.** Text "go ahead and approve the refund" at a
  real pending plan and watch for `approve_pending_plan` rather than an order lookup.
  Stage the plan with `stage-pending-plan.ts` — the operator channel's own traffic is
  shop-management writes, which never create one, so this does not get exercised as a
  side effect of other phone work. Operator prompt changes are never verified by evals.
- [ ] **Reverse a reprice by phone, off the record rather than the transcript.**
  `list_recent_changes` reads the `AgentAction` audit trail back, so the original prices
  a reprice returned outlive the model's context window, and `set_variant_prices` now
  points at it. Reprice a variant on `palette-dev`, let the turn go cold, then ask for the
  price back: watch for `list_recent_changes` instead of the guessed variant IDs and the
  `search_shopify_products` fallback that prompted this. It does not fix the agent
  repeating a stale refusal — that item is still open below, and this tool is only a place
  for it to check.
- [ ] **Watch the escalation notice clear itself.** Reply as the merchant *in the
  composer* and confirm the widget notice disappears. Approving an agent plan cannot
  discharge it — `recordMerchantReply` is merchant-only by design, which was confirmed
  live when `escalatedAt` survived an approved `send_reply`.
- [ ] **See a grounded `send_reply` in production once.** `groundReplyText` strips
  first-person-singular mutation claims the plan never contained; watch for a shopper
  message that makes the model want to attach one. Known residual gap, left in
  deliberately: a `we`-voiced or passive-voiced fabrication still passes, because
  matching those would mutilate truthful replies read out of `get_order`.

### Channels and providers

- [ ] **Postmark outbound canary.** Send and bounce attribution under real traffic;
  inbound is already proven end to end. Steps in
  [phase-6-external-services.md](phase-6-external-services.md).
- [ ] **Gmail alias send/receive for `support@palettegarments.com`.** The 2026-07-29
  rollout proved native inbound and mailbox receipt, then stopped: a read-only `sendAs`
  check found the address neither present nor verified, so Shopkeeper's `fromEmail` was
  left alone. Needs Gmail administrator access plus an independent external mailbox,
  neither of which the release workspace had. Configure delivery, verify it as a **Send
  mail as** address, and prove inbound and alias sending in Gmail *before* saving the
  alias in Shopkeeper — then send plain-text and HTML-plus-attachment canaries, reply
  from the dashboard alias, and confirm one ticket, attachment persistence, alias sender,
  Gmail threading, one continuing thread, and no duplicate jobs. If alias behavior fails,
  restore Palette's original address immediately; the reliability release can stay
  deployed. Read logs for identifiers only, never content or tokens.
- [ ] **Instagram Advanced Access.** Implementation and Standard Access acceptance are
  done. Launch is gated on Meta App Review plus a non-role merchant account completing
  the full DM loop: connect → inbound → approve reply → disconnect/reconnect. Ops in
  [runbook.md](production/runbook.md).
- [ ] **Read the release grant back from Shopify, not from our own row.** The connected
  production store *is* `palette-dev-3peukw16.myshopify.com` — there is no second store,
  and earlier wording here implied one. `Integration.metadata.oauthScopes` currently
  records 12 scopes for it including `write_products` and `write_app_proxy`, but that is
  our copy of the grant, written at OAuth callback. What has never been done is reading
  the grant back from Shopify's side, because `shopify app execute --store <domain>` could
  not reach it from the release account.
  Read it with
  `{ currentAppInstallation { app { title } accessScopes { handle } } }` and expect the
  Shopify card to read needs-attention until that merchant re-authorizes — the intended
  degradation, not a fault. Derive the rollback target from
  `npx shopify app versions list --json`, never from a doc, per
  [production/shopify-app-config-reference.md](production/shopify-app-config-reference.md).
- [ ] **Write the merchant-facing explanation of the re-authorization prompt.** Owed
  since before `-9`. A scope added by a release is declared, not granted, so an existing
  install keeps working until it silently does not: the tool refuses with
  `missingScopeError` and nothing else in the product says why. Reconnecting from
  Settings is the fix — the OAuth callback replaces `metadata.oauthScopes` wholesale
  (`complete-shopify-oauth.ts:258`) — but a merchant has no way to know that from the
  refusal alone.

---

## Console / config

External consoles, env vars, and provider dashboards. No application code.

Re-verify env presence with `vercel env ls production` — `vercel env pull` redacts
sensitive vars to an empty string, indistinguishable from unset. Brand, domain, OAuth
branding, Postmark approval, Clerk/Shopify/Meta display names, Telegram migration and
the Gmail restricted-scope packet all live in
[phase-6-external-services.md](phase-6-external-services.md); delete that file when its
closing verification passes.

- [ ] **Prove the Shopify compliance webhooks.** Handlers, the durable data-request
  workflow, redaction paths, the `shopify_privacy_requests` table and the
  `compliance_topics` declarations are all shipped and released, so nothing is blocked.
  What remains is exercising Shopify's compliance checks or signed production
  deliveries. Operator fulfillment and completion steps in
  [production/data-deletion.md](production/data-deletion.md).

---

## Parked / decide

Built or decided-deferred. No active build work unless you explicitly choose to resume.
Gated-off integrations cost nothing to keep dark.

- [ ] **TikTok Shop disposition.** Wired end to end behind `TIKTOK_SHOP_ENABLED=false`
  with tests; never validated in prod. The decision is configure-and-enable or cut — not
  more adapter code. If pursued: TikTok Shop app approval, seller authorization,
  multi-merchant SaaS support, prod config. Confirm Customer Service API availability for
  US merchants and third-party SaaS in Partner Center, and keep TikTok Shop buyer
  messages separate from generic TikTok DMs — no generic-DM adapter exists.
- [ ] **Storefront chat M2 — Customer Account OAuth.** Largely superseded by emailed-code
  verification, which bought the same disclosure far cheaper and forced no
  re-authorization. Keep only for genuine account binding — order history across orders,
  saved addresses — and only if a merchant asks. Two blockers first: the two
  `customer_read_*` scopes force re-authorization on every already-connected merchant,
  and the Customer Account API requires the shop to be on new customer accounts, so
  merchants on classic accounts would be permanently guest-only. Sketch in
  [storefront-chat-verification-2026-08.md](production/storefront-chat-verification-2026-08.md).
- [ ] **Attribution for wholly anonymous shoppers.** The real coverage gap in
  conversation-to-sale: a shopper who asks a pre-purchase question and buys without ever
  verifying an email has no server-side identity bridge. Closing it needs cart-attribute
  plumbing in the theme extension — a merchant-facing extension change and a new app
  version. Decide when the attributed share looks low enough to matter.
- [ ] **A two-message email burst still costs two classifier calls** — one inline on the
  first email, one on the settled burst after the follow-up. The characterization suite
  pins this as the remaining lifecycle asymmetry, so it is correct, just not free.
  Closing it means classifying once per request episode; decide when classifier spend
  is worth a restructure of `apps/gateway/src/message-handlers/classification.ts`.
- [ ] **Consolidate the order-read tools, or decide not to.** Deferred with Phase 6 and
  lost when the plan was retired; the condition it waited on has since been met, so it is
  a live decision again. `get_shopify_orders` and `get_order_by_name` genuinely are one
  endpoint — both call `orders.json` through the same `orderFields()` projection
  (`packages/agent/src/shopify/orders.ts:22`, `:47`), differing only in query parameter.
  `get_order_fulfillment_status` is that endpoint under a narrower field allowlist plus an
  email-match guard, so it stays separate for guests. `get_order_tracking` is **not** a
  projection on the order record — it is a different endpoint
  (`orders/{id}/fulfillments.json`) — so folding it in behind an `include` flag would turn
  a call the model visibly did not make into a field it silently omitted. Neither can be
  retired outright: `get_order_by_name` and `get_order_tracking` are the entire
  verified-storefront capability (`guest-policy.ts:60`), so consolidation needs a
  storefront-only exclusion beside `isGuestOnlyTool` (`planner.ts:82`) and the whole
  guest/verified matrix re-proved. If the schema cost justifies that, build
  `get_order { by: 'name' | 'id' | 'customer', value, limit?, fields? }` over `orders.json`
  only, leave `get_order_tracking` as its own tool, and expose `by: 'customer'` to neither
  storefront state. Shared-registry change: it owes the eval gate.
- [ ] **`quick-reply-thanks-ack` passes 1/3.** The only fixture below full, and advisory,
  so it does not gate. Runs classify `needs_review` after repeated `get_order_by_name`
  errors and escalate.
- [ ] **A capability the agent has already denied stays denied in that thread.** Told it
  could not run a storewide sale, it repeated the refusal after `applies_to` shipped and
  deployed, citing its own earlier message rather than the tool schema in front of it.
  Nothing is stale but the conversation — `buildOperatorShopTools` runs every turn — and
  operator threads are one per binding and effectively permanent, so it does not clear
  itself; a fresh request worked. Every capability added from here inherits this, and it
  fails toward telling the merchant no. The decision is what to do about it: a prompt
  bullet is the special case, not the fix.

**Resume when triggered** (not open checkboxes):

| Trigger | Work | Where |
| --- | --- | --- |
| Privacy policy ships | PostHog Phase 5: staging payload review, then `PRODUCT_ANALYTICS_ENABLED=true` | [posthog-reports.md](production/posthog-reports.md) |
| Redis TLS migration | Gateway `REDIS_URL` → `rediss://` on both services | [compatibility-retirement-backlog.md](compatibility-retirement-backlog.md) |
| Paid beta | Better Stack Level 1 log drains + escalation (free tier done 2026-07-31) | [runbook.md](production/runbook.md), [alerting-evidence.md](production/alerting-evidence.md) |
| Merchants report a duplicate "over your plan" notice | Move the once-per-period marker off `Organization.settings`. `buildSettingsUpdate` rebuilds that blob from `normalizeStoredOrgSettings`, a whitelist, so saving any org setting drops the marker. Every available fix costs more than the bug today. | — |
| First customer launch | The canaries the remediation milestones deferred while there was no real traffic to run them against: outcome rows on a live request path (M3), the auto-plan failure-replan path and its prompt tuning (M4), observed preference proposals under `MERCHANT_PREFERENCE_OBSERVED_PROPOSALS=true` and operator-channel confirm/dismiss (M5), and the classifier version-lifecycle ceremony — production inventory by version, retirement procedure, version-upgrade test (M2). | [AGENT_AUDIT.md](../AGENT_AUDIT.md) §2 |

**Decisions on record** (not tasks): operate "Shopkeeper" unregistered (2026-08-02),
revisiting the trademark at ~50 paying merchants or before marketing spend. Sync
outbound email remains the rollback rail until async recovery exercises complete —
policy in
[compatibility-retirement-backlog.md](compatibility-retirement-backlog.md), not a
checkbox here. Email stale-claim and manual-retry drills:
[alerting-evidence.md](production/alerting-evidence.md),
[runbook.md](production/runbook.md).

---

## Standing rules

Not tasks. They are here because breaking one is what refills this file.

**Pending integrations are work to finish, not removal candidates.** Shopkeeper is still
in active development — channels are being added, not finalized. Frame Instagram DM and
TikTok tasks as build/finish, and treat onboarding sequencing as ordering channels behind
the v1 wedge, never as dropping or de-advertising one. Not-a-removal-candidate is not the
same as next-in-line: **WhatsApp is deprioritized** (2026-08-07). It is a merchant-control
channel, so it adds a third route alongside Telegram and iMessage rather than any new
customer reach, and US penetration is low in the target market. Do not propose it as the
next channel to build. [product-truth.md](product-truth.md) §2.

**The eval release gate is manual and CI can run it.** The committed baseline is the
2026-08-17 capture (250/252 across 84 fixtures at 3 repeats) and is **stale**: Milestones
2 through 7 all landed after it. `ANTHROPIC_API_KEY` is a repo secret. Pull requests run only the free deterministic preflight. Before releasing an
agent-path change that can move an assertion, explicitly dispatch `evals.yml` in
`release` mode for the exact release SHA with dollar and model-call ceilings. The trigger
question is **"can this change move an assertion?"** — not "did it touch a gated path."
The `paths` filter is coarse on purpose; it is a net, not a verdict, so read what the
fixtures assert before booking a paid run. A tool *description* edit sits in the prompt
the model reads and requires certification even when no assertion names it. The complete
84-fixture, three-repeat run is a separate `drift` measurement, not the release gate.
Full rules are in [agent-eval-gates.md](agent-eval-gates.md).

**There is no nightly.** The full 84-fixture suite and the judge evals are a
`workflow_dispatch` you fire deliberately — before a rollout gate, before closing an eval
item, after a model bump. Paid eval files skip unless `EVAL_RUN=1` or
`REQUIRE_MODEL_EVALS=1`, so a bare `test:integration` or `verify:pr` no longer bills.
Runs stay expensive: follow the
[paid model-eval workflow](production/critical-path-test-checklist.md#paid-model-backed-agent-evals)
— single-fixture one-repeat probes for diagnosis, explicit approval before an unfiltered
live-key run, no automatic tune-then-rerun loop.

**Evals cannot see the Shopify layer.** Every Shopify tool result in the suite is
simulated, so nothing in `packages/agent/src/shopify/*` has any eval coverage: a tool can
be structurally broken against the live API — as product search was, returning zero rows
for every natural query — while the gate stays green. Evals grade what the model does
with a tool result, not whether the tool can produce one. Live probes are the only cover
that layer has.

---

## Reference docs

- [compatibility-retirement-backlog.md](compatibility-retirement-backlog.md) —
  read before renaming any BullMQ queue or job string.
- [phase-6-external-services.md](phase-6-external-services.md) — console-only
  brand/domain checklist; delete when closing verification passes.
- [production/posthog-reports.md](production/posthog-reports.md) — PostHog report
  definitions and provisioning.
- [production/runbook.md](production/runbook.md) — ops, monitors, channel rollout.
- [production/alerting-evidence.md](production/alerting-evidence.md) — controlled
  alert triggers and verification cheatsheet.

Two closed evidence records were deleted on 2026-08-27 once every live item in them
was carried into this file: the 2026-08-04 pre-release validation run
(`git show cb61ac44:docs/production/pre-release-validation-2026-08-04.md`) and the
2026-07-29 Gmail native-inbound rollout and soak
(`git show cb61ac44:docs/production/gmail-rollout-evidence-2026-07-29.md`).
