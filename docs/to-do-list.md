# Shopkeeper To-Do List

Open work only. Completed work is deleted, not archived — git history is the
record. Do not add "recently completed" sections to this file.

Last reviewed: 2026-08-21.

Single source of truth for **actionable** open work. Evidence checklists, console
residue, failure-drill procedures, and standing policies live in the linked docs
below — not duplicated here.

Work is grouped by **what kind of action** it needs, not by when it was filed.

`origin/master` is `adfec608`, and **three of the four deploy surfaces are
current on it — the Shopify app version is not.** Re-verified 2026-08-21 01:20
UTC, after PRs #48 and #49 merged: Vercel READY on `adfec608` and Railway
SUCCESS on the same commit (01:08 UTC). Both commit hashes were read off the
deployment records themselves — Vercel's `meta.githubCommitSha` via the API,
Railway's `meta.commitHash` via `railway deployment list --json` — not inferred
from a timestamp sitting close to a commit, which is the trap this paragraph
exists to avoid. No migration directory changed between `88ec0be6` — where the
database was last verified at 6/6 partial unique indexes — and `adfec608`;
confirmed by diffing `packages/db/prisma/migrations` across the whole range
rather than assumed. The one migration added since is
`20260821120000_add_conversation_attribution`, which is additive and nullable
and has **not** been applied to production.

**The fourth surface is behind, and this is the case the rule below is about.**
`shopkeeper-production-27` (2026-08-19 22:48) is still the active version —
confirmed against `shopify app versions list`, where it is the only `★ active`
row. But `5ee51baa` changed `extensions/shopkeeper-chat/assets/shopkeeper-chat.js`
and its locale string, and theme app extension assets reach merchants only in a
released app version. So the handoff-notice fix is live on both app surfaces and
in nobody's storefront. It needs a `-28`; releasing one is a merchant-facing
action, so it is listed under Prove in prod rather than done silently. `-26` is
the one-step rollback target from `-27`; derive that from the CLI rather than
from here, per
[production/shopify-app-config-reference.md](production/shopify-app-config-reference.md).

A behind surface outranks everything else in this file, because every one of
them fails silently. Railway belongs in the set rather than beside it — it fails
just as quietly; it answers `/health`, but `/health` is liveness-only and cannot
report a deployed commit, so "Railway is current" is never something you read
off it. What you *can* read is `railway deployment list --json`, which carries
the commit hash per deploy. A change landing in `packages/db` or
`packages/agent` needs both app surfaces before either app's behavior is what
the code says.

**The Anthropic account ran out of credits on 2026-08-19 and is funded again**
— verified the same day by a 1-token probe returning HTTP 200 against the key in
`apps/gateway/.env`. The eval gate is no longer blocked. While the balance was
empty, calls came back `400 invalid_request_error`, "credit balance is too low",
and nothing was billed — so a blocked run was safe, just useless. That is the
cheap way to re-check it if the symptom returns. The way the outage was found is
**fixed as of 2026-08-19** and worth recording:
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

- [ ] **Release `shopkeeper-production-28`.** The behind surface named in the
  header. `5ee51baa` fixed the storefront handoff notice that promised a reply
  which had already arrived, but it is a theme app extension asset, so merchants
  keep reading the old string until a version ships. Nothing else is waiting on
  this release, and no scope changed, so it is a `shopify app deploy` and a
  confirmation that `-28` becomes the `★ active` row. Do it before the merchant
  rollout below, which would otherwise put a real merchant on the stale copy.

- [ ] **Storefront chat dev-store browser matrix.** Run Online Store 2.0 and a
  vintage theme on desktop and mobile, with the embed on and off and the Shopify
  Inbox bubble present and removed. The automated remainder is covered: real
  first-message races and thread rollover, 4,000-character truncation, uninstall
  revocation, and reply/approval/auto-execution dispatch persistence. Evidence
  and the full matrix:
  [storefront-chat-verification-2026-08.md](production/storefront-chat-verification-2026-08.md).
