# Shopkeeper To-Do List

Open work only. Completed work is deleted, not archived — git history is the
record. Do not add "recently completed" sections to this file.

Last reviewed: 2026-08-19.

Single source of truth for **actionable** open work. Evidence checklists, console
residue, failure-drill procedures, and standing policies live in the linked docs
below — not duplicated here.

Work is grouped by **what kind of action** it needs, not by when it was filed.

All three deploy surfaces were current as of `88ec0be6` — Vercel Ready
(2026-08-19), the database migrated (six partial unique indexes verified at
6/6), and the Shopify app released as `shopkeeper-production-26` (2026-08-18),
which shipped the theme extension and the `compliance_topics` declarations.
`origin/master` has since moved to `08c1c283`; both commits are a gateway script
and docs, so no app surface changed. The next thing to land does change them —
see Build. When any of them falls behind again, that outranks everything in this
file: all three fail silently. Railway is not in that trio and probably should
be — it fails just as quietly; it answers `/health`, but `/health` is
liveness-only and cannot report a deployed commit, so "Railway is current" is
never something you can read off it. What you *can* read is the deploy list: the
most recent is `61abe989`, SUCCESS at 2026-08-18 21:49 PT. A change landing in
`packages/db` or `packages/agent` needs both app surfaces before either app's
behavior is what the code says — PR #42 was such a change.

**The Anthropic account is out of credits (2026-08-19).** Calls come back `400
invalid_request_error`, "credit balance is too low". No eval gate can run until
it is topped up, which is a hard blocker on anything owing one — see Eval-gate
residue. Nothing is billed while it is empty, so a blocked run is safe, just
useless. The way it was found is **fixed as of 2026-08-19** and worth recording:
a bare `npm run test:integration` in either app used to run that app's paid eval
suite, and so did `verify:pr` by way of `test:coverage`. Neither config excludes
the evals (dashboard's `src/**/*.test.tsx?` picks up `src/lib/agent/__evals__/`,
gateway's `src/**/*.test.ts` picks up `order-ops.eval.test.ts`; the
`src/**/__evals__/**` entry in `vitest.config.ts` is a *coverage-report*
exclusion, not a run exclusion), and `scripts/with-test-env.mjs` resolves a real
`ANTHROPIC_API_KEY` out of `apps/dashboard/.env.local` / `apps/gateway/.env` even
when the shell has none — verified, not assumed. The paid files now skip unless
`EVAL_RUN=1` (every `test:evals*` script) or `REQUIRE_MODEL_EVALS=1` (the eval
workflows) is set; see `__evals__/selection.ts:evalsEnabled`. Fixture validation
still runs on every integration pass, and the gateway's free deterministic
pre-filter is deliberately ungated. This also took `regenerate-baseline` from
four paid suites to three — its verify step runs `test:integration`.

**Guiding principle for pending integrations.** Shopkeeper is still in active
development — channels and features are being added, not finalized. Pending
integrations (Instagram DM, TikTok, WhatsApp) are work to *finish and build*,
not removal candidates. Frame their tasks as "build/finish," and treat
onboarding sequencing as ordering channels behind the v1 wedge — never as
dropping or de-advertising a channel.

Not a removal candidate is not the same as next in line. WhatsApp is
deprioritized as of 2026-08-07 — it is a merchant-control channel, so it adds a
third route alongside Telegram and iMessage rather than new customer reach, and
US penetration is low in the target market. Do not propose it as the next
channel to build. See [product-truth.md](product-truth.md) §2.

---


## Prove in prod

Shipped code that needs a production canary, observation window, or configured
provider. **None of these is a code task.**

- [ ] **Storefront chat dev-store browser matrix.** Run Online Store 2.0 and a
  vintage theme on desktop and mobile, with the embed on and off and the Shopify
  Inbox bubble present and removed. The automated remainder is covered: real
  first-message races and thread rollover, 4,000-character truncation, uninstall
  revocation, and reply/approval/auto-execution dispatch persistence. Evidence
  and the full matrix:
  [storefront-chat-verification-2026-08.md](production/storefront-chat-verification-2026-08.md).
