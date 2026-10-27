# Roadmap

The only planning doc. Each item says what is left and what closes it. Delete an item
when it closes — git history is the record. No status narratives, evidence logs or
"observe in normal use" lists; anything that blocks nothing does not belong here.
Technical contracts and settled engineering decisions live with the code they govern
([agent-runtime](agent-runtime.md), [runbook](production/runbook.md),
[transport plan](socialapi-transport-plan.md)), not here.

Last updated: 2026-10-27.

## Now — finish the cleanup

1. **Test suite structure.** One naming rule everywhere (`*.integration.test.ts` needs
   services, any other `*.test.ts` doesn't); move DB-free "integration" files to unit and
   agent-package tests out of the gateway; replace the Clerk-mock patching in the
   dashboard `test-setup.ts` with one `mockClerkSession()` helper; split scenario files
   over ~600 lines; turn lint-style tests into ESLint rules. No new tests. Closes when
   `npm run test:unit` covers every test that needs no database and runs without Docker.
2. **Agent-core debt**, one PR each:
   - Typed tool status, error code and data flow end to end; nothing branches on
     `Error:`/`Unknown:` prefixes (`message-dispatch.ts`, `tool-action-display.ts`,
     `AgentChatMessage.tsx` — whose chips print an ID as a count — and
     `AgentPrivateTurns.tsx`).
   - The ticket composer stops routing instructions by regex
     (`shouldUsePrivateComposerAsk` in `useConversationAgentFlow.ts`): anything not opening
     with a listed verb, or containing "write"/"why", goes to the read-only ask, so "Issue
     a refund" never becomes a plan. The planning path should decide, as
     `navigate_dashboard` already does for navigation.
   - Split `task-ledger.ts` by concern.
   - One money formatter (copies in `sales-pulse.ts`, `conversation-attribution.ts`,
     `lib/format/currency.ts`, `publicMoney`, the context-panel formatters).
3. **Architecture-audit fixes (2026-10-17)**, one PR each, in this order. Most defects were
   traced in code, not seen in production:
   - Dashboard answers re-plan on the gateway (`applyOperatorAnswerReplan`), so they park
     and notify every channel; `io-send-internal` reports a post-acceptance throw as
     unknown; the gateway sink uses `composeThreadSink`; the briefing and the queue share
     one liveness predicate.
   - Autonomy: `allowsAutomaticExecution` covers escalation-only plans in
     `plan-failure-replan`; `validateCustomerFacingApprovalSet` compares the executable
     plan; one exhaustive table per code list replaces the four-place escalation ritual.
   - Remove partial approval (`toggleStep`, Telegram plan-skip remnants) and require
     `planId` on `/api/agent`.
   - Delete the parallel planning mode in `ai-summary-flow.ts`, so new email threads plan
     from `requestSummary`, not the raw unwrapped body.
   - One open support task per thread: delete the ledger's customer wait and continuity
     matching; reconcile only on unsettled dispatches. Check production `waiting_input`
     customer waits first.
   - Operator-written customer emails become reviewed exact drafts: requests record the
     latest message of any sender at acceptance and execution refuses anything newer, which
     also lets `draft_ticket_reply` work on an answered ticket. Then execution refuses
     every customer message without an approved draft, and the refusal above goes.
   - Retire `AutonomyShadowDecision` and cache version 6; make the retirement audits
     measure what they license; decide whether `RequestEpisodeOutcome` earns its keep.

## Next — the first real merchant

In order. This is the product's critical path.

1. **Run one Instagram DM through phone approval to a reply the customer receives.**
   Fresh DM from a controlled account (Instagram refuses business replies after 24h)
   asking for a refund on a real dev-store order — it must carry an action-category call,
   or the plan auto-sends and never reaches the phone. Revise once from the phone, then
   approve on iMessage. Closes when the parked plan survives to the reply,
   `approve_pending_plan` finds it, a `PlanExecution` exists with `executionId` on the
   action rows and a named approver, the refund commits in the charged currency, and the
   reply shows in the customer's app. Run a photographed damage claim the same way, and
   confirm the SocialAPI gallery photo is stored on the ticket.
2. **Run an unlinked Instagram sender's damage claim through order confirmation** (built:
   decision Q in agent-runtime). Apply `20261020120000_add_order_verifications` first.
   Closes when the agent asks for the order, then its email or zip, the reply confirms
   it, the photo ask follows, and the merchant gets one card: the confirmation line,
   photos and the proposed resolution.
