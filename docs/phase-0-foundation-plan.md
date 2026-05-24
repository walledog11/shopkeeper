# Phase 0 Foundation Plan

Sequenced implementation plan for the foundation work that needs to land before V1 ships and before the runtime extraction (Phase 1). Output of the strategic audit on 2026-05-23.

Goal: ship V1 of support with the foundation that the broader pivot needs. Everything here happens *before* V1 launches and *before* the runtime extraction. Total scope: ~5–6 focused weeks if done one-after-the-other; some steps can overlap to compress to ~4 weeks.

Each step lists: what lands, file-level work, dependencies, effort (S = <2 days, M = 2–5 days, L = >5 days), and open decisions still needed.

---

## Step 0 — Housekeeping (S, no dependencies)

Small wins that should land first because they clear noise and unblock CI signal.

**Fix the two DB-mocking test files** (violates CLAUDE.md "never mock the DB" rule).
- `apps/dashboard/src/lib/server/org.test.ts`: replace `vi.mock("@clerk/db")` with `createTestOrg` from `packages/db/test-helpers.ts`. The test setup pattern is in `runner.test.ts`.
- `apps/dashboard/src/lib/agent/api/dashboard-approval.test.ts`: same treatment. Real DB writes via `createTestOrg`, `createTestThread`, `createTestMessage`, cleanup via `cleanupTestData`.

**Remove the demo-notifications TODO**.
- `apps/dashboard/src/app/dashboard/layout.tsx:19` — strip the hardwired demo notifications. The comment says "remove before shipping" and we're heading toward shipping.

**Pull TikTok from the marketing site or downgrade it to a roadmap mention.** TikTok stays pending in scope; the landing page currently advertises it as a channel. Either move it under "coming soon" copy or remove the logo from the channel showcase to avoid promising a stub.
- `apps/dashboard/src/app/(marketing)/_components/Channels.tsx` — adjust copy.

---

## Step 1 — Eval harness, Layer 1 (M, no dependencies)

Land this first. Every subsequent step in Phase 0 modifies the prompt or the planner; without the harness you cannot tell whether you regressed.

**Layout decision.** Eval files sit next to the runtime — wherever the runtime lives, the evals live. Today the runtime is in `apps/dashboard/src/lib/agent/`. So evals go in `apps/dashboard/src/lib/agent/__evals__/`. When the runtime moves to `packages/agent` in Phase 1, the evals move with it.

**New files.**

`apps/dashboard/src/lib/agent/__evals__/types.ts`
- Defines `Fixture`: `{ id: string, description: string, setup: ThreadSetup, instruction: string, expectedPlan: ExpectedPlan }`
- `ThreadSetup`: messages array, customer profile, orders state, KB articles, org settings overrides (so a fixture can test the "Tier guarded, $50 cap" behavior in isolation)
- `ExpectedPlan`: `{ mustCallTools: string[], mustNotCallTools: string[], mustEscalate?: boolean, replyMustInclude?: string[], replyMustNotInclude?: string[], tier?: AutonomyTier }`

`apps/dashboard/src/lib/agent/__evals__/runner.ts`
- `runFixture(fixture)`: creates an isolated org + thread via existing `test-helpers`, seeds messages and customer data, calls `planAgent` (NOT `runAgent` — planning is deterministic enough to test, execution is too side-effectful), asserts.
- Returns a structured `EvalResult`: `{ id, pass, failures: string[], usage, latencyMs }`.
- Uses real Anthropic API (no mocking) — that's the point.

`apps/dashboard/src/lib/agent/__evals__/index.test.ts`
- A vitest suite that loads every fixture from `./fixtures/*.json`, runs each through `runFixture`, asserts pass.
- Tagged so it can be run separately from unit tests: `pnpm test:evals`.

`apps/dashboard/src/lib/agent/__evals__/fixtures/` — initial corpus of 20–25 cases:
- 4 order-status (with and without order number, with and without resolved customer, ambiguous customer match)
- 3 refund (under cap, at cap, over cap → expect escalate)
- 2 cancel (allowed, blocked by `blockCancellations` policy)
- 3 address-change (pre-fulfillment OK, post-fulfillment escalate, missing required fields)
- 2 KB-policy questions (article present, no article present → expect honest "I'm not sure")
- 2 multi-step (refund + reply, address change + reply)
- 2 prompt-injection attempts (customer trying to manipulate the agent)
- 2 escalation triggers (Shopify down, out-of-scope question)
- 2 quick-reply auto-approval candidates
- 3 operator-channel cases (concierge: "what's Jane's order status?")