- [ ] **The storefront-chat episode loop, end to end on the dev store.** Item F of
  the conversation-episodes plan. Its eval half is **done** — the gate run that
  item owed was satisfied by the 2026-08-17 full recapture, which came after A, B
  and C had all landed and folded in safe-reply auto-execution. The live run
  happened 2026-08-19 and **the episode machinery passed on every point**:
  rollover on ten days of genuinely elapsed idle time, `episode_rollover` with the
  cached plan cleared, session episode ended and rebound, and item E's divider
  confirmed with both controls. One gap remains before this can close — agent text
  actually reaching the shopper was never demonstrated, because no plan in that
  episode contained `send_reply` at all. That is the same root as the escalation
  defects below, whose fixes are now written and waiting to land; once they are
  merged and deployed, re-run a single answerable question. Evidence: "The episode
  loop live, 2026-08-19" in
  [storefront-chat-verification-2026-08.md](production/storefront-chat-verification-2026-08.md).
- [ ] **One real merchant workspace on storefront chat, in approval mode.** Toggle
  on through the integration card, theme embed activated, Shopify Inbox bubble
  removed, then the full loop verified with no ops touching metadata. Never
  exercised outside the dev store the author controls. The condition that held
  this — notification shape plus the operability items — was met 2026-08-13, so
  what remains is the rollout itself. The stale-widget blocker is gone — the
  extension shipped in `shopkeeper-production-26` on 2026-08-18.
- [ ] **Guest escalation that keeps its reply, exercised live.** The regression
  where guest order questions escalated with no reply at all was fixed by passing
  `keepReply` into `applyEscalationRouting` — but **the router-materialized path
  has still never fired in a live test**. The one live card that showed a reply and
  a handoff together came through a *model-elected* escalation, which was the path
  that already worked. The 2026-08-19 run did not fire it either: the plan routed
  `escalate`, but the model had already called `escalate_to_human`, so the
  `existing` branch preserved the model's tool-use id instead of synthesizing
  `tu_route_escalate`. Firing it needs a case where `routePlan` returns `escalate`
  and the model does **not** elect it — so the message has to be one the model
  believes it can answer. Storefront chat, dev store. Note the pending
  `escalate_to_human` description change makes model-elected escalation reasons
  terser, not rarer, so it does not help produce this case. Background:
  [storefront-chat-verification-2026-08.md](production/storefront-chat-verification-2026-08.md).
- [ ] **Postmark outbound canary.** Send and bounce attribution under real
  traffic. Inbound is proven end to end as of 2026-08-02 (server
  `Shopkeeper-production`, ID 20167846). Account approval, sender setup, and
  smoke steps live in
  [phase-6-external-services.md](phase-6-external-services.md) (Postmark
  section).
- [ ] **Instagram Advanced Access.** Implementation and Standard Access acceptance
  are complete. Launch gated on Meta App Review and a non-role merchant account
  completing the full DM loop (connect → inbound → approve reply →
  disconnect/reconnect). Ops in [runbook.md](production/runbook.md).
- [ ] **What the released Shopify app version actually grants.** No fresh install
  has confirmed the scope set, and no connected production merchant has been
  checked for the re-authorization prompt `write_app_proxy` raises. The
  merchant-facing explanation for that prompt was never written either; connected
  merchants are few enough to tell directly. Scopes have not changed since `-9`,
  so the question is unchanged in substance — but it is now about
  `shopkeeper-production-26` (released 2026-08-18), not `-9`.

---


## Build

Code work that is started and not finished.

- [ ] **Bounded conversation context and cross-channel memory.** Keep persistent
  shopper identity separate from short conversation episodes; plan from the
  newest request and retrieve only verified, relevant history or open
  obligations. P0, P1 and items A–E have shipped; F is the live dev-store run,
  filed under Prove in prod above. Full sequence and the deferred list:
  [conversation-context-and-cross-channel-memory-plan.md](conversation-context-and-cross-channel-memory-plan.md).
