# Shopkeeper To-Do List

Open work only. An entry says **what is left and what would close it** — never how it
got to this state. Completed work is deleted, not archived; git history is the record.
Do not add "recently completed" sections, and do not let an entry grow into an account
of its own fix: the moment an item reads as evidence rather than as an instruction, cut
it back. Evidence checklists, failure drills, and standing procedure live in the linked
docs.

Last reviewed: 2026-08-21.

Work is grouped by **what kind of action it needs**, not by when it was filed. Only the
two items under Ship need code.

---

## Deploy surfaces

A behind surface outranks everything else in this file, because every one of them fails
silently. There are four: Vercel, Railway, the production database, and the Shopify app
version. Read the deployed commit off the deployment record itself — Vercel's
`meta.githubCommitSha` via the API, Railway's `meta.commitHash` via
`railway deployment list --json`. Never infer it from a timestamp sitting near a commit,
and never from `/health`, which is liveness-only and cannot report a commit at all.

- [ ] **Apply two migrations to production.**
  `20260821120000_add_conversation_attribution` and
  `20260821130000_add_verification_candidate_email_hash`. Both are additive and
  nullable, so both are safe to apply ahead of the code that writes them — and that
  ordering is deliberate for this channel: storefront-chat migrations have twice
  shipped *behind* their code, and the second took the channel down on silent `P2022`
  500s. Confirm with `migrate status` against production, not against a local database.

- [ ] **Release `shopkeeper-production-28`.** `-27` (2026-08-19) is still the `★ active`
  version, but `5ee51baa` changed `extensions/shopkeeper-chat/assets/shopkeeper-chat.js`
  and its locale string. Theme app extension assets reach merchants only in a released
  app version, so the handoff-notice fix — the notice promising a reply that had already
  arrived — is live on both app surfaces and in nobody's storefront. No scope changed:
  `shopify app deploy`, then confirm `-28` becomes the active row. Do this before the
  merchant rollout below, which would otherwise put a real merchant on the stale copy.
  `-26` is the one-step rollback target; derive that from the CLI rather than from here,
  per [production/shopify-app-config-reference.md](production/shopify-app-config-reference.md).

---

## Ship

Code work that is started and not finished. **Nothing else in this file needs code.**

- [ ] **Ratchet the recovery and reconciliation paths.** The last open leg of the
  coverage work — routes, plan execution and the real-Clerk browser contract are closed,
  and `scripts/check-critical-coverage.mjs` is at fifteen groups. These four have tests
  but no floor, so their coverage can erode without anything failing:

  - `apps/gateway/src/maintenance/plan-recovery.ts` — re-drafts plans for threads that
    missed one.
  - `apps/gateway/src/maintenance/outbound-send-sweep.ts` — decides whether a stale
    outbound row is retried or marked `unknown`. Same class of decision as
    `operator-event-sweep.ts`, which *is* ratcheted, under "gateway durable operator
    events" — that group is the model to copy.
  - `packages/agent/src/shopify/reconciliation-probes.ts` — determines whether a
    mutation actually landed after an ambiguous provider outcome.
  - `apps/gateway/src/maintenance/integration-disconnect-sweep.ts` and
    `inactive-thread-sweep.ts`, if measurement says they are close to the bar.

  Measure on a real coverage run **first**, then admit each threshold — that order is
  what makes it a ratchet rather than a wish. Write the gaps the measurement exposes
  guard-first, the way plan execution was done: stubs that throw if execution is
  reached, so each case asserts the path was refused *before* a side effect could leave
  the process, rather than merely that an error came back.

- [ ] **Split the highest-risk multi-purpose modules along operational seams.**
  `digest-briefing.ts` (979 lines), `digest.ts` (732), `reconciliation-probes.ts` (692),
  `planning-notifications.ts` (682), `gmail-sync.ts`, and the `packages/db` barrel.
  Separate pure selection/rendering/policy code from persistence, provider calls,
  scheduling, and worker/HTTP wiring; use a registry for reconciliation probes.
  Behavior-preserving slices with characterization tests, not one repository-wide
  rewrite. Do this after the ratchet above — it overlaps on `reconciliation-probes.ts`,
  and characterization tests are cheaper to write against a path that already has a
  measured floor.

### API spend — fixes from the 2026-08-23 billing audit