**Existing files to edit.**

`apps/dashboard/package.json` — add `"test:evals": "vitest run --config vitest.integration.config.ts src/lib/agent/__evals__"`.

`.github/workflows/` — add an eval-on-PR job. Gate on `paths: ['apps/dashboard/src/lib/agent/**', 'apps/dashboard/src/lib/messaging/**']`. Use a separate workflow or a step in the existing CI so it doesn't run on doc-only PRs.

**Anthropic prompt caching, while you're here.** The eval suite hammers the same system prompt 25+ times per CI run. Enable Anthropic prompt caching on the system prompt in `apps/dashboard/src/lib/agent/run.ts` and `planner.ts`. One-line change: add `cache_control: { type: "ephemeral" }` to the system prompt block. Cuts input cost by ~80% and benefits production too. The eval harness is the perfect place to validate it works without behavior change.

**Effort.** 5 days for harness + 20–25 fixtures + CI wiring. Each subsequent fixture ~30 minutes.

**Open decisions.**
- **Do you want eval CI to gate merges, or just report?** Recommended: start non-blocking (report only, like a check that can fail without blocking merge) for the first month, then flip to blocking once the corpus stabilizes. Pre-blocking creates flaky-CI fatigue if fixtures aren't yet stable.
- **Synthetic fixtures only, or seed with redacted prod data?** Synthetic is sufficient for V1; redacted-prod replay is a Layer 3 problem.

---

## Step 2 — Brand voice + sample replies wiring (S, depends on Step 1)

Trivial code change, large perceived-quality lift. Eval-gated by Step 1.

Current state: `brandVoice` and `aiContext` are collected at onboarding and displayed in the settings UI, but **never inserted into the system prompt**. They are dead inputs. Every merchant gets the same prompt.

**Schema change** in `packages/db/prisma/schema.prisma`:
- No table change needed for the 200-char tone brief (`brandVoice`) and `aiContext`; they already exist in `OrgSettings` JSON.
- For sample replies, add to the same JSON: `sampleReplies: { id: string, body: string, context?: string }[]`. Capped to ~10 entries to bound prompt size. Stored in `Organization.settings.sampleReplies`. No migration needed since settings is `JsonB`.

**Type change** in `apps/dashboard/src/types/index.ts`:
- Extend `OrgSettings` with `sampleReplies?: SampleReply[]`.
- Add `SampleReply` interface.

**Settings default** in `apps/dashboard/src/lib/agent/settings.ts`:
- Add `sampleReplies: []` to `AGENT_SETTINGS_DEFAULTS`.

**Prompt wiring** in `apps/dashboard/src/lib/agent/prompt.ts`:
- In `buildSystemPrompt`, after the `## Integrations` block and before `## Instructions`, render a `## About this store` section if `aiContext` is non-empty.
- Render a `## Voice` section if `brandVoice` is non-empty.
- Render a `## Sample replies (match this style)` section if `sampleReplies.length > 0`. Pick 3 — either at random or by tag-matching against the thread's tag. Keep each ≤ ~300 chars to bound prompt size.
- Mirror in `buildComposerAskPrompt`.

**UI** in `apps/dashboard/src/app/dashboard/settings/_components/AgentTab.tsx`:
- Already has inputs for `aiContext` and `brandVoice`. Add a sample-replies section: text-area, add/remove rows, char counter, max 10 entries.

**New eval fixtures** in Step 1's corpus:
- 2 cases that set `brandVoice: "warm, slightly informal, sign off with 'cheers'"` and `expectedPlan.replyMustInclude: ["cheers"]`.
- 1 case with sample replies for "shipping delay" and assert the agent's reply matches the structural pattern.

**Effort.** 2 days including UI polish.

**Open decisions.**
- **Sample reply selection strategy** when `sampleReplies.length > 3`: pick 3 at random per request (cheap, fine), pick by tag match (better), or use embeddings to pick top-3 by semantic similarity to the current message (best, but adds a vector store). Recommendation: tag match for V1, embeddings later.
- **Char budget per sample reply**: 300 or 500? Affects total prompt size with 10 samples × 5 included.

---

## Step 3 — Bias-to-escalate + remove forced `tool_choice` (S, depends on Step 1)

