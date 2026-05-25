# Phase 0 Foundation Plan

Sequenced implementation plan for the foundation work that needs to land before V1 ships and before the runtime extraction (Phase 1). Output of the strategic audit on 2026-05-23.

Goal: ship V1 of support with the foundation that the broader pivot needs. Everything here happens *before* V1 launches and *before* the runtime extraction. Total scope: ~5–6 focused weeks if done one-after-the-other; some steps can overlap to compress to ~4 weeks.

Each step lists: what lands, file-level work, dependencies, effort (S = <2 days, M = 2–5 days, L = >5 days), and open decisions still needed.

---

## Step 0 — Housekeeping (S, no dependencies) [COMPLETED]

Small wins that should land first because they clear noise and unblock CI signal.

**Fix the two DB-mocking test files** (violates CLAUDE.md "never mock the DB" rule).
- `apps/dashboard/src/lib/server/org.test.ts`: replace `vi.mock("@clerk/db")` with `createTestOrg` from `packages/db/test-helpers.ts`. The test setup pattern is in `runner.test.ts`.
- `apps/dashboard/src/lib/agent/api/dashboard-approval.test.ts`: same treatment. Real DB writes via `createTestOrg`, `createTestThread`, `createTestMessage`, cleanup via `cleanupTestData`.

**Remove the demo-notifications TODO**.
- `apps/dashboard/src/app/dashboard/layout.tsx:19` — strip the hardwired demo notifications. The comment says "remove before shipping" and we're heading toward shipping.

**Pull TikTok from the marketing site or downgrade it to a roadmap mention.** TikTok stays pending in scope; the landing page currently advertises it as a channel. Either move it under "coming soon" copy or remove the logo from the channel showcase to avoid promising a stub.
- `apps/dashboard/src/app/(marketing)/_components/Channels.tsx` — adjust copy.

---

## Step 1 — Eval harness, Layer 1 (M, no dependencies) [COMPLETED]

Land this first. Every subsequent step in Phase 0 modifies the prompt or the planner; without the harness you cannot tell whether you regressed.

Broken into 5 sub-steps, each independently shippable as its own PR. Total scope unchanged: ~5 working days. Sub-step order matters — the pilot fixture in 1.1 validates the runner before you invest in writing 20+ more, prompt caching in 1.2 lands cheaply once you have a way to observe the cache, and CI in 1.5 waits until the corpus is broad enough to be a meaningful signal.

**Layout decision (applies to all sub-steps).** Eval files sit next to the runtime — wherever the runtime lives, the evals live. Today the runtime is in `apps/dashboard/src/lib/agent/`. So evals go in `apps/dashboard/src/lib/agent/__evals__/`. When the runtime moves to `packages/agent` in Phase 1, the evals move with it.

---

### Step 1.1 — Harness scaffolding + pilot fixture (~1 day) [COMPLETED]

Goal: `npm run test:evals -w apps/dashboard` runs end-to-end against one fixture locally and prints a structured result. Proves the plumbing before you invest in fixture content.

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
- Tagged so it can be run separately from unit tests: `npm run test:evals -w apps/dashboard`.

`apps/dashboard/src/lib/agent/__evals__/fixtures/order-status-basic.json` — single pilot fixture: resolved customer asks "where is my order?" with one recent order in state. Expected: `mustCallTools: ["get_order_status", "send_reply"]`.

**Existing files to edit.**

`apps/dashboard/package.json` — add `"test:evals": "node ../../scripts/with-test-env.mjs vitest run --config vitest.integration.config.ts src/lib/agent/__evals__"`.

**Done when.** `npm run test:evals -w apps/dashboard` runs locally against the pilot fixture with `ANTHROPIC_API_KEY` set, hits real Anthropic, passes, and prints latency + token usage.

---

### Step 1.2 — Anthropic prompt caching (~0.5 day) [COMPLETED]

Independent of fixture content, but easiest to validate now that the harness can re-run the same prompt back-to-back and observe cache hits.

