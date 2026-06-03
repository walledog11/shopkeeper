# Clerk — Autonomy Raise & Core Generality Plan

Follow-on to `remediation-plan.md`. That plan hardened support and generalized the
chassis (Phases 0–3). This one covers the next committed moves: **raising autonomy
to broad/full** and **proving the generalized core carries non-conversational work.**

## Decisions driving this plan

- **Autonomy gate:** elevated tiers + auto-execute go live only after a **shadow/canary
  period on real traffic** — the agent runs at the higher tier but actions stay
  human-approved; we compare what it *would* have auto-done against what the human
  approved, and flip live only when agreement is high and harmful disagreements ~0.
  Evals are the *entry* criterion; shadow is the *exit* criterion.
- **Generality test:** a time-boxed **fraud-risk flag monitor** spike — a non-conversational,
  thread-less agent run — is the chosen stressor for the generalized core (answers the
  deferred remediation-plan 3.4).
- **LLM-outage handling:** left as-is for V1 (deliberate; not in scope here).
- Effort key: **S** ≈ ≤1 day, **M** ≈ 2–4 days, **L** ≈ 1–2 weeks.

---

## Verification of the remediation plan's "COMPLETED" claims

Re-verified against code (not the plan's prose) before building on it. The plan is
trustworthy; the claims are substantially real. Confirmed true: 1.1 model tiering
(`pickModel` seam, Sonnet on `plan_replan`+`agent_run`), 1.2 dashboard Shopify seam
(zero raw `admin/api` outside `client.ts`; per-shop token bucket present), 1.4 base/support
context split (`types.ts:33/42/63`), 1.5/1.6 prompt skeleton + tool groups, 2.1/2.2/2.5
V1 surface (`/dashboard/review`, Telegram `SUMMARY`/`HELP`, `VoiceEdit`+`voice-synthesis`),
3.1 operator-channel consolidation, and non-test `tsc` clean (23 errors, all in `*.test.ts`).

**Two cracks the plan glosses over — both folded into the tracks below:**

1. **1.3 "de-stringed control flow" is incomplete where it matters most.** Executor and
   planner branch on structured `ToolStatus`, but **escalation still rides on a string
   prefix** — `escalateToHuman` returns `toolOk("__ESCALATED__: " + reason)` (`thread.ts:405`)
   and `run.ts:207`/`:285` detect it via `result.startsWith(ESCALATION_MARKER)`. The single
   most trust-critical signal is matched by sniffing model-facing text. → **Track 3.**
2. **The gateway bypasses the Shopify seam entirely.** `lookupShopifyCustomerName`
   (`gateway/message-handlers/shared.ts:60`) does a raw `fetch` against an inline `admin/api`
   literal — unthrottled, no client. The gateway has no Shopify client at all. Modules 2–3
   will add gateway-side Shopify calls. → noted; not in this plan's scope, flag for module #2.

---

## Track 3 — Escalation de-string *(do first; S; low risk)* — ✅ COMPLETED

**Why first:** escalation is the safety valve the autonomy raise leans on harder, and it's
the one trust-critical signal still matched by string prefix. Promote it to a real status
before any tier change trusts it.

- [x] `tools/result.ts`: extend `ToolStatus` (`ok | not_found | error` → add `escalated`); add a
  `toolEscalated(reason)` helper carrying the reason in a structured field, not a message prefix.
- [x] `tools/thread.ts`: `escalateToHuman` returns `toolEscalated(reason)` instead of
  `toolOk(ESCALATION_MARKER + reason)`. Keep all side effects (thread → pending, `needs_human`
  tag, log). Delete `ESCALATION_MARKER`.
- [x] `tools/executor.ts`: `TOOL_STATUS_TO_EXECUTE_STATUS` maps `escalated`; `ExecuteToolResult.status`
  union gains `escalated`.
- [x] `run.ts`: replace both `startsWith(ESCALATION_MARKER)` checks with `status === "escalated"`;
  set `escalationReason` from the structured reason. (Approved-plan path now gates on `escalationReason`
  directly; the `toolResults` re-scan was deleted.)
- [x] **Step 0:** `grep -rn ESCALATION_MARKER` to catch every consumer (planner,
  order-status-fast-path, tests) before changing the signal. Only remaining consumer is
  `packages/db/scripts/backfill-agent-actions.ts` — kept intentionally (reads legacy `note` rows).

**Tests:** [x] `thread.test.ts` (8/8), [x] `run-policy.unit.test.ts` (9/9) — both green; asserts
structured `status === "escalated"`. **Exit:** `escalate` eval category green after — ⏳ pending
(`test:evals`, real API).

---

## Track 1 — Eval hardening *(M–L; gates Track 2)*

Critical path. Shadow mode produces the real-traffic evidence, but the suite must be able to
certify the elevated tiers as the *entry* criterion — and there are currently **zero fixtures
for `broad`/`full`**, the trust-critical categories have 1–3 fixtures each, they flap ±2
run-to-run, each fixture runs once, and the judge is off in the gating run.

**1a. Fixture expansion** (`__evals__/fixtures/`):
- `escalate` (3 → ~9): payment-dispute, conflicting-instructions, post-fulfillment-cancel-request,
  suspected-fraud-handoff, multi-customer-ambiguity, tool-failure-mid-action.
- `refund` (3 → ~7): `refund-no-amount` (the F.2 amount-less block), refund-already-refunded,
  refund-partial, refund-over-daily-cap.
- `prompt-injection` (2 → ~6): **tool-result injection** (malicious instruction inside an order
  note / product review the agent reads), forwarded-email injection, instruction-in-customer-name.
  This is the surface that grows with modules 3–4 and is currently at 50%.
- `tier` (5 → ~10): **net-new `broad`/`full`** — tier-broad-refund-under-250 (auto),
  tier-broad-refund-over-250-escalate, tier-full-refund-in-policy-auto, tier-full-cancel-auto,
  tier-full-over-cap-still-escalates. Assert higher caps auto-execute *and* policy still bites above them.

**1b. Repeat-run harness** (`__evals__/runner.ts`, `index.test.ts`, `baseline.json` schema):
- Run each fixture `EVAL_REPEATS` times (default 1 local, ≥3 in the gated job); report
  **pass-rate per fixture**, not a single pass/fail.
- `baseline.json` gains per-fixture `passRate`/`repeats`; the gate compares pass-rate so a
  60%-flappy fixture is visibly distinct from a stable one.
- Document the API spend multiplier (N× current per-run cost).

**1c. Judge-on gating decision:** promote a small, cheap, high-signal rubric subset
(`no-overapology`, employee-voice) into the gating run; leave expensive subjective checks
nightly/non-gating. Record the decision.

**Exit:** trust-critical categories certified at a pass-rate threshold over repeats;
`broad`/`full` covered; injection ≥ target. This number is the entry criterion for Track 2's
shadow period.

---

## Track 2 — Autonomy raise + shadow mode *(M; depends on Track 1)*

**2a. Make `broad`/`full` real:**
- `prompt.ts` `buildAutonomySection`: remove the `effective = (broad|full) ? "trusted"` collapse
  (line 99); write distinct bodies — `broad`: refunds ≤ cap, bulk quotes, discount codes auto;
  `full`: anything in policy auto, only exceptions/escalations surface. Define exactly what each
  auto-does vs holds.
- `autonomy-tiers.ts`: `comingSoon` stays until shadow completes (it's the UI gate); flip when the
  shadow exit criterion is met.

**2b. Shadow/canary mechanism** (the chosen gate). Replace boolean `autoExecuteEnabled` with a
tri-state:
- New setting `autoExecuteMode: "off" | "shadow" | "live"` (migrate `autoExecuteEnabled` →
  `off`/`live`).
- In `shadow`: `classifyHomePlan` still computes `auto_execute`, but the execution path routes to
  **human approval exactly as today** — nothing auto-fires. The classification is recorded as a
  counterfactual.
- **New table `AutonomyShadowDecision`** (keyed by `turnId` — the shadow unit is per-plan, unlike
  per-tool-call `AgentAction`):
  `turnId, organizationId, threadId, tier, proposedMutationsHash, wouldAutoExecute(bool),
  humanDecision("approved_unchanged"|"edited"|"rejected"|"escalated"|"pending"),
  agreement(bool?), createdAt, resolvedAt`.
- **Agreement detection:** reuse `approvedPlanHash`/`hashPlan` — compare the human-approved/executed
  mutation set to the proposed one. `approved_unchanged` = agreement; `edited`/`rejected`/`escalated`
  = disagreement; `rejected`-when-it-would-have-auto-fired is the **dangerous cell** that must trend
  to ~0.
- **Readiness surface:** an Autonomy-readiness card (extend `/dashboard/review` or new) showing
  agreement rate over last N, split by tool + tier, and the would-have-auto-executed-but-human-rejected
  count. This is what's watched before flipping `shadow → live`.

**2c. Resolve F.3** (open from remediation plan): tune the support prompt so unresolved-customer
WISMO replies-for-more-info before escalating. Matters more now that elevated tiers auto-fire.
Re-baseline after.

---

## Track 4 — Fraud-risk flag monitor spike *(L, time-boxed ~1 week; parallel)*

**Purpose: answer the deferred remediation-plan 3.4 — does the generalized core carry
non-conversational, entity/monitoring work, or is it thread-locked?** Validation, not a shipped
feature. Throwaway, flag-gated, never reaches merchants.

- `gateway/maintenance/order-risk-monitor.ts`: scheduled worker; query recent unfulfilled orders per
  org (batch, window); per order, gather risk signals from the Shopify payload (billing/shipping
  mismatch, high-value new customer, repeated failed payments).
- **The crux — a thread-less agent run.** Today `buildContext(threadId, orgId)` requires a thread and
  `AgentContext = SupportContext` carries `thread`/`customer`; `run.ts` reads `ctx.thread.id`,
  `ctx.thread.channelType`, `ctx.customer.id` throughout, and the planner's forced-`send_reply` phase
  is support-shaped. The spike constructs a `BaseAgentContext`-only run (new
  `buildOrderOpsContext(orderId, orgId)` + an `OrderOpsContext` with no thread) and routes it through a
  run path that doesn't assume `ctx.thread`. **Where that breaks is the deliverable.**
- Tools: a minimal `order` group + reuse `escalate_to_human`; action is "flag/escalate," no new schema
  (log the finding; don't build an `OrderFlag` entity for a spike).
- Governance: runs through autonomy/spend/policy/audit per the 3.3 ruling (judgment work uses the
  agent stack).
- **Deliverable: a written finding** — "the core carried it with these N changes" *or* "the core is
  thread-locked at these files/lines." This is the data point that tells you whether the five-module
  roadmap rests on solid ground or needs a `buildContext` refactor first.

---

## Sequencing & effort

```
Track 3 (escalation de-string, S) ─┐
                                   ├─> Track 1 (eval hardening, M–L) ─> Track 2 (autonomy + shadow, M) ─> [watch shadow] ─> flip live
Track 4 (fraud spike, L) ──────────┘   (independent; parallel; informs roadmap, not the autonomy gate)
```

- **Track 3** unblocks trusting escalation under higher autonomy — first. ✅ done (eval gate pending).
- **Track 1** is the entry gate for **Track 2**; do not start the shadow period without the expanded
  suite green.
- **Track 2's** shadow→live flip is gated by *real-traffic agreement*, not evals.
- **Track 4** is independent and parallel; it informs the module roadmap, not the autonomy gate.

---

## Decisions still open (set when the data exists, not now)

1. **Shadow→live thresholds:** agreement rate, minimum mutation count, and window before flipping
   `shadow → live`. Set after the first week of real agreement data.
2. **`full` vs `broad` behavioral delta:** exact auto/hold split in the prompt — easier to pin once
   Track 4 reveals whether there's an order-ops surface wanting its own tier semantics.
3. **Fraud-spike follow-through:** if Track 4 finds the core is thread-locked, whether that triggers a
   `buildContext`/`AgentContext` refactor *before* module #2 or accepts a thread-shim. Decide on the finding.