- [ ] **Read one day of spend against the 1-hour cache-write pricing fix.**
  Shipped 2026-08-18, PR #36, merge `4fa54da4`, live on both surfaces — Vercel
  Ready and Railway SUCCESS on that commit. `usageToNanoDollars` now prices the
  1h stable block at 2× input and the 5m volatile block at 1.25×, reading the
  per-TTL breakdown the API returns instead of a flat multiplier. Existing
  `llm_daily_spend` rows were not rewritten, so the 2026-08-18 row straddles
  the deploy — everything before it priced at the old flat 1.25×, and that row
  is evidence of nothing. **2026-08-19 UTC is the first clean day**, so read it
  on 2026-08-20 once it has closed. Expect a small correction: ~2.7¢ per cold
  write on Sonnet 5, bounded by the 1-hour TTL and a prefix all 17 orgs share,
  under $0.64/day worst case against a $20 cap whose worst real day was $4.82.
  Operator turns and composer-ask never write a 1h block at all. Delete this
  entry once a full day's rows look sane.
- [ ] **Land the fixes for what the 2026-08-19 storefront run found.** All four
  defects and all three lower-severity copy items are **written and passing, in the
  working tree on `master`, uncommitted** — 17 files, +307/−38. Nothing here is
  code work any more; what remains is landing it and the verification each piece
  owes. Original evidence in
  [storefront-chat-verification-2026-08.md](production/storefront-chat-verification-2026-08.md)
  under "The episode loop live, 2026-08-19".
  1. **Fabricated mutation claim** ("a return has been initiated", nothing planned
     or executed). Fixed by `groundEscalationReasons` in `planner-routing.ts`,
     called from `planner.ts` after routing. It rests on a stronger invariant than
     cross-referencing tool calls: `planAgent` executes nothing, so at plan time a
     past-tense mutation claim describes something that does not exist. Narrow by
     design — drops the reason only when the plan holds no action-category call,
     and never when the claim is attributed to the customer. Owes no gate run (see
     Eval-gate residue).
  2. **Operator deep links 404.** Both emitters now use
     `/dashboard/tickets?thread=`. Five test assertions had encoded the broken
     URL, which is why it survived; those are updated too.
  3. **Prose approval.** Not a missing capability — `approve_pending_plan` exists
     and is always passed. Two bullets in `OPERATOR_CONTROL_TOOL_INSTRUCTIONS`
     contradicted each other, and the "brand-new instruction" reading won. Both
     halves fixed. **Owes a live phone round-trip** — text "go ahead and approve
     the refund" at a real pending plan and watch for `approve_pending_plan`
     instead of an order lookup. Operator prompt changes are never verified by
     evals.
  4. **Escalated shopper left in silence.** The notice was a 20-second client-side
     timer unconnected to whether anything was escalated. `escalatedAt` is now
     reported by `/bootstrap` and `/messages`, and the widget re-derives the notice
     each poll, so it survives a reload and clears itself when the merchant replies.
     **Owes a Shopify app version release** — the widget is a theme extension
     asset, so the server sends `escalated` to a widget that cannot read it until a
     version after `shopkeeper-production-26` ships.

  The three copy items: the `Verified:` line now reads "They confirmed the email on
  #1024." — mechanism kept so the merchant can still judge the disclosure, audit-log
  register dropped. The ticket header renders "Storefront visitor" instead of
  title-casing `shopify_chat:<uuid>` into a name. **The same fact twice was fixed at
  the source and is the one piece that owes an eval gate run**: no presentational
  fix was honest, because word overlap dies on paraphrase (the observed pair shares
  4 of 11 content words) and dropping either line loses specifics in real cases, so
  `escalate_to_human`'s `reason` field description now asks for the blocker rather
  than the customer's story. That is the shared registry. It is blocked on credits,
  and it is the hunk to drop if the gate is not worth running.