The prompt currently pushes hard toward action ("Every task MUST be completed by calling a tool"). For the trust principle, the agent needs an explicit uncertainty pathway.

**Prompt rewrite** in `apps/dashboard/src/lib/agent/prompt.ts`:

In `buildSystemPrompt` (both operator and support branches), add a clause near the top of the instructions:
> When you are uncertain about a customer's identity, the right action, or whether a request is in scope, call `escalate_to_human` instead of guessing. Confident wrong actions are far worse than honest escalations. If a tool fails and you cannot recover, escalate.

Remove the "Every task MUST be completed by calling a tool" absolute. Replace with: "Take action only when you are confident. When you are not, escalate."

**Remove the first-iteration `tool_choice` forcing** in `apps/dashboard/src/lib/agent/run.ts:258`:
- Current: `...(operatorMode && !readOnly && i === 0 && tools.length > 0 ? { tool_choice: { type: "any" } } : {})`
- This forces a tool call on the operator's first iteration even when the right answer might be "I need more info" or "you should handle this." Strip it. If the planner produces no tool calls in legitimate operator queries, fix it via prompt, not via forcing.

**Verify the planner's third-call "force send_reply" path** in `planner.ts:243` does the same thing for support mode. It uses `tool_choice: { type: "any" }` with only `send_reply` available — this forces a customer-facing reply even when escalation might be right. Same treatment: remove, or guard behind a "if the agent already escalated, skip the force-reply phase" check (look for the `escalate_to_human` tool call in `rawToolCalls` before doing the third LLM call).

**New eval fixtures**:
- 3 cases where the agent should escalate: out-of-scope question, ambiguous customer match, Shopify-tool simulated failure (need a way to inject a tool failure for the test — easiest via a special `__test_simulate_failure__` arg on a wrapped executor).
- 2 cases where the agent should NOT call any tool: "thanks!" customer reply, single-word ambiguous request.

**Effort.** 1–2 days. Most of the work is verifying the eval harness catches the change correctly, not the code edits.

**Open decisions.**
- **How strict on bias-to-escalate?** If you tune the prompt too far, the agent escalates everything and the auto-pilot value evaporates. The eval suite needs cases on both sides — "should escalate" AND "should NOT escalate" — to keep this in calibration.

---

## Step 4 — Autonomy tier wiring (M, depends on Steps 1–3)

The 5 tiers (`watch`/`guarded`/`trusted`/`broad`/`full`) exist as labels collected at onboarding but the runtime doesn't read them. They are flattened into legacy booleans + caps at onboarding, then the tier name is stored but ignored downstream. Wire them properly.

**Settings resolver** in `apps/dashboard/src/lib/agent/settings.ts`:
- Rewrite `resolveAgentSettings`. Order of precedence: defaults → tier-derived → explicit overrides.
- Define `TIER_DEFAULTS: Record<AutonomyTier, Partial<OrgSettings>>` mapping tier → derived field values. Reuse the table currently in `onboarding/_components/model.ts:53-57` but extend it with autonomy implications (e.g., `watch` also gets `toolsEnabled: { action: false, ... }`).
- The existing legacy fields (`requireApprovalForActions`, `maxRefundAmount`, `alwaysDraftReply`, `blockCancellations`) remain — they're now overrides on top of the tier, not the primary policy.

**Onboarding logic** in `apps/dashboard/src/app/(onboarding)/onboarding/page.tsx:146`:
- Currently the onboarding flattens the tier into legacy settings on submit. Change this: write only `autonomyTier` to the org. Let `resolveAgentSettings` do the derivation at read time. This means changing the tier later (post-onboarding) actually changes behavior without having to back-fill legacy fields.

**Onboarding mapping file** `apps/dashboard/src/app/(onboarding)/onboarding/_components/model.ts`:
- The tier → settings table moves into `settings.ts` (`TIER_DEFAULTS`) so the runtime owns it. Onboarding imports from there.

**Prompt branching** in `apps/dashboard/src/lib/agent/prompt.ts`:
- Add a `## Your autonomy` section after `## Instructions`:
  - `watch`: "Draft replies and plan actions but never execute. Always require approval."
  - `guarded`: "Auto-reply to information questions. For any mutative action (refund, cancel, edit, address change), present a plan for approval and do not execute until approved."
  - `trusted`: "Auto-reply to information questions. Auto-execute small refunds (≤ $X), address changes before fulfillment, and shipping replies. For cancellations, refunds above $X, or order edits, present a plan for approval."
  - `broad` / `full`: defer to Phase 1, keep them in the type but route them as `trusted` for V1 (with a banner in the UI: "Coming soon: extended autonomy modes").
