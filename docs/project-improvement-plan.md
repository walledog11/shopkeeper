# Shopkeeper improvement and validation plan

Created: 2026-09-07. Last reconciled: 2026-09-10 (third pass, after the fixes the second pass called pending landed). Status: in progress; A1 and A2 are verified, A4's implementation is landed, B2 is in progress, and Gate 1 remains open. **A3 is the critical path.** On 2026-09-10 a real Instagram DM naming an order produced a mutative plan and that plan reached the merchant's phone as an approval card — which is where the proven part stops. **The plan the merchant approved never ran.** A forensic pass over the production rows that evening found `executionId` null on every action and no `PlanExecution` claim: the parked plan had been discarded before the merchant's reply arrived, `approve_pending_plan` correctly reported nothing to approve, and the model then attempted the refund on its own authority. It was stopped by a Shopify currency guard, not by anything in the approval path. Everything after "the card reaches the phone" is therefore unproven, and the earlier reading of this run — that it executed as `human_approved` — was an artifact of that label being the default for an unstated turn. The three fixes landed as `afc88439` ([PR #89](https://github.com/walledog11/shopkeeper/pull/89)) and are deployed. **One of them did not hold live.** A 2026-09-11 re-run escalated with the same `currency_mismatch` — "requested currency USD does not match Shopify currency CAD". `afc88439` fixed the executor and the order read but not the instruction that produces the input: `create_refund`'s own schema asked for the amount "in the store's currency" and for the "three-letter store currency". Order #1031 is a USD shop with a customer charged 59.90 CAD, so the model did as instructed, sent USD, and the executor — which now correctly settles in the presentment currency — refused it. The guard was right and its input was wrong. A read-only probe against the live store confirmed the shape and that Shopify prices the calculation in CAD either way. The schema now names the currency the customer was charged and the fields the order read returns it in. **What remains for the leg is the re-run itself, which is a live-provider task and not a code one.** The SocialAPI merchant connect has still never run for a live merchant, and is closed by configuration in production.

## Operating stance — beta

Shopkeeper is in beta with no users. The rule that outranks every checklist below: **make it work
before making it certifiable.** Not one real Instagram DM has ever produced a Shopkeeper ticket, and
until that happens every gate, capacity control, alert threshold, and observation window in this
document is apparatus built around a path that does not run.

**The next deliverable is one sentence:** a real Instagram DM arrives, becomes a ticket, the agent
plans a reply, the merchant approves it from their phone, and the customer receives it. Nothing else
in A3 is on the critical path until that has run once, with Shopkeeper-controlled accounts, by the
shortest route that works.

This is not permission to skip safety on money, tenant isolation, or truthful outcomes — those are
the product. It is a bound on ceremony: a gate, an evidence artifact, or a hardening item earns its
place once the thing it guards exists and works, and not before. Harden what actually broke, not
what might.

## Objective

Make the customer-message → Shopify context → merchant approval → verified action/reply workflow reliable, economical, and easy enough that a small Shopify merchant pays to keep using it. Address every weakness identified in the September 7 project review before expanding the product's scope or acquisition spending.

Preserve the direction in [Product Truth](product-truth.md): Instagram is the core social support channel, iMessage is the merchant control surface, Shopify supplies operational context and actions, and the dashboard supports setup, review, and manual fallback. Gmail is a fallback; Telegram remains internal testing infrastructure. SocialAPI is the selected Instagram transport through the first 100 users. Direct Meta integration work is deferred to a future decision and is not a launch, canary, pilot, or first-100-user dependency. Broader operating modules and additional merchant-control channels remain deferred until demand justifies them.

Code defects can be fixed. Demand, differentiation, willingness to pay, and retention must be tested. Completing the engineering checklist alone does not establish a viable business.

## Evidence and scope

The review inspected the working tree, including existing uncommitted agent/channel fixes. It reported 2,366 passing unit tests, including 68 cached tests, 67 passing node-script tests, cached passing typechecks, and a lint failure in the inbox component. The full integration/E2E suite and paid model evaluations were not rerun for that review. The committed August 17 evaluation baseline reported 250/252 passes; it does not certify the current release.

Two weaknesses were reproduced directly: repeated inbox renders with an active ticket and unchanged props, and unsupported-refund wording missed by the reply grounding detector. The visual dashboard audit was incomplete because the local preview encountered a Clerk authentication loop. That is a reproduction/setup problem to investigate, not evidence that production authentication is broken.

External approvals and deployment status below come from repository records and must be checked before acting. The original review found the outbox migration applied while application deployment was outstanding; A2 subsequently released and accepted that work. The current deployment inventory is authoritative for revision identifiers. Preserve completed fixes and avoid rebuilding them.

This document is the implementation and validation plan. Keep immediate open work in [To-do list](to-do-list.md), operational procedures in the [runbook](production/runbook.md), and compatibility retirement in its [existing backlog](compatibility-retirement-backlog.md). Link between them rather than maintaining competing status narratives.

## Priorities, ownership, and order

Owners below are roles. The founder can own several roles; name the actual owner when starting each item. Effort estimates are active working days, are approximate, and exclude provider approval delays. They are not additive staffing commitments.

| ID | Priority | Work | Owner | Rough effort | Dependencies |
| --- | --- | --- | --- | --- | --- |
| A1 | P0 | Stop inbox render loop | Engineering | 0.5–1 day | None |
| A2 | P0 | Reconcile and ship existing reliability fixes | Engineering / release | 1–2 days | A1; current deployment inventory |
| A3 | P0 | Implement and certify SocialAPI for the first 100 users; close other offered-provider gates | Founder / engineering / release | Re-estimate after the controlled spike, plus 7–14 days of canary observation | Start immediately; A2 before external canaries |
| A4 | P0 | Make completion claims follow actual action outcomes | Agent engineering | 3–5 days | A2; coordinate contract with B4 |
| B1 | P0 | Establish sustainable pricing and entitlement rules | Founder / engineering | 2–4 days initially | Cost baseline from D1; refine during D2 |
| B2 | P0 | Enforce service budgets and show usage | Engineering | 3–5 days | B1 definitions |
| B3 | P1 | Add bounded prior-conversation context | Agent engineering | 2–3 days | A4 behavior contract |
| B4 | P1 | Finish structured result propagation | Engineering | 2–4 days | Inventory existing typed results in A2 |
| C1 | P1 | Bound database reads and benchmark performance | Engineering | 2–4 days | A1; A2 |
| C2 | P1 | Complete onboarding, mobile, and approval usability review | Product / engineering | 2–4 days initially | A1; A3 for real-provider acceptance |
| C3 | P1 | Reconcile documentation and reduce maintenance friction | Engineering | 1–2 days initially | Start now; update with each change |
| C4 | P0 | Certify the actual release candidate | Engineering / release | 1–2 days plus fixes | Pilot gates listed below |
| D1 | P0 | Instrument value, cost, interruptions, and reliability | Product / engineering | 2–3 days | Start now; reuse existing analytics |
| D2 | P0 | Run a narrow paid pilot and test acquisition | Founder | 4–6 weeks after readiness | Pilot gates; D1 |