- [ ] **One real merchant workspace on storefront chat, in approval mode.** Toggle
  on through the integration card, theme embed activated, Shopify Inbox bubble
  removed, then the full loop verified with no ops touching metadata. Never
  exercised outside the dev store the author controls. The condition that held
  this — notification shape plus the operability items — was met 2026-08-13, so
  what remains is the rollout itself. The stale-widget blocker is gone — the
  extension is current as of `shopkeeper-production-27` (2026-08-19). The two
  2026-08-20 defects that held this are **both fixed**: product search matches
  again (`32df62bf`, live on both surfaces), and the operator link now opens the
  thread. What is left is a release — the widget copy fix below is a theme app
  extension asset, so it reaches merchants only in the next app version.
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
  terser, not rarer, so it does not help produce this case. **The 2026-08-20 run
  did not fire it either**, for the other reason: its two plans elected
  `escalate_to_human` or contained no escalation at all, so the router never had
  to synthesize anything. The product-search fix (`32df62bf`) should help produce
  the case, since it makes "a message the model believes it can answer" an actual
  category again. Background:
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
  `shopkeeper-production-27` (released 2026-08-19), not `-9`.

---


## Build

Code work that is started and not finished.

- [ ] **Plan limits — built and inert, waiting on Stripe prices.** The gap was
  real: grepping for `conversationLimit`, `conversationsPerMonth`, `seatLimit` and
  `maxSeats` returned zero matches, so a $19 Starter subscriber got unbounded
  conversations and seats. PR #49 (`feat/plan-limits`) closes it, green on every
  check.

  **Volume and seats only.** `c558c788` moved Shopify actions, phone approvals and
  voice training *down* to Starter and said every plan runs the whole product, so
  re-gating them would have reversed a decision made the day before.
  `executor.ts` is untouched and no tool is gated by tier — the per-tier tool
  gating this entry used to ask for was the wrong ask, not deferred work.

  The numbers are recovered from `c558c788` rather than invented: **Starter 500
  conversations/mo and 1 seat, Pro unbounded and 2 seats**. So `Pricing.tsx` and
  the FAQ can carry them again without a second decision.

  **Conversations degrade, seats refuse** (decision 2026-08-20). The cap attaches
  to `precomputeThreadPlan` beside the existing `autoPlanOnOpen` skip, so an
  over-cap org stops getting drafted plans while the message still lands in the
  inbox — a billing cap must never be the reason a customer gets silence.
  Inviting is the opposite case, a deliberate admin action with someone reading
  the response, so it 403s and counts pending invitations. The merchant is told
  once per billing period via `Organization.settings`; the operator-notify dedupe
  is a one-hour Redis TTL and cannot express "once this month".

  **One known limitation, priced and left in.** The once-per-period marker lives
  on `Organization.settings`, and `buildSettingsUpdate` rebuilds that blob from
  `normalizeStoredOrgSettings`, which is a whitelist — so saving any org setting
  drops the marker and the merchant gets one duplicate notice that month. Every
  fix costs more than the bug: a dedicated column means a migration and its
  deploy-ordering landmine, whitelisting the key means an eval run against
  `packages/agent`, and a per-call Redis TTL means threading an argument through
  the notify path every proactive send shares. Revisit only if merchants report
  repeats. Worth knowing separately: **that whitelist silently drops any key it
  does not know**, which is a trap for anything else tempted to stash state there.

  **What is left is the console half, not code.** `PRICE_ID_STARTER` and
  `PRICE_ID_PRO` are unprovisioned, so every org resolves to the unknown tier,
  which is deliberately unbounded — the enforcement ships inert and starts biting
  only once the prices exist. Capping a real workspace on the strength of a
  missing env var would be the opposite of failing safe. To activate: create the
  two Stripe prices, set both vars in Vercel **and** Railway (the gateway reads
  them too), then confirm a Starter org is capped and a Pro org is not. That is
  the same trigger already listed under Parked / decide.