**Edits.**

`apps/dashboard/src/lib/agent/run.ts` and `apps/dashboard/src/lib/agent/planner.ts`:
- Add `cache_control: { type: "ephemeral" }` to the system prompt block in each Claude call.

**Verification.** Run the pilot fixture twice in succession; the second response should report `cache_read_input_tokens > 0`. Cuts input cost ~80% — benefits the eval suite immediately and production going forward.

**Done when.** Two consecutive `npm run test:evals -w apps/dashboard` runs show cache hits on the second.

---

### Step 1.3 — Read-path fixture corpus (~1 day) [COMPLETED]

Build out the easier, deterministic fixtures first. Read paths are more stable across LLM nondeterminism than mutative actions — good place to shake out runner bugs before tackling the hard cases.

**New fixtures** (~9 cases):
- 4 order-status (with and without order number, with and without resolved customer, ambiguous customer match)
- 2 KB-policy questions (article present, no article present → expect honest "I'm not sure")
- 3 operator-channel cases (concierge: "what's Jane's order status?")

**Done when.** All 9 fixtures pass `npm run test:evals -w apps/dashboard` consistently across 3 consecutive local runs (manual flake check).

---

### Step 1.4 — Mutative fixture corpus (~1.5 days) [COMPLETED]

Action paths — refund, cancel, address change, multi-step. Where the harness earns its keep, and where you'll likely discover the runner needs extensions (e.g., `mustCallToolsInOrder`, partial tool-argument matching, simulating tool failures).

**New fixtures** (~12 cases):
- 3 refund (under cap, at cap, over cap → expect escalate)
- 2 cancel (allowed, blocked by `blockCancellations` policy)
- 3 address-change (pre-fulfillment OK, post-fulfillment escalate, missing required fields)
- 2 multi-step (refund + reply, address change + reply)
- 2 escalation triggers (Shopify down, out-of-scope question)

**Done when.** All ~21 fixtures pass consistently. Expect small runner adjustments here.

---

### Step 1.5 — Adversarial fixtures + CI wiring (~1 day) [COMPLETED]

Remaining fixture categories and the CI plumbing.

**New fixtures** (~4 cases):
- 2 prompt-injection attempts (customer trying to manipulate the agent)
- 2 quick-reply auto-approval candidates

**CI workflow** in `.github/workflows/`:
- New workflow `evals.yml` (or a job in existing CI) gated on `paths: ['apps/dashboard/src/lib/agent/**', 'apps/dashboard/src/lib/messaging/**']` so doc-only PRs don't trigger it.
- Runs `npm run test:evals -w apps/dashboard` with the Anthropic API key from a CI secret.
- **Non-blocking for the first 4 weeks** — posts results as a PR comment or non-required status check. Do not add to branch protection yet.
- After 4 weeks, flip to required once the corpus is calibrated and flake is understood.

**Done when.** A PR touching `apps/dashboard/src/lib/agent/**` shows the eval suite running and reporting; a doc-only PR does not trigger it.

---

**Open decisions (apply to the whole step).**
- **Eval CI gating**: settled — non-blocking for ~4 weeks, then flip to blocking.
- **Synthetic fixtures only, or seed with redacted prod data?** Synthetic is sufficient for V1; redacted-prod replay is a Layer 3 problem.

---

## Step 2 — Brand voice + sample replies wiring (S, depends on Step 1)

Trivial code change, large perceived-quality lift. Eval-gated by Step 1.

Current state: `brandVoice` and `aiContext` are collected at onboarding and displayed in the settings UI, but **never inserted into the system prompt**. They are dead inputs. Every merchant gets the same prompt. The Identity section in `AgentTab.tsx` (line 320) already renders `agentName`, `aiContext` (labeled "Brand name"), and `brandVoice` — only sample replies need a new UI block.

Broken into 5 sub-steps. One PR is right for this — the pieces are coupled (type → defaults → prompt → UI → fixtures). Total: ~1 working day.