P0 means required for the paid pilot or its evidence. P1 means bounded product/engineering improvement; the pilot gate below distinguishes what must finish before onboarding from what can continue alongside a supervised pilot.

### Status snapshot — 2026-09-10

| ID | State | Current evidence / next dependency |
| --- | --- | --- |
| A1 | `verified` | Inbox regression, browser smoke, and lint passed with the A2 candidate. |
| A2 | `verified` | Released and accepted on `e4cfab72`; subsequent production revision `60b373ef` has passing CI and deployed Railway roles. See the release inventory for the separately evidenced Vercel and Clerk state. |
| A3 | `in_progress` | **The critical path.** The controlled provider-level slice passed — inbound text/image, provider send, participant receipt, endpoint registration, and two real signed `dm.received` deliveries; webhook native `platform_id` matched the inbox row while the interaction `id` did not, and the new image was `ephemeral` with no URL, a blocking media-coverage gap. See the dated spike evidence. **Milestone zero passed live on 2026-09-09** (`351894e8`): a real Instagram DM became thread `f161a9b1`, was classified `Order Status`, and the agent's reply left through SocialAPI with a `sapi_dm_...` provider message id. The native `platform_id` join held live. **Three follow-ons landed the same evening.** `07300a77` retired the environment pin: ingress resolves `data.account_id` through an indexed `Integration.providerAccountId`, unique among non-null rows, and `resolveSocialApiIntegration` takes the organization from the row it finds and throws on a duplicate instead of choosing one. `3797c0dc` closed direct Meta connect to new workspaces behind `INSTAGRAM_INTEGRATION_ENABLED` and `INSTAGRAM_BETA_ORG_IDS`, with an empty allowlist closing production and existing connections carved out of the card gate. `b683650a` is S2's merchant connect: one entry point dispatching on `resolveInstagramConnectTransport`, admission bounded structurally by the `SOCIALAPI_BRAND_ASSIGNMENTS` map under `SOCIALAPI_MAX_ACTIVE_ORGS` rather than a racing count, the vendor's `state` sealed into an attempt cookie keyed by the redirect URI's `attempt`, brand-scoped account readback, and ownership decided on `providerAccountId`. **None of that has run for a live merchant.** The vendor exposes no native Instagram account id, so `externalAccountId` holds the provider's (`externalAccountIdSource: 'provider'`) and Professional-account eligibility is unverified at connect; compensation for a remote account created by a failed attempt is unbuilt. The **approval leg is still unproven** — milestone zero's plan was a single clarifying `send_reply`, which `decideAutonomy` auto-sends via `quick_reply` because `autoExecuteMode` gates only `action`-category calls. That set the next test — a DM whose plan carries a mutative call, so approval routes to the phone — and after it: `dm.sent` correlation, the ephemeral-image classification, recovery, and reconnect. Vendor/data-processing diligence remains mandatory before external merchant data. Direct Meta is deferred and does not gate this phase. **2026-09-10 — the card reaches the phone; nothing past it is proven.** A second DM on thread `f161a9b1` naming order 1031 planned `create_refund` + `add_internal_note` + `send_reply`; because the plan carried an `action`-category call it routed to `needs_review` instead of `quick_reply` and reached the bound iMessage line 34 seconds after the DM. **That is the last verified step.** The merchant replied `Yes` at 09:44:40 and the parked plan was no longer in the queue: `approve_pending_plan` reported nothing to approve, twice, and the model then attempted `create_refund` itself — on the operator thread, with no plan, no approval card, no execution claim and no approver. `create_refund` returned `policy_block` / `currency_mismatch` twice, the agent re-read the order and escalated. The customer received nothing and no completion was claimed, so the A4 invariant did hold under a real failure; but it held over an action nobody had approved, and what stopped the write was a Shopify currency guard rather than the approval path. The DB evidence is `executionId` null on all seven action rows and a single `PlanExecution` dated to the previous night's auto-executed `send_reply`. The earlier entry here read `mode: human_approved` as proof of approval; that label was the default for a turn that stated no mode, which is [PR #89](https://github.com/walledog11/shopkeeper/pull/89)'s third fix. The first attempt at this run was blocked by `ungrounded_customer_reply`, fixed in `0e5bcec0` (PR #88) and confirmed by an A/B on identical message text 39 minutes apart. **PR #89 landed the same evening** as `afc88439` and is deployed on both hosts: a failed approval withdraws the turn's authority to run `action`-category tools instead of leaving it for whatever the model picks next, an unstated turn resolves to `auto_executed` rather than claiming a human approved it, and a dropped parked plan names which of seven conditions dropped it. Its currency fix did **not** hold: the 2026-09-11 re-run hit `currency_mismatch` again, because `create_refund`'s schema still told the model to send the *store's* currency while the executor had moved to the customer's. The schema now names what the customer was charged. **Remaining for the leg is the re-run alone** — one DM end to end, with approval executing the reviewed plan, the refund committing in the customer's presentment currency, and the reply arriving in the participant's Instagram app. That run is also what says why the 09-10 plan was discarded; the leading reading is the thread re-planning at 09:40:50, six seconds after the card went out, orphaning the parked entry. **A separate 2026-09-10 DM found the wedge channel's standing gap:** a non-mutative order-status question also reached the merchant, because `shopify_customer_unresolved` turns blocking on any customer or order read and never lifts on a channel that carries no email — so every order question on Instagram was a merchant interruption, permanently. `310362b9` ([PR #90](https://github.com/walledog11/shopkeeper/pull/90)) admits `get_order_fulfillment_status` — order number in, shipping state out, no disclosure, one identical not-found — to threads with no Shopify customer behind them, in the prompt branch and `QUICK_REPLY_READ_TOOLS` both. Its release gate is **not closed**: see C4. |
| A4 | `in_progress` | Structured completion facts and deterministic sensitive-copy rendering are implemented and landed. A production grounded-reply canary now exists in both directions: on 2026-09-10 a supported refund claim was wrongly rejected as ungrounded (fixed in `0e5bcec0`) and, in the same day's operator turn, a *failed* refund correctly produced no completion claim to the customer (that turn was not in fact an approved plan execution — see A3 — but the invariant held on its own terms). Open: the strict release-run disposition, the schema-carried-completion rework recorded under A4 as structural debt, and the canary's positive half — a mutation that actually commits alongside a reply whose copy its own journal result supports. No agent mutation has committed in production yet; `afc88439`'s currency fix did not unblock one (the 2026-09-11 re-run hit the same block — see A3), and the real fix plus the A3 re-run is what would produce it. |
| B1 | `not_started` | Split 2026-09-09. The analytical half — cost envelope, billable unit, deterministic entitlements — is Gate 1 and needs no Stripe. The commercial half — prices, checkout, plan mapping — is deferred to Gate 2. Both still need owner decisions. |
| B2 | `in_progress` | Price parity is verified. Fail-closed spend reads and a visible daily usage/cap panel shipped in `60b373ef`; durable reservations and service allowances remain open. |
| B3 | `parked` | Depends on the A4 behavior contract; deliberately behind A3. |
| B4 | `parked` | Existing typed-result inventory and remaining prefix-parsing conversion are open; deliberately behind A3. |
| C1 | `in_progress` | The active inbox already uses bounded cursor pages and preview rows, and hidden-tab polling is suspended. Bounded thread-detail history, a bounded latest-customer-message query, query-plan inspection, realtime recovery evidence, and reproducible load measurements remain open. |
| C2 | `parked` | Authenticated desktop/mobile and real-device workflow review is open. Its onboarding bullet depends on the SocialAPI connect flow existing, so it cannot fully close before A3 anyway. |
| C3 | `in_progress` | The launch-gate contradiction is closed: `to-do-list.md` no longer claims Meta App Review gates launch, and the transport plan no longer claims a temporary bridge, a 30-day exit, or direct-Meta-primary. The architecture map, the four-state integration record, and the broader README audit remain open. |
| C4 | `in_progress` | Current CI and Clerk browser contract pass, but the complete merchant candidate cannot be certified before the other Gate 1 dependencies. **One gate is open on code already on `master`.** `310362b9` changes the support planner's tool set for unresolved threads, so it owes a release run, and no release run has completed for it. Run `34541492999` graded 47 of the 49 core fixtures and stopped on the $0.70 ceiling — everything graded passed, the last two fixtures never reached a model — and the green run after it (`34542249250`) was the targeted diagnosis with every release-gate job skipped. The same commit raised the default ceiling to $0.90 against an observed $0.73 for 49 fixtures, so the run is funded; it has not been fired. |
| D1 | `in_progress` | Per-turn and daily model-cost records exist and daily usage is now visible; workflow reconciliation and non-model cost/support measures remain open. |
| D2 | `not_started` | Must not begin until Gate 1 passes. |

## A. Make the core workflow safe to use

### A1. Fix the inbox render loop

Entry point: `apps/dashboard/src/app/dashboard/(shell)/tickets/_components/InboxPageLayout.tsx`, particularly `dialogBody`, `lastDialogBody`, and the effect that copies JSX into state.

- [x] Remove the effect-driven cycle that stores newly created JSX on every render. Keep a stable conversation identity or the minimum data needed for the dialog's closing transition; derive rendered content from that state. Do not silence the dependency warning or freeze the first render's props.
- [x] Preserve opening, switching, closing, reopening, loading, and error states. Decide when the exiting conversation is released so stale messages or handlers cannot appear in the next ticket.
- [x] Add an interaction regression with the real layout and an active ticket under stable props. Assert that it settles without self-sustaining updates; include switching tickets and receiving new messages. Avoid an exact render-count assertion that depends on React development behavior.
- [x] Exercise the actual inbox in browser smoke coverage and run dashboard lint.

Done when opening a ticket settles, subsequent updates still render, closing does not flash incorrect content, and lint plus the regression pass. The review's bounded reproduction observed 11 commits before stopping updates; this is a functional defect, not a cosmetic lint issue.

### A2. Reconcile existing work and deploy one verifiable candidate

Entry points: [existing audit fixes](code-audit-fixes.md), [deployment runbook](production/runbook.md), and [production checklist](production/checklist.md).

- [x] Inventory the current source revision, dirty changes, generated client, migration state, Vercel revision, Railway revision, and released Shopify app configuration. Record identifiers from their actual deployment records in [the September 7 release inventory](production/release-inventory-2026-09-07.md).
- [x] Review the already implemented policy forwarding, lease checks, unknown outcomes, action journal, inbound outbox, recovery pagination, media handling, and shared planning budgets. Preserve them and close only remaining defects.
- [x] Verify that the required outbox schema exists before deploying dependent code. Do not reapply or roll back the migration based solely on the document's age.
- [x] Run the canonical checks on the selected candidate. Deploy compatible dashboard and gateway versions through the existing release procedure, then perform isolated acceptance checks.
- [x] Rehearse crash-after-persistence, queue admission failure, duplicate delivery, lost execution lease, and ambiguous provider response. Confirm accepted work remains recoverable and ambiguous actions are not blindly retried.

Done when both applications run the recorded candidate, the database is compatible, and recovery evidence is attached to that release. Keep an application rollback path compatible with the additive schema; do not promise exactly-once external delivery.

### A3. Certify SocialAPI and the other launch providers for the advertised experience

Use [external services work](phase-6-external-services.md), the [Gmail verification packet](production/google-gmail-verification-packet.md), and [data-deletion procedures](production/data-deletion.md).

- [x] Replace the obsolete capped-bridge assumptions in the existing SocialAPI plan with a production plan for the first 100 users. Keep `ig_dm` as the product channel and SocialAPI as its selected transport. Done 2026-09-09: the document is now the [SocialAPI transport plan](socialapi-transport-plan.md); the temporary-bridge framing, the 30-day exit deadline, and direct-Meta-as-primary are retired, and the eight-merchant number is restated as the entry tier's first stage rather than a product ceiling. The `to-do-list.md` entries that still claimed Meta App Review gates launch were corrected in the same change. **Still open:** the admission *mechanism* landed 2026-09-09 — `SOCIALAPI_BRAND_ASSIGNMENTS` allocates one hand-provisioned brand per workspace and a map larger than `SOCIALAPI_MAX_ACTIVE_ORGS` closes connect rather than overfilling the vendor account — but the unit and the number are unset: what a “user” counts as (organization, brand, seat) and how many the contract supports come from the vendor answers, so this closes with the diligence bullet below.
- [ ] Run a controlled SocialAPI feasibility spike now, using Shopkeeper-controlled test accounts, to establish whether the transport works before pursuing merchant-capacity discussions. Prove connect → inbound text/image → existing ticket/plan → approve → received reply → disconnect/reconnect. The spike's first structural question is invariant 6 of the transport plan — whether a SocialAPI sender ID equals the direct-Meta `Customer.platformId`. If it does not, "normalize into the existing durable workflow" stops being true, an explicit identity mapping is required, and every estimate under this bullet changes. Record the live identity, webhook, media, send-result, and recovery evidence before estimating the production path. **Answered 2026-09-09:** the webhook's native `platform_id` matches the inbox row — the interaction `id` does not — so no identity mapping is required, and the identity, webhook, media and send-result evidence is recorded in the dated spike evidence. What is left of this bullet is the approval and disconnect/reconnect halves.
- [ ] If the controlled spike passes, implement the production path through the existing durable Instagram workflow: merchant OAuth, signed inbound webhook, exact organization/account routing, private media persistence, recovery and deduplication, approval, provider-pinned outbound reply, health/reconnect, disconnect, deletion, observability, and capacity controls. Do not treat middleware connectivity or a text-only test as Instagram readiness.
- [ ] Before external merchant data is admitted, close SocialAPI vendor and data-processing diligence: acceptable DPA and retention terms, scoped credentials, tenant isolation, incident/support commitments, deletion behavior, supported Instagram message/media coverage, recovery behavior, and a commercial tier sufficient for the cohort being admitted. Capacity discussions for later expansion do not gate the controlled feasibility spike.
- [ ] Prove the SocialAPI path first with controlled accounts, then with two supervised non-role merchant canaries: connect → inbound text/media → ticket/plan → approve → received reply → disconnect/reconnect. Observe the canaries for 7–14 days before expanding the paid pilot, and expand in explicit capacity-tested stages toward 100 users.
- [ ] Keep the existing direct Meta implementation safe and disabled for new launch connections. Do not spend launch-critical time on Advanced Access or require Meta acceptance for SocialAPI canaries, the paid pilot, or expansion through the first 100 users. Revisit direct Meta transport, migration, and any cross-provider handoff on a future dated decision.
- [ ] Resolve the documented Shopify app-secret exposure. Rotate through the provider and both applications in a coordinated window, validate OAuth and webhook verification afterward, and keep secret values out of evidence artifacts. If already rotated, record that evidence instead.
- [ ] Test a real merchant Shopify install. A 2026-09-09 provider-side readback confirmed the dev store holds every scope required by `SHOPIFY_OAUTH_SCOPES`, and the dashboard now explains why updated access is required and offers a reconnect action when recorded scopes are missing. Real-install acceptance remains open; verify missing scopes produce an actionable recovery path without silently disabling advertised work.
- [ ] Complete the applicable Gmail grant/reconnect and verification work. Keep forwarding available where suitable, with its own plain-text, attachment, threading, and bounce acceptance checks. Gmail completion must not be used to claim Instagram readiness.
- [ ] Validate iMessage binding, merchant identity, approvals, stale approvals, disconnects, and recovery on a real linked device.
- [ ] Close the outstanding Shopify compliance acceptance checks using isolated fixtures and the existing procedures before broad merchant onboarding.
- [ ] Keep TikTok Shop gated until API eligibility, app approval, seller authorization, and a complete external seller workflow are proven. Generic TikTok DMs remain a separate, unimplemented capability. Do not build more adapter code without resolving feasibility.

Done when every channel offered to the pilot cohort has dated acceptance evidence, an identified provider owner, and a recovery path; SocialAPI has completed its controlled-account and two-merchant canary sequence; and its contract and measured capacity support staged expansion toward the first 100 users. External vendor, OAuth-platform, or account approvals can extend the schedule, but direct Meta approval cannot. A fallback-channel pilot can validate that channel only; it cannot close the social-support hypothesis.

### A4. Ground completion language in execution evidence

Entry points: `packages/agent/src/plan-grounding.ts`, `plan-validation.ts`, `run-execution.ts`, `agent-actions.ts`, `tools/result.ts`, and the dashboard/gateway send paths.

- [x] Add regressions for unsupported first-person, plural, passive, and coordinated claims, including “We have issued your refund” and “Your refund has been issued.” Include wrong order, amount, currency, recipient, and partial execution cases.
- [x] Define a small structured completion-fact contract for supported mutations: action, target, relevant amount/currency, outcome, and execution reference. Reuse the action journal and provider results as the evidence source.
- [x] Keep proposed actions distinct from committed outcomes. A plan containing a refund tool is insufficient proof that a refund happened. Replies that depend on a mutation must wait for its result.
- [x] Render sensitive completion statements from validated facts where practical, while allowing brand voice in surrounding text. If a generated statement cannot be supported, regenerate within the existing budget or require merchant review. Do not keep expanding regexes as the primary correctness mechanism. `renderReplyCompletionClaims` replaces supported claim sentences with copy composed from the fact fields and leaves surrounding text alone; money follows the agent package's existing customer-facing convention (`$20.00`, or `18.50 EUR` for non-USD) rather than ISO-prefixed amounts a customer would read as a bank statement.
- [x] Preserve truthful statements about historical actions returned by live store reads. Treat customer text, old summaries, and unexecuted plans as untrusted claims rather than proof of completion.
- [x] Specify the approval contract for post-execution wording: facts may resolve an approved conditional reply, but a changed recipient, new promise, or materially different action requires renewed approval. Known failure and unknown outcome need distinct customer/operator copy.
- [ ] Run targeted model evaluation and the release gate under the [existing evaluation contract](agent-eval-gates.md). Exact candidate `c8a5b3c2` has passing behavior evidence for all 48 dashboard core fixtures and the gateway hard case; the original release invocation exhausted its budget, so strict single-invocation certification remains open. The owner requested no further paid run after the final targeted pass.

Done when the regression matrix cannot emit a completion claim unsupported by its recorded facts, an uncertain action cannot become a success message, and truthful historical information still works. Finite tests do not prove hallucinations impossible; keep monitoring sampled real outcomes.

**Structural debt this created, recorded 2026-09-09 rather than fixed.** The safety-critical half is
`unsupportedReplyCompletionClaims`, which grades the model's own text and rejects it; that half is
sound and runs against the original tool call, so the renderer cannot launder an unsupported claim
past it. The rendering half selects *what* to rewrite by matching English — `MUTATION_VERB`,
`MUTATION_VERB_PROGRESSIVE`, `CLAIM_CONTINUATION`, contrastive-phrase carve-outs — and then edits
the reply the customer reads. That is a repair pass on customer-visible text, which
`AGENT_AUDIT.md` records as deleted for cause, and it means `plan-grounding.ts` now grows a case
every time a phrasing slips through. The structural fix the architecture law already names is to put
the completion statement in the **tool schema**: `send_reply` accepts an optional structured
`completion` the executor renders, so the model never authors the sentence that needs grading.
That is a planner-surface change and needs the eval gate, so it is not free — but it is the version
that stops growing. Two smaller consequences to resolve alongside it: the approval card is no
longer WYSIWYG (the merchant approves one sentence, the customer receives another; `AgentAction`
records what was sent, so the audit stays honest), and `formatMoney` now has four independent
implementations across `shopify/sales-pulse.ts`, the dashboard context panel,
`conversation-attribution.ts`, and `lib/format/currency.ts` — `publicMoney` deliberately matches
the first rather than becoming a fifth.

## B. Align costs, context, and contracts

### B1. Replace the unlimited promise with a defensible offer

Entry points: `apps/dashboard/src/app/(marketing)/_components/Pricing.tsx`, `packages/db/plan-limits.ts`, billing checkout/webhooks, and onboarding plan selection.

Owner decision on 2026-09-07: defer Stripe price creation, price mapping, and paid-checkout rollout
for the near future. Keep this section open as later business work, but do not make Stripe pricing
a blocker for the current engineering and controlled-pilot work or invent temporary price IDs.

Restated 2026-09-09, because the deferral and the gate contradicted each other. B1 splits in two.
The **analytical half** — cost measurement, one defined billable unit, usage scenarios, and
deterministic entitlement behavior for every subscription state — is Gate 1 work and does not
touch Stripe; a missing price mapping granting unlimited AI access is a defect regardless of
whether checkout exists. The **commercial half** — Stripe prices, checkout, plan mapping, and the
surfaces that quote them — is Gate 2 work, needed when D2 tests renewal at a real price. A
supervised pilot can be invoiced by hand. Bullets below are marked to whichever half they belong.

The reviewed offer is $19 for 500 conversations and $49 for unlimited conversations. Full Starter usage yields $0.038 revenue per conversation. At a proposed 80% gross-margin target, only $0.0076 per conversation remains for all direct delivery costs. These are arithmetic scenarios, not measured customer costs or proof that a particular price will work.

- [ ] *(Gate 1 — analytical)* Measure model cost across classification, planning, execution, retries, summaries, operator turns, and scheduled work. Include messaging, storage, hosting allocation, payment fees, and customer support effort. Report cold-cache and expensive-tail cases separately.
- [ ] *(Gate 1 — analytical)* Include SocialAPI subscription, fair-use or overage exposure, brand/account capacity, support tier, and operational reconciliation work in the provider-cost envelope. Model the pilot and first-100-user stages separately.
- [ ] *(Gate 1 — analytical)* Build low, expected, and high usage scenarios per merchant. Show contribution margin and a separate fully loaded view that values founder support time.
- [ ] *(Gate 1 — analytical)* Define one billable unit, reset period, and treatment of reopened threads, episode rollover, retries, deleted threads, and operator messages. Reconcile the current calendar-month/thread-created counter with checkout and marketing language.
- [ ] *(Gate 1 — analytical)* Replace unlimited usage with explicit included usage and a clearly disclosed service allowance. Keep both tiers' core capabilities consistent with the existing product decision; vary usage and seats unless evidence supports a deliberate change.
- [ ] *(Gate 2 — commercial)* Choose the initial paid-pilot offer from the cost scenarios and merchant interviews. Test renewal at that price; do not infer willingness to pay from free use.
- [ ] *(Gate 1 — analytical)* Give trial, recognized paid, unknown-price, and expired subscriptions explicit entitlement behavior. A missing price mapping must not silently create unlimited AI access. Preserve appropriate read/manual access and explain billing/configuration problems.
- [ ] *(Gate 2 — commercial)* Update pricing, checkout, in-app usage, Stripe mappings, and support copy together. Specify treatment of existing customers before changing their limits. No surprise overages or retroactive charges.

Done when the offer has a documented cost envelope, every subscription state has deterministic limits, and the merchant sees the same promise on all surfaces. Final price and allowance are decisions supported by evidence, not fixed assumptions in this plan.

### B2. Make spending limits effective and understandable

Entry points: `packages/agent/src/spend.ts`, `packages/db/llm-spend.ts`, `packages/db/spend-store.ts`, model cost accounting, and agent configuration/billing UI.

- [ ] Separate the merchant's optional daily cap, the service's plan allowance, and the platform emergency stop. Raising a merchant-configured cap must not bypass the service allowance. The current $20/day default must not be mistaken for margin protection.
- [x] Replace “spend read failed → zero” with an explicit unavailable-budget outcome. Pause new paid model work on accounting failure, retain recoverable inbound work, and explain manual fallback. Do not silently report a successful zero-spend read.
- [ ] Reserve a conservative bounded allowance before provider calls, reconcile actual usage afterward, and prevent concurrent runs from spending the same remaining allowance. Use a durable idempotent record or extend an appropriate existing record; avoid a second independent ledger.
- [ ] Handle timeout/process-loss reservations conservatively. Release only amounts known to be unused; reconcile uncertain usage. A failed usage write must remain recoverable and must not permit repeated unaccounted calls.
- [x] Use a shared model-price source for production and evaluations, or enforce parity if packaging requires separate tables. Unknown models must not be silently underpriced.
- [x] Show daily model usage, remaining daily cap, reset time, and reason for a cap/accounting pause. Warn before exhaustion and offer a clear next action.
- [ ] Restore queued work at a bounded rate after accounting recovery or reset; coordinate this with durable reservations rather than adding an independent recovery mechanism.
- [ ] Verify concurrent dashboard/gateway calls, database outages, duplicate usage reports, unknown models, exhausted allowances, and period rollover.

Done when normal concurrent work cannot bypass the service budget, accounting failures are visible and recoverable, and the residual maximum overshoot is documented and tested. Do not claim a strict dollar ceiling if the provider's in-flight usage cannot be bounded.

### B3. Give the agent bounded, correctly scoped customer history

Entry points: `packages/agent/src/context.ts`, `context-budget.ts`, prompt construction, and prior-conversation display in the dashboard.

- [ ] Retrieve a small configurable number of recent prior conversation summaries for the same verified customer within the same organization; start with at most three. Exclude the current thread and deleted records, respect retention policy, and avoid speculative cross-channel identity merging.
- [ ] Attach timestamps, source identifiers, channel, and disposition. Label summaries as historical context; fetch current Shopify state before asserting that an order remains refunded, unfulfilled, or otherwise actionable.
- [ ] Allocate an explicit history budget within the total context budget. Handle missing summaries and retrieval failure without breaking the whole context fan-out.
- [ ] Include regressions for repeat complaints, recent refunds, changed policies, conflicting old summaries, tenant isolation, and anonymous/verified storefront sessions. Do not expose private history to an unverified shopper.
- [ ] Evaluate the prompt change under the existing paid evaluation contract and compare cost and latency with the prior context.

Done when relevant repeat-customer cases use prior context accurately, privacy boundaries hold, and context size remains bounded. A vector database or general identity platform is outside this first implementation.

### B4. Finish structured outcome propagation

Entry points: `packages/agent/src/tools/result.ts`, `message-dispatch.ts`, `run-approved-actions.ts`, action records, and the internal dashboard/gateway response contracts.

- [ ] Inventory remaining control flow based on `Error:`, `Unknown:`, or other message wording. Retain already implemented typed statuses and unknown-outcome handling.
- [ ] Carry typed outcome, error code, execution/request reference, and retryability across the affected boundaries. Keep display text separate from machine decisions.
- [ ] Convert legacy string results once at a named boundary if historical compatibility is required; add no new downstream prefix parsing.
- [ ] Specify the semantics of not-found, policy-blocked, failed-before-send, committed, and unknown. Unknown provider outcomes must remain non-retryable until reconciled.
- [ ] Test propagation through the actual gateway → dashboard send hop and operator summaries. Changing human-readable wording must not change retry, billing, or completion behavior.

Done when active paths use structured outcomes end to end and any remaining legacy adapters have a documented retirement condition.

## C. Make performance, usability, and maintenance verifiable

### C1. Bound reads and establish a performance baseline

Entry points: `apps/dashboard/src/app/api/threads/route.ts`, thread detail/message consumers, `apps/dashboard/src/lib/messaging/thread-list-query.ts`, and inbox pagination hooks.

- [x] Keep the active inbox on bounded cursor pages and preview responses. The current client requests 25 rows and the API defaults to a bounded 50-row page.
- [ ] Give conversation history a bounded cursor-based endpoint or response, with explicit load-older behavior. Audit all detail callers before removing full-history responses.
- [x] Preserve stable thread-list pagination with a cursor containing both `lastMessageAt` and `id`, including timestamp ties and newly arriving messages.
- [ ] Fetch the latest customer message per thread using a database query with bounded result cardinality; inspect generated SQL before assuming the current ORM `distinct` bounds scanned or transferred rows.
- [ ] Inspect plans and indexes against realistic tenant-scoped data. Add an index only for demonstrated query work. Keep the existing hidden-tab polling suspension and verify realtime reconnect fallback.
- [ ] Benchmark isolated local/staging datasets representing 1× and 10× the expected pilot volume, long threads, attachment bursts, webhook retries, and concurrent operators. Use stubbed providers for load; no production mutation traffic.
- [ ] Record hardware/service tier, dataset size, concurrency, cold/warm cache, database time, response size, memory, queue age, and p50/p95 latency. Separate provider/model latency from application work.

Initial acceptance targets, to be adopted or revised with measured evidence before implementation closes: warm list/detail API p95 ≤500 ms at pilot load; provider-independent request failures <1%; representative routine plans ready within 30 seconds at p95; and a 10× inbound burst drains within five minutes after input returns to normal. These are proposed budgets, not current performance claims. Long-thread response size must stay bounded as history grows.

Done when measurements are reproducible, important queries are bounded, and the agreed pilot load fits the service's cost and latency budgets. Optimize measured hotspots before introducing additional infrastructure.

### C2. Complete the usability audit and reduce approval interruptions

Entry points: onboarding components, `apps/dashboard/src/proxy.ts`, `src/lib/e2e-auth.ts`, inbox/review components, and operator notification/binding flows.

- [ ] Reproduce the local Clerk loop with the documented preview command. Determine whether key resolution, middleware initialization, or preview setup caused it. Make isolated preview reproducible without weakening production authentication or allowing production auth bypass.
- [ ] After A1, inspect real rendered desktop and mobile flows: sign-up, Shopify connection, customer channel connection, iMessage binding, first request, approval, correction, takeover, recovery, and disconnect/reconnect.
- [ ] Resolve the onboarding mismatch: the current step sequence directs users through email while the product's wedge is social support. Make SocialAPI-backed Instagram the primary customer-channel setup path for admitted merchants without requiring email first. Explain SocialAPI's role before authorization, handle capacity or eligibility failures explicitly, and keep Gmail as an optional fallback rather than as the route around Meta restrictions.
- [ ] Check keyboard navigation, focus restoration, dialog announcements, touch targets, screen-reader labels, reduced motion, and mobile keyboard/composer behavior. Capture loading, empty, error, and expired-plan states as well as the happy path.
- [ ] Make the approval card explain the proposed action, affected order, money involved, and relevant evidence. Keep detailed audits available without making them mandatory reading for every approval.
- [ ] Use existing notification/digest controls to batch routine notices, deduplicate reminders, and respect duty hours. Immediate alerts should reflect urgency or required decisions. Do not relax financial approval policies merely to reduce notifications.
- [ ] Observe merchants handling realistic requests. Measure active review/correction time and unnecessary interruptions; ask whether the phone workflow is easier than their previous process.

Done when the complete advertised workflow has browser/device evidence, no critical accessibility/usability blockers remain, and the pilot measures the net effort of approval. A phone-based queue is not successful solely because notifications arrive.

### C3. Restore documentation trust and reduce maintenance friction

- [ ] Reconcile README channel status, polling/realtime behavior, navigation, attachment support, operator channel naming, and testing counts with implementation and deployment evidence. Update or retire the obsolete SocialAPI “temporary bridge,” eight-merchant ceiling, direct-Meta-primary, and Advanced-Access-launch-gate claims in the README, to-do list, runbook, research/launch records, and Product Truth. Remove completed to-do entries only after confirming their actual status.
- [ ] Record four separate states for integrations: implemented, locally verified, deployed, and externally accepted. Keep strategic intent in Product Truth and current operational status in the launch records.
- [ ] Add a concise architecture map showing inbound persistence/queueing, agent planning, approval ownership, action execution, provider delivery, and recovery. Identify the authoritative owner of plan state, customer identity, billing eligibility, and action outcomes.
- [ ] Document the shared agent package's supported host interface. Consolidate exports or abstractions only where a real change currently requires duplicated work or knowledge of internals.
- [ ] Name module owners, even if initially the same person. Use the current lint/Knip and compatibility-retirement mechanisms. Do not rename persisted channel enums or BullMQ job identifiers for aesthetics.
- [ ] Require feature changes to update their associated truth/status documents. Mechanical link checks catch broken paths; reviewers must check factual claims.

Done when a developer can trace one customer request and one uncertain delivery through the system from the architecture map, and onboarding documentation matches the code. Do not target arbitrary reductions in files, lines, migrations, or models; reduce the number of places required for a representative change.

### C4. Certify the release that merchants will actually use

Follow [Testing](../TESTING.md), [critical-path coverage](production/critical-path-test-checklist.md), and [agent evaluation gates](agent-eval-gates.md).

- [ ] Add targeted behavioral regressions for the actual defects above. Preserve useful existing coverage rather than adding tests that merely mirror helper implementations.
- [ ] Run `npm run verify:pr` on the candidate: static checks, unit/node tests, coverage/integration, smoke E2E, and production build. Resolve failures and document any optional skipped checks.
- [ ] Include a real rendered inbox interaction; passing helper tests did not detect A1. Exercise reply and approval persistence across both applications, with provider calls recorded in tests.
- [ ] Run the separate Clerk browser-session checks in their appropriate development environment. A bypassed-auth smoke pass cannot certify provider authentication.
- [ ] For prompt, context, grounding, and tool-contract changes, run targeted paid evaluations followed by the release mode using explicit dollar and model-call budgets. Do not reuse the August baseline as current certification or dispatch unbounded paid retries.
- [ ] Record candidate SHA, cache usage, environment, checks/skips, and provider acceptance evidence. Keep operational artifacts free of credentials and unnecessary customer content.

Done when the actual candidate passes the required checks and advertised provider workflows, with no unresolved critical safety or core-workflow defect. Use dated evidence; neither a test count nor a green historical audit is sufficient.

## D. Prove the concept and economics

### D1. Measure outcomes before adding acquisition volume

Reuse `packages/analytics`, `AgentTurnUsage`, request/action records, and [existing PostHog reports](production/posthog-reports.md). Add only missing measures.

- [ ] Make activation mean a connected merchant has received a real customer request and completed a verified action/reply. Report channel-specific funnels; the current documented email step must not exclude the social cohort from activation analysis.
- [ ] Distinguish automated resolution, approved resolution, manual takeover, blocked action, known failure, unknown outcome, and reopened request. A sent reply alone is not proof of resolution.
- [ ] Measure initial setup time, founder help, active merchant review time, substantive edits, unsolicited reminders, and meaningful weekly use. Use observation/time diaries where click timing would falsely count time away from the app as work.
- [ ] Attribute all model/provider costs to the organization and period, including SocialAPI base-plan allocation, background work, reconciliation traffic, and failed/retried requests. Reconcile aggregates against provider totals and flag unattributed spend.
- [ ] Track founder support minutes and assign a stated hourly cost in the economic analysis. Separate one-time setup from ongoing support.
- [ ] Establish incident measures for unsupported completion claims, wrong targets, duplicate actions, lost accepted messages, and time to resolve unknown outcomes. Avoid logging raw message content into general analytics.

Done when five sample workflows reconcile from request through action/reply, usage, analytics, and cost, including a retry and a failure. Metrics must not double-count redelivery, test fixtures, or founder-operated accounts as customer success.

### D2. Run a focused paid pilot and test the reason to choose Shopkeeper

The following is a validation protocol, not a claim of existing traction or authority to contact merchants during this documentation task.

- [ ] After the two supervised SocialAPI canaries pass, recruit five to ten independent, owner-operated Shopify brands in one segment, initially testing apparel/accessories with recurring social questions and order changes. Screen for enough weekly support work to plausibly save several hours; record current tools and their limitations. This is the first paid validation cohort, not an instruction to admit all 100 users at once.
- [ ] Before connecting Shopkeeper, collect a one-week baseline of support volume, active handling time, response delays, and error/rework costs. Separate unusually quiet or peak weeks.
- [ ] Run four to six weeks of real, initially supervised use after the pilot gates pass. Record every founder intervention; manual rescue is a service cost, not autonomous product success.
- [ ] Compare matched request types against the baseline. Report routine and complex cases separately, include unanswered/reopened cases, and show per-merchant results rather than only cohort averages.
- [ ] Ask merchants to renew at the documented intended price. Record payment/renewal behavior, not just survey enthusiasm. If renewal is not yet due, keep the retention conclusion open.
- [ ] Test a repeatable founder-led acquisition route, such as a narrowly defined agency partnership or direct recruitment campaign. Track qualified leads, demos, activation, paid conversion, cash cost, and founder time. Outreach itself is a separate execution step.
- [ ] Ask why merchants chose Shopkeeper over their existing workflow and available competitors. Test the specific value of iMessage control, approval clarity, and completed order work. The research starting points are [Gorgias support skills](https://www.gorgias.com/ai-agent/support-skills), [Tidio](https://apps.shopify.com/tidio-chat), [Shopify Inbox](https://apps.shopify.com/inbox), and [Sidekick](https://www.shopify.com/sidekick); recheck their offers before making new comparative claims.
- [ ] Turn recurring merchant corrections and incidents into consented, redacted evaluation cases. Build differentiation through demonstrated workflow reliability, useful merchant preferences, and distribution relationships. Do not treat notification transport or model choice alone as a durable advantage.

Proposed pilot decision criteria, to adopt before recruitment so the goalposts do not move:

| Measure | Initial decision target | Interpretation |
| --- | --- | --- |
| Independent paid demand | At least five paying merchants; at least three renew at the intended offer | A small directional signal, not proof of product-market fit |
| Time saved | At least three merchants save ≥2 active hours/week after review and rework | Compare similar request volume/types with baseline |
| Approval usefulness | ≥80% of reviewed routine plans approved without substantive edits | Also report rejected, ignored, regenerated, and automatically handled plans |
| Dependence on founder | Recurring rescue/support time decreases over the pilot | High-touch help must be included in costs and reported honestly |
| Economics | Positive contribution per paid merchant; a measured path toward 80% gross margin | Include expensive users, all provider costs, and allocated recurring support |
| Reliability | No unresolved critical wrong-recipient, unauthorized-money, duplicate-action, or lost-message incident | Pause the affected automation and investigate any such event; small samples cannot establish zero risk |
| Acquisition | One route produces multiple independent paying merchants with recorded acquisition cost/time | Referrals from friends alone do not establish repeatable distribution |

Continue investing when merchants renew, net effort falls, critical risks are controlled, and costs support the offer. Narrow the segment or workflow if only a subset gets value. Reprice or reduce included usage if value is strong but costs are excessive. Pause expansion if merchants do not renew or the service depends on persistent founder rescue. Do not respond to weak demand by automatically adding more features.

## Pilot and expansion gates

### Canary entry gate: Before the first supervised external SocialAPI merchant

- [x] A1 is fixed; A2's required reliability changes are deployed and verified.
- [ ] SocialAPI vendor/data-processing gates, tenant isolation, scoped credentials, controlled-account acceptance, and the production-shaped OAuth → inbound → approval → received-reply → disconnect path pass.
- [ ] The Shopify secret is rotated and the canary's Shopify grant, iMessage binding, manual fallback, deletion path, and operator recovery path are ready.
- [ ] A4's sensitive completion/outcome cases pass for the canary candidate, and C4's applicable deterministic and browser checks pass with a recorded SHA.
- [ ] D1 can reconcile each canary request through provider ingress, action/reply, cost, retry/failure state, and founder intervention.

This gate authorizes only the two named, closely supervised SocialAPI canaries. Their 7–14-day observation is A3 evidence, not a prerequisite that can be obtained before any external merchant is admitted.

### Gate 1: Before expanding beyond the two canaries into the paid pilot

- [x] A1 is fixed; A2's required reliability changes are deployed and verified.
- [ ] A3 passes for every offered channel. SocialAPI has completed controlled-account acceptance and the two-merchant observation window, with capacity and recovery evidence for the next stage. Direct Meta approval is not part of this gate.
- [ ] A4's sensitive completion/outcome cases pass. Human approval and manual fallback remain available.
- [ ] B1 has a measured cost envelope, one defined billable unit, and deterministic entitlement behavior for every subscription state — trial, recognized paid, unknown price, expired — so a missing price mapping cannot silently grant unlimited AI access. B2 provides bounded paid usage, visible pauses, and recovery behavior. **Stripe price creation and paid checkout are explicitly not in this gate** (owner decision 2026-09-07, restated 2026-09-09): a supervised pilot can be invoiced by hand, and requiring the deferred half here made this gate unpassable by construction. Paid checkout moves to Gate 2, where D2's renewal test actually needs it.
- [ ] C1 establishes bounded core reads and capacity sufficient for the pilot; broader optimization may follow measurement.
- [ ] C2 demonstrates the core device/browser flow and resolves critical usability/authentication blockers.
- [ ] C4 certifies the selected candidate; D1 records the necessary evidence.

B3 and remaining B4/C3 improvements may continue during a small supervised pilot if their residual limitations are disclosed and do not undermine these gates. Treat any discovered privacy, authorization, or outcome-integrity defect as a gate regardless of its task label.

**Sequencing note, updated 2026-09-10.** Every remaining Gate 1 item except A3 is bounded, understood work on an existing application path. A3 is now wired and has live-provider evidence through milestone zero, and what is left of its critical path is a *run*, not a build — so the reason to keep B3, B4, C2, and C1's remaining items parked has changed: they are parked behind an hour of live verification rather than behind an unknown transport. Start them once the approval-leg re-run either passes or produces a defect worth fixing first, or while A3 waits on the vendor. Do not let a bounded item run first because it is easier to estimate.

### Gate 2: Before expanding the validated cohort toward 100 users, substantial acquisition spending, or new operating modules

- [ ] All engineering items in this plan are closed with evidence or explicitly re-scoped based on pilot findings.
- [ ] B1's deferred commercial half is closed: Stripe prices exist, checkout and plan mapping are live, and pricing/checkout/in-app usage/support copy all state the same promise.
- [ ] D2 demonstrates paid renewals, net time savings, and a defensible cost envelope.
- [ ] Typical and expensive merchant workloads fit the chosen offer and operational capacity.
- [ ] SocialAPI's commercial tier, account/brand capacity, rate limits, support response, data-processing terms, and observed reliability fit the staged path to 100 users.
- [ ] A repeatable acquisition route and the merchant's reason to choose Shopkeeper are documented.

## Suggested calendar and status discipline

**Reordered 2026-09-10.** Documentation reconciliation of the launch-gate contradiction is done; the A4 rendering work is landed; the controlled spike and milestone zero both passed, and the three defects the first approval attempt exposed are fixed and deployed. What remains is still dominated by one item, but it is now a single live run: re-send one Instagram DM whose plan carries a mutative call and follow it through approval, execution, and receipt. Do not wait for merchant-capacity discussions to do it — the accounts are Shopkeeper's own. Then build the remainder of the production path (`dm.sent` correlation, ephemeral-image classification, recovery, reconnect, disconnect, deletion, capacity controls) and close the vendor/data-processing diligence required before external merchant data is admitted. Preserve the completed A1/A2 work; prioritize closing A4, budget correctness, and the pricing model while the SocialAPI production path is built. Then complete bounded context/result work, onboarding and usability, load measurement, and release acceptance. Several tasks can overlap by owner; a solo developer should sequence them and re-estimate after the SocialAPI spike rather than inheriting the old bridge schedule.

Admit only the two supervised external canaries after the canary entry gate. Begin the four-to-six-week paid observation period only after their 7–14-day A3 observation and Gate 1 pass. Expand toward 100 users only after Gate 2 and in capacity-tested stages. The previous eight-to-ten-week envelope is no longer authoritative; re-estimate after the controlled SocialAPI spike, then obtain any vendor answers needed for external admission and later capacity. Do not compress either observation period to preserve a date, and do not treat direct Meta review timing as part of the launch schedule.

For every item, record owner, state (`not_started`, `parked`, `in_progress`, `blocked_external`, or `verified`), dependency, implementation revision, and evidence link. `parked` means deliberately sequenced behind something else and named as such — distinct from `not_started`, which means nobody has decided. Mark an item verified only against its acceptance criteria. Keep deploy evidence, local checks, provider acceptance, and customer validation distinguishable. A weekly review should answer: what risk was removed, what did merchants demonstrate, and what evidence permits the next investment?