3. **Close SocialAPI vendor diligence** before any external merchant's data flows: DPA,
   written retention/deletion answers, the terms §11.4 contradiction, a "Powered by
   SocialAPI" notice before the vendor redirect, and `/privacy` naming SocialAPI as a
   processor. Gates are in [socialapi-s0-diligence](production/socialapi-s0-diligence-2026-09-07.md).
4. **First live SocialAPI merchant connect** (runbook: *Instagram via SocialAPI*), with
   the `SOCIALAPI_*` vars added to `scripts/check-production-env.mjs`. Closes when a
   workspace connects from the dashboard and its next DM routes to it.
5. **Disconnect and deletion revoke the SocialAPI account.** `disconnectInstagramAccount`
   has no caller. Closes when disconnect revokes the remote account (or records why not)
   and a disconnect → reconnect keeps routing and customer identity.
6. **Rotate `SHOPIFY_APP_SECRET`** (exposed 2026-08-30; steps in the runbook).
7. **Install the Shopify app on a real, non-dev store.** Closes when the install grants
   every `SHOPIFY_OAUTH_SCOPES` scope and a missing scope shows the reconnect path.
8. **Two supervised external merchants** complete real approved loops with no
   wrong-recipient, unauthorized-money, duplicate-action or lost-message incident.

## Later

- **SocialAPI hardening** (S1–S6 in [the transport plan](socialapi-transport-plan.md)):
  `dm.sent` correlation (a reply typed in the Instagram app never reaches the thread),
  missed-delivery recovery, account health probing, failed-connect compensation.
- **Instagram reply latency:** measure per hop, then make the order-confirmation ask one
  model call. SocialAPI has no typing or "Seen" for Instagram; ask the vendor.
- **Agent rough edges seen live:** the operator agent's own chat question is reported as
  an escalation and the merchant's answer errors (`answer_operator_question` only knows
  ticket questions); cards on already-escalated threads print the raw
  `escalate_to_human` reason instead of the grounded handoff; the ticket plan card can
  go stale after a new customer message (unreproduced); a status question naming the
  customer uses the full order read; the briefing has no "waiting on a photo" line.
- **Concurrency-safe LLM allowances.** Parallel calls can spend the same remainder, and a
  usage write that fails (or names an unpriced model) is logged by `recordSpend` and
  dropped. Reserve before each provider call and reconcile after; keep unknown
  reservations across process loss; keep merchant cap, service allowance and platform
  stop separate; extend `llm_daily_spend` rather than adding a ledger. Closes when
  concurrent calls cannot overspend by more than one in-flight call and a failed usage
  write stays recoverable.
- **Cost envelope, billable unit and entitlements**, before charging anyone. Decide
  whether an unknown price id should stay unbounded (`packages/db/plan-limits.ts`).
- **Prior conversations in planner context**: at most ~3 summaries of the same verified
  customer, newest first, own budget and own catch, never shown to an unverified shopper.
- **A refusal shouldn't outlive the capability.** In a permanent operator thread the
  agent keeps citing its own earlier "I can't" after a tool ships. Decide the mechanism;
  a prompt bullet is not it.
- **Ops alerts that bypass `emitOpsAlert` reach nobody** until log drains exist —
  including the 30-day `customers/data_request` duty. Route them, and decide whether
  anything external should notice a dead worker or a database outage.
- **Compliance webhooks:** exercise `customers/data_request` and `shop/redact` once
  ([data-deletion](production/data-deletion.md)).