**Layout decision.** No DB migration: `Organization.settings` is `JsonB`, so `sampleReplies` lives inside the existing settings JSON alongside `brandVoice` and `aiContext`.

---

### Step 2.1 — Types + defaults: add `sampleReplies` (~30 min) [COMPLETED]

**`apps/dashboard/src/types/index.ts`**
- Add interface near `OrgSettings`:
  ```ts
  export interface SampleReply {
    id: string;        // uuid, generated client-side
    body: string;      // ≤ 300 chars
    context?: string;  // optional 1-line "when to use" hint, e.g. "shipping delay"
    tag?: string;      // optional tag for matching against thread.tag
  }
  ```
- Add `sampleReplies?: SampleReply[]` to `OrgSettings`, grouped right under `brandVoice` so the AI block stays together.

**`apps/dashboard/src/lib/agent/settings.ts`**
- Add `sampleReplies: []` to `AGENT_SETTINGS_DEFAULTS`.
- `resolveAgentSettings` already spreads defaults — no change needed beyond ensuring the array default survives `null`/`undefined` settings (it will, via the `AGENT_SETTINGS_DEFAULTS` spread).

**Done when.** Type-check passes; `resolveAgentSettings(null).sampleReplies` returns `[]`.

---

### Step 2.2 — Prompt wiring (~1–2 hours) [COMPLETED]

**`apps/dashboard/src/lib/agent/prompt.ts`**

Add a single helper above `buildSystemPrompt`:

```ts
function buildBrandContextSections(s: OrgSettings, ctx: AgentContext, opts: { includeVoice: boolean }): string {
  const parts: string[] = [];
  if (s.aiContext?.trim()) {
    parts.push(`## About this store\n${s.aiContext.trim()}`);
  }
  if (opts.includeVoice && s.brandVoice?.trim()) {
    parts.push(`## Voice\nMatch this tone in every customer-facing reply:\n${s.brandVoice.trim()}`);
  }
  if (opts.includeVoice) {
    const samples = pickSampleReplies(s.sampleReplies ?? [], ctx.thread.tag, 3);
    if (samples.length > 0) {
      const rendered = samples
        .map((r, i) => `Example ${i + 1}${r.context ? ` (${r.context})` : ""}:\n${r.body}`)
        .join("\n\n");
      parts.push(`## Sample replies (match this style)\n${rendered}`);
    }
  }
  return parts.length > 0 ? "\n\n" + parts.join("\n\n") : "";
}

function pickSampleReplies(all: SampleReply[], threadTag: string | null, n: number): SampleReply[] {
  if (all.length === 0) return [];
  const tagMatches = threadTag ? all.filter(r => r.tag && r.tag === threadTag) : [];
  const rest = all.filter(r => !tagMatches.includes(r));
  return [...tagMatches, ...rest].slice(0, n);
}
```

Insertion points:
- **Support branch of `buildSystemPrompt`**: insert `buildBrandContextSections(s, ctx, { includeVoice: true })` immediately before `## Knowledge base` (line ~107) so KB stays last.
- **Operator branch**: insert `buildBrandContextSections(s, ctx, { includeVoice: false })` before `## Instructions` (line ~53). Operator mode does not draft to customers, so render `aiContext` only — skip voice/samples.
- **`buildComposerAskPrompt`**: insert `buildBrandContextSections(s, ctx, { includeVoice: true })` before `## Rules` so operator-drafted replies inherit voice.

**Determinism.** `pickSampleReplies` must not use `Math.random` (eval suite needs reproducibility). Tag-match + first-N order is deterministic.

**Char cap.** Enforced on write (UI + API), not in the prompt builder. Keep the builder dumb.

**Done when.** A unit test or REPL session shows `buildSystemPrompt` includes the three sections when settings provide them, and omits them cleanly when empty.

---

### Step 2.3 — UI: sample replies editor in AgentTab (~3–4 hours)