August 1–22 billed **$51.29**, attributed from Console actuals
(`platform.claude.com/cost`, grouped by API Key and Token Type — no Admin key needed;
the Admin API is unavailable on an individual org and that is **not** a dead end):
local eval runs **$29.03 (57%)**, CI eval gates **$10.47 (20%)**, a prod Gmail
retry loop **$8.17 (16%)**, normal production **$3.62 (7%)**. Doing P0–P3 takes the
month to **~$28.61 (−44%)**. Output tokens are only 19% of spend, so nothing here is
about thinking-token tuning.

- [x] **P0 — stop re-dispatching the failing eval suite.** Seven `workflow_dispatch`
  runs in 41 minutes on 2026-08-23, five failed, ~$2.35 burned, twice on an identical
  head SHA. The failure is a real fixture failure at `__evals__/index.test.ts:143`
  (`expect(summary.passes).toBe(summary.repeats)` — a fixture losing every repeat), not
  a harness bug. Diagnose with `npm run test:evals:fixture -w apps/dashboard -- -t
  "<fixture>"` at **$0.066**, and do not dispatch again until it is green locally. A
  dispatch is 41× the price of the probe that would have found this. **Closed by the
  budgeted gate redesign:** manual runs serialize by ref, exact-SHA passing evidence is
  reused, and a failed release run becomes targeted-diagnosis input rather than an
  automatic full rerun.

- [x] **P1a — make the gateway eval report its tokens.** `apps/gateway/src/order-ops.eval.test.ts`
  prints `[order-ops-eval:gates]` but no usage line, so its **$0.19 per PR run** is
  absent from every cost figure in this repo — including the `~$0.48` comment in
  `evals.yml`, which describes only the dashboard half of a gate that actually costs
  **$0.63**. Inline the three counters rather than importing across apps, same
  precedent as `evalsEnabled()`. **Closed:** gateway evidence now includes actual
  input/output/cache tokens, calls, and estimated dollars under the shared spend meter.

- [x] **P1b — every paid run leaves a ledger line.** Roughly three of four local eval
  runs leave no trace at all, which is what made this bill unattributable for four
  days. Have `scripts/confirm-eval-run.mjs` append `{ts, label, sha, EVAL_SUITE,
  EVAL_REPEATS}` to a gitignored `test-results/eval-ledger.jsonl` on **every**
  invocation — including the `EVAL_CONFIRM=1` bypass and the `CI=true` path, which are
  exactly the two that currently record nothing. **Closed:** accepted local and CI eval
  commands append the SHA, selection, repeats/judges, ceilings, and GitHub run identity
  to `test-results/eval-ledger.jsonl`; CI uploads it even on failure.

- [x] **P2 — cut local full-suite runs (the $29.03).** Full suite only for a baseline
  regen or a pre-merge gate; everything else is `-t "<fixture>"`. Keep the
  `EVAL_CONFIRM=1` escape hatch — it is needed — but make it loud and ledgered via P1b.
  Note honestly that **routing a run to CI saves no tokens**; what CI buys is the
  ledger, the `shopkeeper-ci` key split, and `cancel-in-progress`. Halving full-suite
  equivalents from ~11 to ~5 a month is **~$14.52**. **Closed structurally:** release
  uses the 44 hard core fixtures, complete 84-fixture coverage is an explicit
  three-repeat drift/baseline mode, and every local paid command requires dollar and
  call ceilings.

- [ ] **P3a — repair the broken email integrations.** Prod holds four `email`
  integrations, all `lifecycleStatus: active`: two with `token_expires_at` at the
  `0001-01-01` sentinel and expired (the 296 `Gmail token refresh failed: 400`), one
  with **no refresh token at all** (the 202 `email not configured`), one healthy.
  Because they are `active` they look fine everywhere — the inverse of the
  hidden-when-not-active landmine. Re-run OAuth or mark them `disconnected`.

- [ ] **P3b — never plan a reply that cannot be sent.** The structural fix, and the one
  that stops the whole class: 523 Sonnet turns on Aug 14 and Aug 16 were planned,
  generated, and thrown away at dispatch. Gate `generate-thread-plan.ts` on the
  thread's `replyIntegrationId` being dispatch-capable and escalate instead of planning
  when it is not (`isShopifyIntegrationSweepable` is the existing precedent for the
  shape). Currently dormant — zero failed sends in the last five days — but the broken
  rows are still `active`, so it recurs the moment one of those orgs gets mail.