- **Production leftovers:** get `audit:agent-runtime-retirement -- --strict` clean
  (taskless cached plans regenerated, open unknown actions reconciled). Drop
  `AGENT_RUNTIME_VERSION` from Railway only once no pre-#165 revision can be a rollback
  target ([agent-runtime](agent-runtime.md), *Deployment and rollback*). Retire the
  identity-less operator queue reader once `audit:operator-context-compatibility --
  --strict` reports none.
- **Gmail restricted-scope verification** — submit
  ([packet](production/google-gmail-verification-packet.md)).
- **Postmark:** credential canary to an off-domain recipient, then restore the
  forwarding integration and send one reply with an attachment.
- **Storefront chat on the dev store:** browser matrix, episode boundary, the
  router-materialized escalation, one real merchant in approval mode, one
  `chat_assisted` order ([findings](production/storefront-chat-verification-2026-08.md)).
  Decide whether a verified shopper may start a mutation that goes to merchant approval.
- **PostHog:** the privacy policy already discloses it — review staging payloads, then
  set `PRODUCT_ANALYTICS_ENABLED=true`.
- **Email and onboarding bugs:** a workspace's *first* Gmail connect is not refused while
  forwarding is active (`assertNoDualInboundDelivery` sees no `inboundStatus` on the new
  row), so the watch turns on beside forwarding and mail arrives twice; onboarding offers
  Telegram (`StepConnect`) whenever `TELEGRAM_BOT_USERNAME` is set, against
  [product-truth](product-truth.md) — keep it unset in production until it doesn't.
- **Deletion gaps:** a merchant whose only workspace it is gets account deletion, which
  removes only their membership — confirm whether Clerk deletes the org (and so the
  workspace and any Stripe subscription); `failWorkspaceDeletion` has no caller, so a
  revoked Gmail/Instagram grant makes the sweep retry every minute forever; a non-Shopify
  erasure request has no path to the full `redactCustomerData` erase.
- **Console residue:** Clerk application name (and delete the unused dev app), Shopify
  Partner app name and privacy URL, Postmark sender branding, the Telegram bot rename to
  `@useshopkeeperbot`, and Stripe product names, statement descriptor and receipts —
  those land on merchants' card statements, so check them before charging anyone.
- **Collapse `vercel.json`'s build command** to `prisma generate` plus a turbo filter.
- **Paid pilot:** decide the SocialAPI admission unit and contracted capacity, instrument
  outcomes and per-org cost, benchmark 1x/10x pilot load on isolated data with stubbed
  providers (warm list/detail p95 ≤ 500 ms, provider-independent failures < 1%, routine
  plans ready ≤ 30 s p95, a 10x burst drained within 5 minutes), then recruit 5–10 owner-run
  brands in one segment. Success: ≥5 paying and ≥3 renewing, ≥2 hours/week saved for ≥3,
  ≥80% of routine plans approved unedited, no unresolved money or wrong-recipient
  incident. Stripe prices only when the pilot tests renewal.
- **Shopify App Store listing:** check whether one exists, then decide.

## Parked — reopen on the trigger