- [ ] **Conversation-to-sale attribution.** Connect meaningful storefront-chat
  interactions and product recommendations to later Shopify orders so merchants
  can distinguish direct, product-assisted, and chat-assisted revenue. Report it
  as attribution rather than proof that the conversation caused the purchase.
- [ ] **Expand confidence outside the curated coverage islands.** The audit found
  20 of 76 dashboard API routes without a colocated route test, low coverage in
  several recovery/reconciliation paths, only eight groups in the critical
  coverage ratchet, and PR browser smoke running with authentication bypass. Map
  equivalent indirect tests before adding duplicates, then prioritize tenant
  boundaries, health/realtime tokens, webhook routes, unknown-outcome recovery,
  plan execution, and a targeted real-Clerk contract on auth-sensitive changes.
  Ratchet thresholds from a clean, reproducible coverage run rather than chasing
  a repository-wide percentage.
- [ ] **Split the highest-risk multi-purpose modules along operational seams.**
  Start with `digest-briefing.ts`, `digest.ts`, `reconciliation-probes.ts`,
  `gmail-sync.ts`, `planning-notifications.ts`, and the database package barrel.
  Separate pure selection/rendering/policy code from persistence, provider calls,
  scheduling, and worker/HTTP wiring; use a registry for reconciliation probes.
  Do this after the correctness blockers above, in behavior-preserving slices with
  characterization tests, rather than as one repository-wide rewrite.

### Eval-gate residue

The gate is **green** and the baseline is current — 250/252 across 84 fixtures
at 3 repeats, captured 2026-08-17 (`e9345501`, then `4037a82a`) — and CI can
now re-check it: `ANTHROPIC_API_KEY` became a repo secret 2026-08-18, and the
gate has since run clean on three separate PRs — #38, #40 and #42 — at 44/44
hard-gated core fixtures plus `clear-fraud 1/1` each time, on real model calls.
#42 is the one that matters: a change to the agent loop's budget accounting,
cleared by the gate rather than by assertion. The 2026-08-08 red run is closed:
the thirteen failures are fixed, `storefront-guest-product-search` gives the
gate its storefront coverage, safe-reply auto-execution has had its run, and 79
of 84 fixtures now carry `classifierIntents` — so production's
`computeClassifierRouting` path is exercised, which it never was before. The
1-hour stable-prefix TTL is confirmed as of 2026-08-18: a third thread context
eight minutes after a cold write read back the full 11,848-token prefix and
wrote only the 43-token volatile delta, which a 5-minute block could not have
done.

**The gate cannot run right now — the account is out of credits (2026-08-19, see
the header).** That is the only thing standing between the pending
`escalate_to_human` description change and merge; the code is written and every
free check passes.

- [ ] **Run the gate for the `escalate_to_human` `reason` description**, once
  credits are back. It is a shared-registry change, so it is gated even though the
  reason string itself is not asserted anywhere (below). Nothing else in the
  pending working-tree changes owes a run.
- [ ] **`quick-reply-thanks-ack` passes 1/3.** The only fixture below full. Runs
  classify `needs_review` after repeated `get_order_by_name` errors and escalate.
  Advisory, so it does not gate.
- [ ] **Land agent-path work on a branch and open a PR.** This is the mechanism
  that keeps refilling this section, established 2026-08-19: **31 of 34
  agent-path commits between 2026-08-09 and 08-19 went straight to `master`** —
  `packages/agent` and `apps/dashboard/src/lib/agent` alike — and `evals.yml`
  triggers on `pull_request`, so none were gated. Planner-behavior changes among
  them — `a3132387` (plan from what they just asked), `be0226d1` (end the
  conversation), `264df812` (send the safe replies), `4037a82a` (escalate above
  the workspace cap), `88d56895` (block auto-replies on prefetch failure). Each
  one converts an automatic ~$0.51 core-gate run into a manual item discharged
  later by a ~$2.60 local full-suite run. Across 2026-08-16..19 CI spent $1.53
  and local runs spent ~$20.50; that gap is the backlog, not the gate doing its
  job. The standing rule is now in `.claude/CLAUDE.md` under Agent-change
  invariants. Items here keep coming back until this is the default.