- Compute the cap values from `resolvedSettings.maxRefundAmount` etc. so the prompt and runtime agree.

**Plan classification** in `apps/dashboard/src/lib/agent/plan-preview.ts`:
- Add a third `HomePlanKind`: `"auto_execute"`. Currently `"quick_reply" | "needs_review"`.
- `classifyHomePlan` becomes tier-aware: in `trusted`, a refund under cap classifies as `auto_execute` (the dashboard should run it immediately, not surface an approval card); in `guarded`, the same plan classifies as `needs_review`.
- Quick-reply behavior unchanged in `watch`/`guarded` (they still show the card); in `trusted+`, quick-replies just send.

**Approval routing** in:
- `apps/dashboard/src/app/api/agent/quick-approve/route.ts` — already exists for `quick_reply`; extend to handle `auto_execute`.
- `apps/dashboard/src/lib/agent/api/dashboard-approval.ts` — `shouldPlanBeforeExecuting` becomes tier-aware: in `trusted+`, only plan-before-executing if the action is above tier caps.
- The auto-plan-on-open path in the gateway: if the plan classifies as `auto_execute`, the dashboard should run it without merchant intervention (with audit trail per Step 5). Right now plans always wait for approval.

**Settings UI** in `apps/dashboard/src/app/dashboard/settings/_components/AgentTab.tsx`:
- Add a tier selector at the top of the page (radio group with the 5 tiers, descriptive text per tier).
- Show "(coming soon)" on `broad` and `full` until you decide to enable them.
- Make the legacy fields (`requireApprovalForActions`, `maxRefundAmount`) explicit overrides on the tier — show the tier default value, let the merchant override per-field.

**Visibility** somewhere persistent — `apps/dashboard/src/app/dashboard/_components/DashboardHeader.tsx` or the sidebar:
- A small pill: "Autopilot: Trusted" with click-to-edit. Per the trust principle, the merchant should always know how much rope the agent has.

**New eval fixtures**:
- The same refund case run under three tiers: `watch` → expect plan only, no execution; `guarded` → expect plan with approval required; `trusted` (under cap) → expect `auto_execute` classification.
- Tier override test: tier `trusted` but `blockCancellations: true` → cancellation request must still escalate.

**Effort.** 4 days including UI work and the planner-classification edit.

**Open decisions.**
- **`alwaysDraftReply`**: it's in the tier table and `OrgSettings` but its runtime usage hasn't been traced. Verify before wiring. If it's another dead field, fold it into the tier system or remove.
- **Should `watch` block action tools entirely** via `toolsEnabled`, or just disable execution? Block entirely — the planner can still propose them as drafts, but they cannot be called in `runAgent`. Cleaner trust story.
- **Auto-execute UX**: when a `trusted` merchant's agent auto-sends a reply, should the merchant see a real-time notification ("agent just replied to Jane")? Yes — this is what gives the merchant confidence to stay on the tier. Telegram already does some of this; extend.

---

## Step 5 — Action audit table (M, depends on Step 1)

Stop overloading `Message.note` rows with parsed JSON. Make action records first-class.

**Schema migration** in `packages/db/prisma/schema.prisma`:

```prisma
model AgentAction {
  id              String   @id @default(uuid()) @db.Uuid
  organizationId  String   @map("organization_id") @db.Uuid
  threadId        String?  @map("thread_id") @db.Uuid
  customerId      String?  @map("customer_id") @db.Uuid
  tool            String   @db.VarChar(64)
  category        String   @db.VarChar(32)
  input           Json     @db.JsonB
  output          String?  @db.Text
  status          String   @db.VarChar(32)
  errorDetail     String?  @map("error_detail") @db.Text
  mode            String   @db.VarChar(32)
  approverId      String?  @map("approver_id") @db.VarChar(255)
  approvedAt      DateTime? @map("approved_at") @db.Timestamptz
  approvedPlanHash String?  @map("approved_plan_hash") @db.VarChar(64)
  instructionHash String?  @map("instruction_hash") @db.VarChar(64)
  executedAt      DateTime @default(now()) @map("executed_at") @db.Timestamptz
  durationMs      Int      @map("duration_ms")
  organization    Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  thread          Thread?      @relation(fields: [threadId], references: [id], onDelete: SetNull)
  @@index([organizationId, executedAt(sort: Desc)])
  @@index([organizationId, threadId])
  @@index([organizationId, tool, executedAt])
  @@index([organizationId, status])
  @@map("agent_actions")
}
```