- [ ] **Ground `send_reply` text the way escalation reasons are grounded — written,
  on a PR, waiting on the gate.** The approved reply in the 2026-08-20 run told the
  shopper *"I'm opening a return request for the Hydrogen snowboard on order
  #1024"* with no `create_return` anywhere in the plan. `groundReplyText` in
  `planner-routing.ts` now covers `send_reply.text` and `send_email.body`, called
  from `planner.ts` immediately after `groundEscalationReasons` so it also reaches
  the reply `keepReply` preserves beside a materialized handoff. Same invariant:
  `planAgent` executes nothing, so at plan time a claim that the agent has done, is
  doing, or will do something describes an action that does not exist.

  **It is deliberately narrower than the escalation grounding, and the narrowing is
  the interesting part.** Reusing those patterns verbatim would have been wrong in
  two ways that only show up on shopper-facing prose. Agentless passive is not
  matched, because *"Your refund has been processed"* is the ordinary shape of a
  **true** report read out of `get_order` — the escalation field never carries those,
  a reply carries them constantly. First person plural is not matched either,
  because *"We shipped your order Monday"* reads as the store, not the agent, so it
  can be grounded the same way. What is left is first-person-singular
  self-attribution, past/progressive/promised, which is the fabrication actually
  observed. It edits sentence-by-sentence rather than replacing the field, since a
  reply is usually mostly good; a fallback stands in only when every sentence was
  the fabrication. Residual gap, recorded rather than papered over: a `we`-voiced or
  passive-voiced fabrication still passes. That is the deliberate price of not
  mutilating truthful replies.

  **The gate has run and it is clean.** PR #48, branch `fix/ground-reply-text`,
  with no other agent-path change riding along — the core gate came back
  **hard-gated 44/44 (100%)** in 4m55s
  ([run 32427359636](https://github.com/walledog11/shopkeeper/actions/runs/32427359636)),
  on real model calls with `REQUIRE_MODEL_EVALS=1` and 208s of test execution, so
  this is not one of the fast greens that ran nothing. It genuinely owed the run —
  `judge.ts` grades `replyText`, so a change that rewrites reply text can move
  assertions by construction — and it moved none. Gateway pre-filter and
  clear-fraud gates passed alongside it. Unit coverage is in
  `planner-routing.test.ts` (`groundReplyText`, 11 cases including the two keep-it
  cases above); `packages/agent` is green at 842 tests and `tsc` is clean.

  What is left is the merge, and then the live case: a shopper message that
  produces a reply the model wants to attach a mutation claim to. Delete this
  entry once that has been seen once in production.
- [ ] **Bounded conversation context and cross-channel memory.** Keep persistent
  shopper identity separate from short conversation episodes; plan from the
  newest request and retrieve only verified, relevant history or open
  obligations. P0, P1 and items A–E shipped, and **item F closed 2026-08-20** when
  agent text finally reached the shopper on the dev store — `senderType=agent` at
  `00:30:25.528Z`, rendered in the widget across a reload. Only the plan's deferred
  list remains, and nothing on it is open work:
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
- [ ] **Verify the seven fixes the 2026-08-19 storefront run produced.** The code
  **landed in `35f79a5c` on 2026-08-19** — 17 files, +307/−38 — and is deployed to
  both app surfaces. It went **straight to `master` with no PR**, so the eval gate
  never saw it; that debt is in Eval-gate residue, and has since been settled. Most
  of what remains is the verification each piece owes — **the 2026-08-20 run
  discharged much of it**, and found that one fix (the deep link) is less complete
  than it looked, which is now code work again. Original evidence in
  [storefront-chat-verification-2026-08.md](production/storefront-chat-verification-2026-08.md)
  under "The episode loop live, 2026-08-19"; the follow-up run is under "The reply
  loop closed, 2026-08-20".
  1. **Fabricated mutation claim** ("a return has been initiated", nothing planned
     or executed). Fixed by `groundEscalationReasons` in `planner-routing.ts`,
     called from `planner.ts` after routing. It rests on a stronger invariant than
     cross-referencing tool calls: `planAgent` executes nothing, so at plan time a
     past-tense mutation claim describes something that does not exist. Narrow by
     design — drops the reason only when the plan holds no action-category call,
     and never when the claim is attributed to the customer. **Owes nothing** — no
     gate run (see Eval-gate residue), no live step.
  2. **Operator deep links 404.** Both emitters now use
     `/dashboard/tickets?thread=`. Five test assertions had encoded the broken
     URL, which is why it survived; those are updated too. **Verified 2026-08-20
     that the route resolves — and that it does not open the thread.** The 404 is
     gone, and the reason the merchant still landed on an inbox list was a
     separate dialog-positioning bug, **fixed and verified in-browser 2026-08-20**:
     `needsYouCardShellClassName("shell")` ends in `relative`, which twMerge
     resolved against the dialog's own `fixed`, so the panel rendered in normal
     flow below a body Radix had already locked from scrolling. **Owes nothing.**
     The tests could not have caught it as written — `toBeVisible()` passes on a
     panel below the fold and a bare `toBeInViewport()` passes on one that merely
     overlaps it, so `core-workflow.spec.ts` now asserts `ratio: 1`, which fails
     against the old code and passes against the new.
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
     The widget half **shipped in `shopkeeper-production-27` on 2026-08-19**, so
     both halves are now live. The client/server contract was checked across the
     rename before release — the endpoints select `escalatedAt` and emit boolean
     `escalated` (`bootstrap/route.ts:114`, `messages/route.ts:45`), which is what
     the widget reads — so this is not a no-op. **Two of the three legs are
     verified as of 2026-08-20**, the reload one in a stronger form than it was
     written: the notice came back on a *cold* load ten days after the escalation,
     derived from `escalatedAt = 2026-08-19T04:37:20.682Z` rather than from a timer
     that happened to be running. **Owes only the clearing leg** — reply as the
     merchant and confirm it disappears. Note that approving an agent plan cannot
     discharge it: `recordMerchantReply` is explicitly merchant-only ("the agent's
     own sends must not"), which was confirmed live when `escalatedAt` survived an
     approved `send_reply`. So the clearing leg needs the composer — which
     opens again as of 2026-08-20, so it is no longer blocked.

  The three copy items: the `Verified:` line now reads "They confirmed the email on
  #1024." — mechanism kept so the merchant can still judge the disclosure, audit-log
  register dropped. The ticket header renders "Storefront visitor" instead of
  title-casing `shopify_chat:<uuid>` into a name — **verified live 2026-08-20**.
  **The same fact twice was fixed at the source**: no presentational fix was honest,
  because word overlap dies on paraphrase (the observed pair shares 4 of 11 content
  words) and dropping either line loses specifics in real cases, so
  `escalate_to_human`'s `reason` field description now asks for the blocker rather
  than the customer's story. That is the shared registry and it shipped ungated, so
  it owed a gate run — **which has since been made and came back clean** (run
  32311082225, hard-gated 74/74; no escalation fixture moved). Nothing outstanding.
- [ ] **Conversation-to-sale attribution — schema landed, nothing writes it yet.**
  Connect meaningful storefront-chat interactions and product recommendations to
  later Shopify orders so merchants can distinguish direct, product-assisted, and
  chat-assisted revenue. Report it as attribution rather than proof that the
  conversation caused the purchase.

  **The migration shipped ahead of the writer on purpose** (2026-08-21).
  `conversation_attributions` holds one row per order, `direct` ones included —
  that is not padding, it is the only way to report direct revenue, because
  orders are read live from Shopify and persisted nowhere else, so there is no
  existing total to divide. Three CHECK constraints keep the table honest: `kind`
  and `match_basis` are closed sets, and a `direct` row may not name a thread
  while an attributed row must, so the table cannot express "chat-assisted by
  nothing in particular". Both foreign keys are `SET NULL` so deleting a thread
  or redacting a customer does not retroactively change last month's totals.

  **The identity bridge is the interesting constraint.** Storefront shoppers are
  anonymous — `platformId` is `shopify_chat:<uuid>` — and the session never
  records a Shopify customer id, so there is nothing to join a later order to.
  Verification is the only point where an address is proven, so
  `storefront_chat_sessions.verified_email_hash` was added to capture it.

  **What is left, and one wrinkle found while building it.** The writer, the
  classifier, the hook in `handleShopifyJob`, and a reporting surface are all
  unwritten. The wrinkle: the shopper's email is supplied at
  `requestVerification` and checked against the order there, but verification
  only *succeeds* later in `submitVerificationCode`, which holds the order name
  and session but not the email. Writing the hash at request time would mark a
  session email-verified before the code is confirmed — anyone could claim any
  address. So it needs either a candidate-hash column promoted on success, or a
  Shopify re-fetch of the order at the success point, failing soft so a Shopify
  blip cannot break verification itself.

  **Known coverage limit, worth stating before anyone reads the numbers.** This
  attributes shoppers who verified an email. The larger case — an anonymous
  shopper who asks a pre-purchase question and then buys — has no server-side
  identity bridge at all and would need cart-attribute plumbing in the theme
  extension, which is a merchant-facing extension change and a new app version.
- [ ] **Expand confidence outside the curated coverage islands — routes, ratchet
  and the Clerk contract are done; two gaps remain.** The route half closed on
  2026-08-21. The "20 untested routes" figure was an overcount: sixteen lacked a
  colocated file, but nine of those are exercised where their real risk lives
  (`cross-org-isolation.test.ts`, `tenant-data-surfaces.test.ts`,
  `billing-write-gate.unit.test.ts`), so writing route files for them would have
  been the duplication the original entry warned against. Seven had nothing at
  all and now have 51 tests between them — health, health/deep, realtime/token,
  threads/customer/[customerId], shopify/customers/search, webhooks/tiktok-shop,
  billing. The ratchet went from eight groups to fourteen, every new threshold
  measured against a real coverage run first rather than picked and hoped for.

  **What is left is two specific things, not a general "more coverage".**

  1. **Plan execution cannot be ratcheted yet.** `plan-execution.ts` and
     `plan-cache.ts` aggregate **62.26% lines / 54.76% branches**, well under the
     80/70 bar. It was measured and deliberately left out — admitting it would
     have meant lowering the threshold to fit, which is the opposite of a
     ratchet. Raise the coverage, then add the group.
  2. **Recovery and reconciliation paths** are still thin, and are the one item
     from the original audit that nothing here touched.

  The **real-Clerk browser contract now works**, which is the part that was worse
  than the entry described. It was gated on `vars.CLERK_E2E_ENABLED == 'true'`, a
  repository variable that was never created, while every Clerk secret it needs
  has existed since May — so it reported `skipped` on all **53** dispatches and
  had never executed once. PR browser smoke still runs with `E2E_AUTH_BYPASS=true`
  by design; the contract is the compensating control, and it was not controlling
  anything. The gate now runs unless explicitly disabled, fires on PRs touching
  auth-sensitive paths, and fails loudly on a missing credential instead of
  skipping. First real run found two stale assertions (see below); it passes 9/9.
- [ ] **The inbound email webhook answers 200 for mail it silently discards.**
  Found 2026-08-21 while fixing the Clerk contract, where it masked the real
  cause twice in one sitting. `webhooks-email.ts` claims a message by requiring
  the recipient's **local part to be the organization UUID**: it regex-tests the
  local part, then looks the integration up by `organizationId: localPart`.
  Every miss — non-UUID local part, no matching integration, missing
  `OriginalRecipient` — calls `recordUnclaimedRecipient` and returns
  `200 OK`. Nothing in the response distinguishes "delivered" from "dropped".

  In production that means an inbound misconfiguration looks perfectly healthy
  from the sender's side, which is the same trap already recorded against the
  Postmark rebuild ("a 200 from the inbound hook can mean silently unclaimed").
  The 200 itself is probably correct — Postmark should not retry a message we
  will never claim — so the fix is observability, not status codes: unclaimed
  recipients are already recorded, so surface them as an ops alert when the rate
  is non-trivial rather than leaving them in a table nobody reads.

- [ ] **A malformed `customerId` path param 500s instead of 404ing.**
  `GET /api/threads/customer/<garbage>` reaches Prisma with a non-UUID value and
  throws `Inconsistent column data`, which `handleApiError` turns into a 500. The
  route is authenticated and org-scoped so there is no security consequence — the
  cost is that client-side typos are indistinguishable from server faults in
  Sentry. Noted rather than fixed because the fix is added input validation and
  the standing rule is not to add error handling beyond what a task asks for.

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

**The `escalate_to_human` description change is gated and clean.** It shipped
ungated in `35f79a5c` (straight to `master`), so the debt was settled after the
fact by a `workflow_dispatch mode: full` run on 2026-08-19 —
[run 32311082225](https://github.com/walledog11/shopkeeper/actions/runs/32311082225),
47 minutes, real model calls. Result: **hard-gated 74/74 (100%)**, aggregate
**83/84 (98.8%)** at 1 repeat. No escalation fixture moved, so the description
edit did not change election behaviour. The two `[eval:baseline]` WARNs are both
`quick-reply-thanks-ack` (0/1 against a 33.3% baseline) — the known advisory
fixture below, at 1 repeat against a 3-repeat baseline, which is the documented
way that fixture produces phantom regressions.

**Two agent-path fixes were queued 2026-08-20** and the "can this change move an
assertion?" test split them. Product search shipped (`32df62bf`) — fixtures inject
tool output through `simulateToolResults`, so the harness never executes
`packages/agent/src/shopify/products.ts` and changing the query string it sends
could not reach an assertion; it owed a live check against the real store, and got
one. **Grounding `send_reply` text was gated and came back clean**: `judge.ts`
grades `replyText`, so a change that rewrites reply text can move assertions by
construction. It went onto its own branch with no other agent-path change riding
along, the core gate fired on PR #48 the way the standing rule intends, and it
returned hard-gated 44/44. This is the first item in this section handled that
way from the start rather than settled after the fact, and it is what the rule
below is asking for — the run cost roughly $0.51 and happened automatically,
instead of becoming another line in the backlog to be discharged later by a
~$2.60 local full-suite run.

The planner read-warning reworded on 2026-08-20 owes no run either. It is a
`warnings[]` string assembled after planning in `planner-read-tools.ts`; no fixture
asserts on it and `judge.ts` grades only `replyText`, so it cannot move a result.

**The product-search fix goes to `master` without a PR, deliberately** (decided
2026-08-20, branch `fix/product-search-exact-match`) — the first time that has been
the right call rather than the thing this section exists to complain about.
`evals.yml` lists `packages/agent/**`, so a
PR would have fired a ~$0.48 core gate that provably could not move an assertion,
against a file the harness never executes. The coarse `paths` filter is a net, not
a verdict, and this is the case the "can this change move an assertion?" test is
for. What it owed instead was a live check, and it got one: the shipped code path
run against the dev store returned 5 products for `snowboard` where the old filter
returned 0, 3 for `Collection Snowboard`, exactly 1 for a title containing a colon,
and a clean `not_found` for a nonsense query. Do not read this as licence to skip
the gate generally — the 31-of-34 backlog below is what that looks like.

**That second point is a blind spot, not just an exemption.** Every Shopify tool
result in the suite is simulated, so nothing in `packages/agent/src/shopify/*` has
any eval coverage: a tool can be structurally broken against the live API — as
product search was, returning zero rows for every natural query — while the gate
stays green at 74/74. Evals grade what the model does with a tool result; they say
nothing about whether the tool can produce one. Live probes are the only cover that
layer has.

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
  job. **`35f79a5c` is the newest instance and it is the live one** — it edited
  the shared tool registry, went to `master` with no PR, and is the reason the
  item above is a full-suite dispatch instead of a core gate. The standing rule is
  in `.claude/CLAUDE.md` under Agent-change invariants. Items here keep coming
  back until this is the default.

  **2026-08-20 is the first day the rule was followed without being reminded**,
  and it is worth recording what that looks like, because the backlog above is
  the only other evidence in this file. `groundReplyText` went to
  `fix/ground-reply-text` and PR #48 with nothing else riding along; the core gate
  fired on its own, came back hard-gated 44/44, and cost ~$0.51 at the moment the
  change landed rather than becoming a line here to be discharged later at ~$2.60.
  The same day, `feat/plan-limits` (PR #49) was correctly *not* gated: it is
  gateway, dashboard and `packages/db` only, so `evals.yml` never matched it. Both
  halves of the rule working on the same day — the gate firing where it should and
  staying quiet where it should not — is the state this item is asking for.

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

- [ ] **Provision the two Stripe prices, in both services.** This was a "resume
  when triggered" row until 2026-08-20; the trigger has fired, because the
  enforcement now exists and is waiting on it. Create `PRICE_ID_STARTER` and
  `PRICE_ID_PRO` in Stripe, then set both in **Vercel *and* Railway** — the old
  row said Vercel only, which is no longer sufficient: the gateway reads them to
  tell a Starter subscription from a Pro one when applying the conversation cap,
  and a value set on one service and not the other silently produces two
  different answers about the same org. Until then every org resolves to the
  unbounded unknown tier and no limit applies. Verify by confirming a Starter org
  is capped and a Pro org is not. Stripe steps live in
  [phase-6-external-services.md](phase-6-external-services.md).

- [ ] **Confirm the connected store survived the `write_app_proxy` scope add.**
  `shopify.app.toml` shipped 2026-08-07 as `shopkeeper-production-9`, adding
  `write_app_proxy` and the `[app_proxy]` block (M0a and M0b, both closed). Two
  console checks were never done: whether the one connected production store
  shows the new scope as granted or backfilled, and whether it raised a
  re-authorization prompt. Also still owed from M0b — the merchant-facing
  explanation of that prompt, which was supposed to be written *before*
  deploying. Scopes are unchanged since, so the check is still valid against the
  current release.
- [ ] **Prove Shopify compliance webhooks.** The HMAC-gated handlers, durable
  data-request workflow, redaction paths and app-level declarations for
  `customers/data_request`, `customers/redact` and `shop/redact` are implemented
  and declared in `shopify.app.toml`. The database half is done — the
  `shopify_privacy_requests` table the handlers write to landed 2026-08-18. **The
  app version it was waiting on already shipped** — `shopkeeper-production-26`
  carried the `compliance_topics` declarations on 2026-08-18, so Shopify has
  something to deliver against and this is no longer blocked on a release. What
  remains is exercising Shopify's compliance checks or signed production
  deliveries. Operator fulfillment and completion steps live in
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