| Trigger | Work |
| --- | --- |
| A merchant asks for TikTok Shop | Configure-and-enable or cut — no more adapter code |
| A merchant asks for account binding | Storefront chat Customer Account OAuth (blockers in the storefront doc) |
| A merchant asks to change a line quantity | Quantity edits in `edit_shopify_order` |
| The first merchant chooses email forwarding | Verify their sending domain in Postmark |
| Zero forward-only merchants, and a decision | Remove Postmark inbound (keep the bounce webhook) |
| The first unknown write on a merchant's store | A merchant-facing way to confirm what happened |
| Before changing capability discovery or operator tool sets | Attribute planning cost (`inspect-turn-usage.ts`, `rebuilt`) |
| The next support-prompt bullet for one bad output | Move `SUPPORT_INSTRUCTIONS` invariants into schema or executor |
| The next change to merchant-answer KB or order-ops findings | Typed fields instead of regexes in `merchant-answer-kb.ts`, `order-ops/finding.ts` |
| Async recovery exercised | Decide async-only outbound email and retire the sync path |
| A few weeks of real merchant traffic | Baseline outcomes from `agent_actions`/`agent_tasks`/`agent_turn_usage` |
| Attributed chat sales look too low | Anonymous-shopper attribution via cart attributes |
| Classifier spend matters | Classify a two-message email burst once |
| Tool-schema cost justifies a re-proof | Consolidate `get_shopify_orders`/`get_order_by_name` into one `orders.json` read; `get_order_tracking` stays separate. Those two are the whole verified-storefront set (`VERIFIED_ORDER_TOOL_NAMES`), so a by-customer lookup must reach neither storefront state, and the guest/verified matrix is re-proved |
| SocialAPI fails diligence or the cohort nears 100 | Revisit direct Meta (Meta console branding, native-ID mapping) |
| Anything touches the gateway host | Move it to a `useshopkeeper.com` subdomain and re-point every webhook together |
| Google requests a CASA assessment | Backup/log retention checks, a dynamic scan, the unverified requirements |
| Paid beta | Better Stack Level 1 drains and escalation |
| A merchant sees a duplicate over-plan notice | Move the marker off `Organization.settings` |
| Gateway Redis leaves private networking | `REDIS_URL` → `rediss://` |
| First customer launch | Decide `MERCHANT_PREFERENCE_OBSERVED_PROPOSALS` |
| ~50 paying merchants or marketing spend | Revisit the trademark |

## Decisions on record

- **Make it work before making it certifiable.** A gate or hardening item earns its place
  once the path it guards runs. Money, tenant isolation and truthful outcomes are never
  skipped. (2026-09-10)
- **SocialAPI is the `ig_dm` transport through the first 100 users.** Meta App Review
  gates nothing; direct Meta stays closed to new workspaces. Admission is by
  `SOCIALAPI_BRAND_ASSIGNMENTS`, capped by `SOCIALAPI_MAX_ACTIVE_ORGS` (max 8). (2026-09-09)
- **Gmail working never proves Instagram ready.** Instagram is the core customer
  channel, iMessage the control surface, Telegram internal only. (2026-09-07)
- **Damage claims need a photo before any compensation** (`damageEvidence:
  "photo_required"`, the default; `off` disables it). A missing photo escalates; a
  photographed claim always goes to the merchant; the agent never judges a photo.
  (2026-10-07)
- **Never relax financial approval to cut notifications**; batch, dedupe and use duty
  hours instead.
- **New capabilities need a named merchant job** and stay out of the default support
  turn unless they earn it; gift cards are merchant-directed only. (2026-09-11)
- **Plans sell volume and seats, never features.** (2026-08-19)
- **Paid alerting waits for paid beta**; until then gateway alerts go to the operator
  Telegram chat and the dashboard to Sentry. (2026-07-31)
- **Synchronous outbound email stays the rollback rail** until async recovery is
  exercised and an async-only date is set.
- **Don't rename persisted enums or BullMQ queue/job names** for aesthetics — live
  repeatable schedulers depend on them. Retire a compatibility path one per PR, after its
  audit shows no production use. Kept until then: the `whatsapp-digest` queue and jobs and
  the `outbound-email-sweep` names (`apps/gateway/src/constants.ts`;
  `audit:bullmq-compatibility-names`), the synchronous email rail
  (`audit:outbound-email-mode`) and the identity-less operator queue reader
  (`audit:operator-context-compatibility`). Their audits are not finished-migration
  scripts for the cleanup in *Now*.
- **Episode memory stays deferred** (person identity, obligations, prior-episode
  retrieval): it is a ranking problem with no traffic to rank. (2026-08-12)
- **Evals can't see the Shopify layer** — every Shopify tool result is simulated, so the
  dev store is the only test of `packages/agent/src/shopify/*`.
- **Founder and test workspaces never count** as demand, success or renewal evidence.