- [ ] **P4a — apply `resolveModelTuning` at the second call site.** It is applied at
  exactly one: `agent-loop.ts:176`. `planner-model.ts:45` sends neither `thinking` nor
  `output_config` and resolves `pickModel("agent_run")` → Sonnet 5, so every planner
  terminal-tool draft runs adaptive thinking at effort `high` — precisely the inherited
  default `model-tuning.ts` was written to stop. **This is a correctness fix, not a cost
  fix** (output is 19% of the bill); do not sell it as savings. Agent-path: one PR, one
  core gate, $0.63.

- [x] **P4b — refuse duplicate dispatches.** `cancel-in-progress` is deliberately false
  for `workflow_dispatch` and should stay that way (cancelling a baseline mid-capture
  wastes the whole $2.70), but nothing stops an identical re-dispatch — it happened
  twice on 2026-08-23. Refuse a dispatch whose (ref, sha, mode) matches a run in the
  last N minutes. **Closed without cancelling paid work:** workflow-level concurrency
  serializes manual runs for a ref, and the queued run restores exact-SHA passing
  fixture evidence left by the first. It cannot repay for already completed passing
  fixtures; a third pending duplicate is discarded by GitHub concurrency before it
  starts.

- [ ] **P5 — no action, just do not "fix" these.** `packages/db/llm-spend.ts` pins
  Sonnet 5 at $3/$15 while the intro rate is $2/$10 through **2026-08-31**, so every
  `llm_daily_spend` Sonnet figure is exactly 1.5× the billed amount (validated: Aug 12
  $0.0989 predicted vs $0.10 billed; Aug 14 $3.095 vs $3.10). It is deliberately
  conservative so the cap never under-protects, and it becomes exact on Sept 1 —
  correcting it now would weaken the cap. Likewise cache writes are 28% of spend, more
  than output, but the 1h/5m split ($1.99/$12.18) and 1:24 write:read ratio show the
  design working; that line scales with run volume and nothing else.

---

## Prove in prod

Shipped code awaiting a production canary, an observation window, or a configured
provider. **None of these is a code task.**

### Storefront chat

- [ ] **One real merchant workspace, in approval mode.** Toggle on through the
  integration card, activate the theme embed, remove the Shopify Inbox bubble, then run
  the full loop with no ops touching metadata. Never exercised outside the dev store the
  author controls. Waiting only on the `-28` release above.
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
  Operator prompt changes are never verified by evals.
- [ ] **Watch the escalation notice clear itself.** Reply as the merchant *in the
  composer* and confirm the widget notice disappears. Approving an agent plan cannot
  discharge it — `recordMerchantReply` is merchant-only by design, which was confirmed
  live when `escalatedAt` survived an approved `send_reply`.
- [ ] **See a grounded `send_reply` in production once.** `groundReplyText` strips
  first-person-singular mutation claims the plan never contained; watch for a shopper
  message that makes the model want to attach one. Known residual gap, left in
  deliberately: a `we`-voiced or passive-voiced fabrication still passes, because
  matching those would mutilate truthful replies read out of `get_order`.
- [ ] **Read one clean day of LLM spend.** Due now — 2026-08-19 UTC is the first day
  entirely after the 1-hour cache-write pricing fix, and earlier rows straddle the
  deploy and prove nothing. Expect a small correction, bounded under $0.64/day worst
  case against a $20 cap whose worst real day was $4.82. Close this once a full day of
  `llm_daily_spend` rows looks sane.

### Channels and providers

- [ ] **Postmark outbound canary.** Send and bounce attribution under real traffic;
  inbound is already proven end to end. Steps in
  [phase-6-external-services.md](phase-6-external-services.md).
- [ ] **Instagram Advanced Access.** Implementation and Standard Access acceptance are
  done. Launch is gated on Meta App Review plus a non-role merchant account completing
  the full DM loop: connect → inbound → approve reply → disconnect/reconnect. Ops in
  [runbook.md](production/runbook.md).