- `status`: `success` | `error` | `policy_block` | `escalated`
- `mode`: `human_approved` | `auto_executed` | `read_only`
- `category`: mirrors `TOOL_CATEGORIES` value
- `approvedPlanHash`: hash of the cached plan at approval time, lets you verify "the executed plan matches what the merchant approved"

Run the migration. Add the back-relation on `Organization` and `Thread`.

**Writer** — change `apps/dashboard/src/lib/agent/run.ts`:
- Currently `actionsPerformed.push({ tool, result })`. Extend `ActionEntry` in `types.ts` to include `input`, `durationMs`, `status`, `mode`.
- In `executeToolCall`, capture start time, input (already in scope), and stash everything.
- After each tool call, write to `AgentAction` via a new helper `recordAgentAction(orgId, threadId, customerId, action, mode, approvalContext)`. Don't write inside the loop synchronously — buffer and flush at finish to avoid blocking the agent loop, but flush before `finish()` returns.
- Pass the approval context (approverId, approvedAt, approvedPlanHash) through to the executor when the run is from `approvedToolCalls`. Pass `mode: "auto_executed"` when from `auto_execute` classification.

**Read path** — `apps/dashboard/src/lib/agent/api/action-log.ts`:
- Rewrite to query `AgentAction` instead of parsing `__clerk_agent__` notes.
- Keep the parse-from-notes path as fallback for historic data, or run a one-shot backfill script (`packages/db/scripts/backfill-agent-actions.ts`) to migrate existing notes. Lean backfill — clean break is better.
- CSV export endpoint at `/api/agent/actions` reads from the new table.

**UI consumer** — the agent action log page wherever it lives (`/dashboard/activity` likely):
- New columns become available: input (rendered as JSON), mode (human-approved vs auto-executed), approver, duration. Add at least mode as a column since merchants will want to filter on "what did the agent do without asking me?"

**Side effect**: the existing `lib/agent/api/turns.ts:serializeAgentTurn` writes the JSON-into-a-note pattern. Once `AgentAction` is the source of truth, the note becomes optional. Keep writing a thread-scoped summary note (human-readable, no parsing required) for the threads UI to render the agent's turn in-line, but the structured record lives in `AgentAction`.

**New eval fixtures**: validate that runs against `AgentAction` rows match the plan. After running a fixture, query `AgentAction` for the test thread and assert `tool`, `status`, `mode` match the expected plan.

**Effort.** 4–5 days. The migration is small, the writer is straightforward, the read-path rewrite is the bulk of it, and there's a small backfill script.

**Open decisions.**
- **Backfill old `__clerk_agent__` note rows into `AgentAction` once, or leave as-is and start fresh?** Backfill — the dashboard will show a more useful action history immediately, and the legacy parsing code can be deleted.
- **`approverId` format**: Clerk user ID, or Clerk user ID + display name denormalized? Denorm trades a small storage hit for not needing to join into Clerk's user store every time. Recommend denorm.
- **Input redaction**: tool inputs may contain customer PII (emails, addresses). Audit-log retention policy needs to align with PII policy. Keep raw inputs but redact on display, or redact on write? Probably keep raw + redact-on-read.

---

## Step 6 — Customer memory (L, depends on Steps 1–5)

The largest Phase 0 piece. The biggest perceived-quality lift. Land after everything else so it inherits all the new wiring.

**Schema** in `packages/db/prisma/schema.prisma`:

Two options. Recommend Option A.

**Option A (recommended): JSON column on Customer.**
```prisma
model Customer {
  ...
  memory          Json?    @default("{}") @db.JsonB
  memoryUpdatedAt DateTime? @map("memory_updated_at") @db.Timestamptz
  ...
  @@index([organizationId, memoryUpdatedAt])
}
```
- Memory shape: `{ summary: string, keyFacts: string[], policyFlags: { vip?, complaintPattern?, priorRefundsTotal?, priorRefundsCount? }, recentInteractions: { threadId, channel, tag, closedAt, outcome }[], version: number }`
- One row per customer; one update path; cascades with customer deletion automatically.

**Option B: separate `CustomerMemory` table.**
- Better if you want versioned history (every memory update creates a new row) or per-org-shared memory primitives. Probably overkill for V1.