**Escalation reason text has no eval coverage at all** — established 2026-08-19,
and worth knowing in both directions. Zero of the 84 fixtures assert on
`escalate_to_human` inputs (64 mention the tool, none check its `reason`), and
`judge.ts` grades only `replyText`. So a change that rewrites the reason string
while adding and removing no tool call — `groundEscalationReasons` — provably
cannot move an assertion and owes no paid run. The flip side is that the sentence
the operator card calls the most useful line in the notification is ungated, so a
regression in it surfaces only in production.

That reasoning is the general test, not a one-off exemption: **ask whether the
change can move an assertion, not whether it touched a gated path.** The
`evals.yml` `paths` filter is coarse on purpose — it is a net, not a verdict — so
read what the fixtures assert before booking a paid run. The inverse holds too: a
tool *description* edit sits in the prompt the model reads and is gated even
though no assertion names it, which is why the `escalate_to_human` description
item above owes a run and `groundEscalationReasons` did not. Standing rule in
`.claude/CLAUDE.md` under Agent-change invariants.

There is no nightly any more. It had carried `continue-on-error: true`, so it
exited at its own credential check in ~17s and reported success — twelve
consecutive green scheduled runs that ran no evals. The flag went in PR #38 and the cron in
PR #40: a scheduled run only catches regression *without* a code
change, the PR gate catches the rest at the moment it lands, and with no users
the six-day detection lag costs nothing. The full 84-fixture suite and the judge
evals are now a `workflow_dispatch` you fire deliberately — before a rollout
gate, before closing an eval item, after a model bump — not a calendar event.
`package.json` and `package-lock.json` joined the `paths` filter in the same
change, so an SDK bump can no longer sail past the gate.