- [ ] **Confirm what the released Shopify app version actually grants.** One check with
  three parts, none done since `write_app_proxy` and the `[app_proxy]` block shipped in
  `-9`: whether the one connected production store shows the new scope as granted or
  backfilled, whether it raised a re-authorization prompt, and the merchant-facing
  explanation of that prompt, which was owed *before* the deploy and never written.
  Connected merchants are few enough to tell directly. Scopes are unchanged through
  `-27`, so the question is still valid against the current release.

---

## Console / config

External consoles, env vars, and provider dashboards. No application code.

Re-verify env presence with `vercel env ls production` — `vercel env pull` redacts
sensitive vars to an empty string, indistinguishable from unset. Brand, domain, OAuth
branding, Postmark approval, Clerk/Shopify/Meta display names, Telegram migration and
the Gmail restricted-scope packet all live in
[phase-6-external-services.md](phase-6-external-services.md); delete that file when its
closing verification passes.

- [ ] **Provision `PRICE_ID_STARTER` and `PRICE_ID_PRO`, in both services.** This is the
  only thing between the plan limits and actual enforcement. The code shipped inert on
  purpose: with the prices missing every org resolves to the unbounded unknown tier,
  because capping a real workspace on the strength of an absent env var would be the
  opposite of failing safe. Set both in **Vercel *and* Railway** — the gateway reads
  them too, and a value set on one service but not the other silently produces two
  different answers about the same org. The tiers are Starter at 500 conversations/month
  and 1 seat, Pro unbounded and 2 seats. Verify by confirming a Starter org is capped
  and a Pro org is not. Stripe steps in
  [phase-6-external-services.md](phase-6-external-services.md).
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
- [ ] **`quick-reply-thanks-ack` passes 1/3.** The only fixture below full, and advisory,
  so it does not gate. Runs classify `needs_review` after repeated `get_order_by_name`
  errors and escalate.

**Resume when triggered** (not open checkboxes):

| Trigger | Work | Where |
| --- | --- | --- |
| Privacy policy ships | PostHog Phase 5: staging payload review, then `PRODUCT_ANALYTICS_ENABLED=true` | [posthog-reports.md](production/posthog-reports.md) |
| Redis TLS migration | Gateway `REDIS_URL` → `rediss://` on both services | [compatibility-retirement-backlog.md](compatibility-retirement-backlog.md) |
| Paid beta | Better Stack Level 1 log drains + escalation (free tier done 2026-07-31) | [runbook.md](production/runbook.md), [alerting-evidence.md](production/alerting-evidence.md) |
| Merchants report a duplicate "over your plan" notice | Move the once-per-period marker off `Organization.settings`. `buildSettingsUpdate` rebuilds that blob from `normalizeStoredOrgSettings`, a whitelist, so saving any org setting drops the marker. Every available fix costs more than the bug today. | — |

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

**The eval gate is green and CI can re-check it.** Baseline is current — 250/252 across
84 fixtures at 3 repeats, captured 2026-08-17 — and `ANTHROPIC_API_KEY` is a repo secret,
so the PR gate runs on real model calls. Land agent-path work on a branch and open a PR:
`evals.yml` triggers on `pull_request`, so a change pushed straight to `master` converts
an automatic ~$0.51 core-gate run into a manual item discharged later by a ~$2.60 local
full-suite run. The trigger question is **"can this change move an assertion?"** — not
"did it touch a gated path." The `paths` filter is coarse on purpose; it is a net, not a
verdict, so read what the fixtures assert before booking a paid run, and note the inverse
holds too: a tool *description* edit sits in the prompt the model reads and is gated even
when no assertion names it. Full rule and worked examples in `.claude/CLAUDE.md` under
Agent-change invariants.

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
- [production/pre-release-validation-2026-08-04.md](production/pre-release-validation-2026-08-04.md) —
  2026-08-04 production validation evidence.
- [production/gmail-rollout-evidence-2026-07-29.md](production/gmail-rollout-evidence-2026-07-29.md) —
  Gmail native inbound soak (scheduled observation closed 2026-08-07).
- [production/posthog-reports.md](production/posthog-reports.md) — PostHog report
  definitions and provisioning.
- [production/runbook.md](production/runbook.md) — ops, monitors, channel rollout.
- [production/alerting-evidence.md](production/alerting-evidence.md) — controlled
  alert triggers and verification cheatsheet.