**`apps/dashboard/src/app/dashboard/settings/_components/AgentTab.tsx`**

Add a new `SectionCard` titled "Sample replies" directly below the existing "Identity" card (line 320) and before "Default Behavior":

- List rendered from `state.sampleReplies ?? []`.
- Each row: a `Textarea` (body, `maxLength={300}`, `rows={2}`), small `Input` for optional `context`, optional tag selector (free-text input is fine for V1), and a remove button.
- "Add sample reply" button — disabled when `(state.sampleReplies?.length ?? 0) >= 10`.
- Char counter per row + cap counter "X / 10" at the top of the section.
- Generate `id` via `crypto.randomUUID()` on add.
- Wire through the existing reducer: `dispatch({ type: 'set', patch: { sampleReplies: next } })`. Both `payload` and `isDirty` already react to `state` — no other plumbing.

**API/server check.** `/api/org` PATCH already accepts arbitrary `settings` JSON. **Verify** by grepping the route for a whitelist or Zod schema; if one exists, add `sampleReplies` to it.

**Done when.** Adding/removing/editing rows persists across a page reload; cap is enforced; char counter renders.

---

### Step 2.4 — Eval fixtures (~1 hour)

Three new fixtures under `apps/dashboard/src/lib/agent/__evals__/fixtures/`. Slot into the existing `index.test.ts` runner without changes (it loads every `fixtures/*.json`).

1. **`brand-voice-cheers-signoff.json`** — `orgSettings.brandVoice: "warm, slightly informal, sign off with 'cheers'"`, basic order-status question. `expectedPlan.replyMustInclude: ["cheers"]`.
2. **`brand-voice-no-overapology.json`** — `brandVoice: "never over-apologize, no 'so sorry'"`, customer complaint about a delay. `replyMustNotInclude: ["so sorry", "deeply apologize"]`.
3. **`sample-reply-shipping-delay-imitation.json`** — supply a `sampleReplies` array with one shipping-delay reply tagged `shipping`; thread `tag: "shipping"`; assert `replyMustInclude` on a distinctive phrase from the sample. Validates both the wiring and the tag-match selection.

**Done when.** All three new fixtures pass `npm run test:evals -w apps/dashboard`.

---

### Step 2.5 — Verify end-to-end (~30 min)

1. `npm run test:evals -w apps/dashboard` — confirm new fixtures pass and existing 25 still pass (no regression from prompt structure changes).
2. Manual: open `/dashboard/settings` → Agent tab, add 2 sample replies, set brand voice, save, open a real ticket, draft via composer, verify the voice shows up.
3. Run the suite twice back-to-back — confirm `cache_read_input_tokens > 0` on the second run. Cache breakpoints are positional, so adding sections inside the cached system prompt is fine, but verify.

---

**Sub-step summary.**

| Sub-step | Files | Effort |
|----------|-------|--------|
| 2.1 Types + defaults | `types/index.ts`, `lib/agent/settings.ts` | 30 min |
| 2.2 Prompt wiring | `lib/agent/prompt.ts` | 1–2 hr |
| 2.3 UI editor | `settings/_components/AgentTab.tsx` (+ `/api/org` whitelist if present) | 3–4 hr |
| 2.4 Eval fixtures | 3 new JSON files in `__evals__/fixtures/` | 1 hr |
| 2.5 Verify | — | 30 min |

**Open decisions.**
- **Sample reply selection strategy** when `sampleReplies.length > 3`: tag-match (recommended for V1 and baked into 2.2 above), random (cheap, less relevant), or embeddings by semantic similarity (best, requires a vector store — defer).
- **Char budget per sample reply**: 300 (recommended) or 500. With cap of 10 stored × 3 included, 300 keeps the worst-case prompt addition under ~900 chars.
- **`aiContext` in operator mode**: render it (recommended — useful framing like "Acme Store sells handmade ceramics") or skip. Voice/samples stay off in operator mode regardless.

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