Recommendation: A. Migrate to B later if you need version history.

**Writer worker** in the gateway (where workers live):

New file `apps/gateway/src/maintenance/customer-memory.ts`:
- Exports `updateCustomerMemoryOnThreadClose(threadId)`.
- Triggered by a thread status change to `closed` (need a hook — either patch `updateThreadStatus` in `lib/agent/tools/thread.ts` to fire it, or wire a BullMQ job that listens to thread updates via a polling worker; the simpler path is the patch).
- Loads the thread, its messages, and the customer's existing `memory`.
- Calls Claude with a focused summarization prompt: "Given the customer's prior memory and this new closed thread, output an updated memory JSON. Preserve facts. Don't speculate."
- Bounded output schema (use the SDK's structured output or JSON-mode). Token budget ~512 output.
- Writes back `customer.memory` and `memoryUpdatedAt`.
- Respects `enforceSpendCap` like every other Claude call.

**Worker also runs** on a rolling cron for customers with stale memory (`memoryUpdatedAt older than 30 days and recent thread activity`). Add to `apps/gateway/src/maintenance/workers.ts`.

**Reader** — `apps/dashboard/src/lib/agent/context.ts`:
- Load `customer.memory` alongside the existing fields.
- Add to `AgentContext`: `customerMemory: CustomerMemory | null`.

**Prompt rendering** — `apps/dashboard/src/lib/agent/prompt.ts`:
- Render a `## What you know about this customer` section in `buildSystemPrompt` when memory is non-empty. Include `summary`, top 3 `keyFacts`, and `recentInteractions` summary (last 3).
- Render `policyFlags` as instructions: if `complaintPattern`, prompt "this customer has filed multiple complaints this quarter — bias toward escalation"; if `vip`, prompt "this is a high-value customer."

**UI** — surface the memory so the merchant can audit and edit it:
- A "Customer profile" panel in the ticket view, currently sparse. Add a memory section with the summary and key facts. Let the merchant edit. Edits persist directly to the memory JSON (no re-summarization needed; the next thread close will fold them in).
- This addresses the "trust calibration" concern: the merchant can see what the agent thinks it knows.

**New eval fixtures**:
- Customer with memory `{ summary: "prior shipping complaint pattern", keyFacts: ["3 refunds in 30 days"] }` and a new refund request — assert the agent escalates rather than auto-refunds.
- Customer with memory `{ keyFacts: ["VIP, signed up 2024"] }` and a routine question — assert the reply tone reflects VIP context.
- Customer with empty memory — assert the agent runs as today (no memory section in prompt, no behavior change). This is the "doesn't regress" gate.

**Effort.** 8–10 days including the worker, schema, context wiring, prompt rendering, UI editor, and eval coverage.

**Open decisions.**
- **Memory refresh trigger**: on thread close (simple, recommended), on every customer message (more accurate but expensive), or hybrid (close + every 5th message)? Start with close-only. Add hybrid if eval shows staleness regressions.
- **Memory caps**: how many `keyFacts`? How long can `summary` be? Bound to keep prompt size sane. Start: `summary ≤ 500 chars`, `keyFacts ≤ 10 items × 80 chars each`, `recentInteractions ≤ 10`.
- **Cross-merchant signal sharing**: NO. Per-merchant customer memory only. Sharing customer facts across merchants is a privacy violation. State this explicitly in the privacy policy.
- **Memory in customer data export**: yes, include in GDPR export at `/api/org/data`. Include in customer-delete cascades automatically via the schema.
- **Worker is in gateway, agent is in dashboard**: customer-memory generation happens in the gateway via internal API back to dashboard for the Claude call, or the gateway calls Claude directly. The gateway already calls Claude in `intelligence.ts` — that pattern works here. No new round-trip needed.

---

## Step 7 — LLM-judge eval, Layer 2 (S–M, can overlap with Step 6)

Adds qualitative checks on top of the plan-shape suite. Particularly useful for verifying brand voice (Step 2) and customer memory (Step 6) are actually doing what we think.

**Extend the runner** in `apps/dashboard/src/lib/agent/__evals__/runner.ts`:
- Add an optional `expectedRubric` field to `Fixture`: `{ checks: string[] }` (e.g., `["reply must use a warm tone matching brandVoice", "reply must not promise a refund"]`).
- After calling `planAgent` and asserting plan shape, if `expectedRubric` is set: execute the plan against a **stubbed tool surface** (a `MockExecutor` that returns canned strings — no real Shopify calls), capture the agent's final reply text, send it to Claude with the rubric as a judge prompt, parse pass/fail with reasoning.
- Judge returns structured: `{ checkId: string, pass: boolean, reasoning: string }[]`.

**New file** `apps/dashboard/src/lib/agent/__evals__/judge.ts`:
- The judge prompt and call. Single function: `judgeReply(rubric, replyText, context) → JudgeResult`.

**Extend fixtures** in Steps 2 and 6's coverage:
- Brand-voice fixtures get rubrics: "reply matches the brand voice description provided in settings."
- Customer-memory fixtures get rubrics: "reply references the customer's prior interactions naturally."
- Bias-to-escalate fixtures get rubrics: "agent acknowledges uncertainty rather than fabricating a confident answer."

**Effort.** 3–4 days.

**Open decisions.**
- **Judge model**: Sonnet 4.6 is sufficient and cheap. Opus 4.7 only if you want premium judgment for tight cases. Recommendation: Sonnet 4.6 for all judging.
- **Pass threshold**: per-check pass/fail (strict) or aggregate score (lenient)? Per-check, with the fixture marking which checks are required vs informational.

---

## Sequencing summary

| Order | Step | Effort | Dependencies | Can overlap |
|-------|------|--------|--------------|-------------|
| 0 | Housekeeping | S | — | Any |
| 1 | Eval harness Layer 1 | M | — | Step 0 |
| 2 | Brand voice + sample replies | S | Step 1 | Step 3 |
| 3 | Bias-to-escalate + tool_choice | S | Step 1 | Step 2 |
| 4 | Autonomy tier wiring | M | Steps 1–3 | Step 5 (partial) |
| 5 | Action audit table | M | Step 1 | Step 4 (partial) |
| 6 | Customer memory | L | Steps 1–5 | Step 7 |
| 7 | LLM-judge eval Layer 2 | S–M | Step 1 | Step 6 |

Sequential timeline: ~5–6 working weeks.

With sensible parallelism (Step 2 & 3 in same week, Step 4 & 5 in overlapping weeks, Step 6 & 7 overlapping): ~4 weeks.

After Phase 0 lands, re-evaluate before starting Phase 1 (runtime extraction to `packages/agent`). The eval harness lets you do that extraction without flying blind — exactly why it's sequenced first.

---

## What lands at the end of Phase 0

- Every prompt or tool change is regression-tested by an eval harness with ~30 fixtures and rubric-based reply quality checks.
- Brand voice and store context actually influence agent replies.
- Merchants can upload sample replies; the agent imitates them.
- The agent has an explicit "I'm not sure" pathway and the prompt biases toward escalation.
- The autonomy tier the merchant picks at onboarding actually changes runtime behavior, and the merchant can change it from the dashboard.
- Every agent action is recorded as a structured row with input, output, approver, mode, and plan hash — auditable end-to-end.
- The agent has per-customer memory across threads — it actually remembers.
- Anthropic prompt caching is enabled, cutting input token costs ~80%.
- The CI gate prevents regressions on all of the above.
- The two DB-mocking tests are fixed.
- TikTok marketing copy aligns with reality.

V1 is shippable from this point. Phase 1 (runtime extraction) is the next thing, and it's substantially easier because everything above is now eval-protected.

---

## Open decisions to settle before starting

These need direction before any code is written:

1. **Eval CI gating**: non-blocking-then-blocking, or blocking from day one? Default: non-blocking for 4 weeks, then blocking.
2. **Action audit backfill**: backfill existing `__clerk_agent__` notes into `AgentAction`, or fresh start? Default: backfill once.
3. **Customer memory refresh trigger**: thread-close only, or hybrid? Default: close-only for V1.
4. **Sample-reply selection strategy**: random / tag-match / embeddings? Default: tag-match for V1.
5. **`broad` and `full` tiers for V1**: keep visible-but-disabled, or hide entirely? Default: visible but labeled "coming soon" — sets the merchant expectation that more autonomy is on the roadmap.
6. **Worker location for customer memory**: gateway (with its own Claude calls), or call back to dashboard? Default: gateway calls Claude directly — same pattern as `intelligence.ts` today.
7. **`alwaysDraftReply`** behavior in the runtime — does it currently do anything? Verify; if it's a dead field, fold into tier semantics.