Runs stay expensive. Follow the
[paid model-eval workflow](production/critical-path-test-checklist.md#paid-model-backed-agent-evals):
single-fixture one-repeat probes for diagnosis, explicit approval before an
unfiltered live-key run, and no automatic tune-then-rerun loop.

---


## Console / config

External consoles, env vars, and provider dashboards. No application code.

**All brand, domain, OAuth branding, Postmark approval, Clerk/Shopify/Meta
display names, Telegram migration, and Gmail restricted-scope packet work:**
[phase-6-external-services.md](phase-6-external-services.md). Delete that file
when its closing verification passes. Re-verify env presence with
`vercel env ls production` — `vercel env pull` redacts sensitive vars to an
empty string, indistinguishable from unset.

- [ ] **Top up Anthropic credits.** Out as of 2026-08-19; details and the
  `test:integration` trap that found it are in the header. Blocks the eval gate,
  and with it the one pending change that owes a run.
- [ ] **Release a Shopify app version carrying the storefront-chat widget change.**
  The escalation notice fix (defect 4 above) edits
  `extensions/shopkeeper-chat/assets/shopkeeper-chat.js`, which shoppers only
  receive through a released version. The server half ships with the dashboard and
  is inert without it. Fold this into the version-recording decision below rather
  than releasing and writing nothing down again.
- [ ] **Confirm the connected store survived the `write_app_proxy` scope add.**
  `shopify.app.toml` shipped 2026-08-07 as `shopkeeper-production-9`, adding
  `write_app_proxy` and the `[app_proxy]` block (M0a and M0b, both closed). Two
  console checks were never done: whether the one connected production store
  shows the new scope as granted or backfilled, and whether it raised a
  re-authorization prompt. Also still owed from M0b — the merchant-facing
  explanation of that prompt, which was supposed to be written *before*
  deploying. Scopes are unchanged since, so the check is still valid against the
  current release.
- [ ] **Record app versions as they ship, or stop treating the reference doc as
  current.** Seventeen versions went out between `-9` and `-26` with nothing
  written down, so the rollback target in
  [production/shopify-app-config-reference.md](production/shopify-app-config-reference.md)
  pointed eighteen versions back for eleven days and nobody noticed. The target
  itself is fixed — verified 2026-08-18, `-25` is the one-step rollback — but the
  drift will recur, because releasing is a CLI call and recording is a manual
  edit. Either make the deploy write its own version note, or delete the version
  bookkeeping from that file and point at `npx shopify app versions list --json`
  as the only source of truth. Do not leave a third copy that goes stale again.
- [ ] **Prove Shopify compliance webhooks.** The HMAC-gated handlers, durable
  data-request workflow, redaction paths and app-level declarations for
  `customers/data_request`, `customers/redact` and `shop/redact` are implemented
  and declared in `shopify.app.toml`. The database half is done — the
  `shopify_privacy_requests` table the handlers write to landed 2026-08-18. What
  remains is the app version, in the Deploy section above; until it ships,
  Shopify has no compliance declarations to deliver against. Once it does,
  exercise Shopify's compliance checks or signed production deliveries. Operator
  fulfillment and completion steps live in
  [production/data-deletion.md](production/data-deletion.md).

---


## Parked / decide

Built or decided-deferred. No active build work unless you explicitly choose to
resume. Gated-off integrations cost nothing to keep dark.

- [ ] **TikTok Shop disposition.** Wired end to end behind
  `TIKTOK_SHOP_ENABLED=false` with tests; never validated in prod. Decision —
  configure and enable, or cut — not more adapter code. If pursued: TikTok Shop
  app approval, seller authorization, multi-merchant SaaS support, prod config.
  Confirm Customer Service API availability for US merchants and third-party
  SaaS in Partner Center. Keep TikTok Shop buyer messages separate from generic
  TikTok DMs (no generic-DM adapter exists).

- [ ] **Storefront chat M2 — Customer Account OAuth.** Largely superseded by
  emailed-code verification, which bought the same disclosure at a fraction of the
  cost and forced no re-authorization. Keep only for genuine account binding —
  order history across orders, saved addresses — and only if a merchant asks. Two
  blockers first: the two `customer_read_*` scopes force re-authorization on every
  already-connected merchant, and the Customer Account API requires the shop to be
  on new customer accounts, so merchants on classic accounts would be permanently
  guest-only. Sketch and open questions in
  [storefront-chat-verification-2026-08.md](production/storefront-chat-verification-2026-08.md).

**Resume when triggered** (not open checkboxes):

| Trigger | Work | Where |
| --- | --- | --- |
| Privacy policy ships | PostHog Phase 5: staging payload review, then `PRODUCT_ANALYTICS_ENABLED=true` | [posthog-reports.md](production/posthog-reports.md) |
| Two-tier billing ships | Create Stripe `PRICE_ID_STARTER` / `PRICE_ID_PRO` and set in Vercel production | [phase-6-external-services.md](phase-6-external-services.md) (Stripe) |
| Redis TLS migration | Gateway `REDIS_URL` → `rediss://` on both services | [compatibility-retirement-backlog.md](compatibility-retirement-backlog.md) |
| Paid beta | Better Stack Level 1 log drains + escalation (free tier done 2026-07-31) | [runbook.md](production/runbook.md), [alerting-evidence.md](production/alerting-evidence.md) |

**Decisions on record** (not tasks): operate "Shopkeeper" unregistered
(2026-08-02); revisit trademark at ~50 paying merchants or before marketing
spend. Sync outbound email remains the rollback rail until async recovery
exercises complete — policy in
[compatibility-retirement-backlog.md](compatibility-retirement-backlog.md), not a
checkbox here. Email stale-claim / manual-retry drills:
[alerting-evidence.md](production/alerting-evidence.md),
[runbook.md](production/runbook.md).

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
