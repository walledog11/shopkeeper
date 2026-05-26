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

### Step 2.3 — UI: sample replies editor in AgentTab (~3–4 hours) [COMPLETED]

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

### Step 2.4 — Eval fixtures (~1 hour) [COMPLETED]

Three new fixtures under `apps/dashboard/src/lib/agent/__evals__/fixtures/`. Slot into the existing `index.test.ts` runner without changes (it loads every `fixtures/*.json`).

1. **`brand-voice-cheers-signoff.json`** — `orgSettings.brandVoice: "warm, slightly informal, sign off with 'cheers'"`, basic order-status question. `expectedPlan.replyMustInclude: ["cheers"]`.
2. **`brand-voice-no-overapology.json`** — `brandVoice: "never over-apologize, no 'so sorry'"`, customer complaint about a delay. `replyMustNotInclude: ["so sorry", "deeply apologize"]`.
3. **`sample-reply-shipping-delay-imitation.json`** — supply a `sampleReplies` array with one shipping-delay reply tagged `shipping`; thread `tag: "shipping"`; assert `replyMustInclude` on a distinctive phrase from the sample. Validates both the wiring and the tag-match selection.

**Done when.** All three new fixtures pass `npm run test:evals -w apps/dashboard`.

---

### Step 2.5 — Verify end-to-end (~30 min) [COMPLETED]

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

## Step 3 — Bias-to-escalate + remove forced `tool_choice` (S, depends on Step 1) [COMPLETED]

The prompt currently pushes hard toward action ("Every task MUST be completed by calling a tool" in the operator branch). For the trust principle, the agent needs an explicit uncertainty pathway, and the runtime needs to stop forcing tool calls when the right answer is "I'm not sure — escalate."

Broken into 3 sub-steps. Total: ~2 hours sequential. 3A and 3B are conceptually paired ("stop forcing actions, start permitting uncertainty") and can land together if you want one PR; 3C is small because the failure-injection infra already landed in Step 1.4 and three of the originally-planned fixtures already exist.

---

### Step 3A — Prompt rewrite (~30–45 min) [COMPLETED]

**`apps/dashboard/src/lib/agent/prompt.ts`**

- **Support branch** (`buildSystemPrompt`, around line 120 — the `## Instructions` block): add a bias-to-escalate clause near the top:
  > When you are uncertain about the customer's identity, the right action, or whether a request is in scope, call `escalate_to_human` instead of guessing. Confident wrong actions are far worse than honest escalations. If a tool fails and you cannot recover, escalate.

  No "MUST call a tool" line exists in the support branch today, so this is purely additive.

- **Operator branch** (around line 82): **remove** the existing absolutes:
  > Every task MUST be completed by calling a tool. You CANNOT complete any task by writing a response - your text response is only a summary of what the tools did.
  > Sending, emailing, notifying, or contacting a customer = call send_email. There are no exceptions...

  Replace with:
  > Take action only when you are confident. When you are not, call `escalate_to_human`. Sending or contacting a customer is done by calling `send_email` — don't claim you sent something you didn't.

- **`buildComposerAskPrompt`**: composer is read-only and has no `escalate_to_human` tool, so add a softer honesty clause to the `## Rules` block:
  > If you are uncertain, say so plainly rather than guessing.

**Done when.** File compiles; `npm run test:evals -w apps/dashboard` shows the existing 25+ fixtures still pass (no regression from the prompt restructure).

---

### Step 3B — Strip forced `tool_choice` from runtime + planner (~30–45 min) [COMPLETED]

**`apps/dashboard/src/lib/agent/run.ts` (line 259).** Delete the operator first-iteration forcing:
- Current: `...(operatorMode && !readOnly && i === 0 && tools.length > 0 ? { tool_choice: { type: "any" } } : {})`
- This forces a tool call on the operator's first iteration even when the right answer might be "I need more info" or "you should handle this." Strip it. If the planner produces no tool calls in legitimate operator queries, fix it via prompt, not via forcing.

**`apps/dashboard/src/lib/agent/planner.ts` (the phase-2 "force send_reply" block, lines 225–268).** Currently runs whenever `!operatorMode && !hasSendReply && sendReplyTool` and uses `tool_choice: { type: "tool", name: "send_reply" }`. This forces a customer-facing reply even when escalation was the right call. Add a guard:
- Compute `hasEscalate = rawToolCalls.some(tc => tc.name === "escalate_to_human")`.
- Change the condition to `!operatorMode && !hasSendReply && !hasEscalate && sendReplyTool`.

**Done when.** Existing eval suite passes — this will surface any case that was secretly relying on the force.

---

### Step 3C — Calibration fixtures + verify (~30 min) [COMPLETED]

**Test infra.** Already in place from Step 1.4: `runner.ts` honors a fixture-level `simulateToolResults` (originally landed as `simulateToolFailures`; renamed since the same seam is used to inject both error strings and canned success payloads). No runner changes needed for 3C.

**Pre-existing escalation coverage from Step 1.4 / 1.5** (no work in 3C):
- `escalate-out-of-scope.json` — wholesale-pricing question, no KB. Asserts `escalate_to_human`.
- `escalate-shopify-down.json` — Shopify lookup tools simulated as 503. Asserts `escalate_to_human`.
- `quick-reply-thanks-ack.json` — "thanks!" follow-up. Asserts single `send_reply` and `quick_reply` classification (this is the "no destructive tools after a thanks" case the original plan called `no-tool-thanks`).

**Two new fixtures actually added in 3C:**

1. **`escalate-ambiguous-customer.json`** — `search_shopify_customers` returns four Jane Smiths. Asserts `escalate_to_human` and forbids any mutative tool.
2. **`no-tool-single-word.json`** — single "?" from a resolved customer. Asserts `send_reply` only, forbids escalation. Calibration canary against over-tipping toward escalate.

**Sample-reply fixture defensive update:** `sample-reply-shipping-delay-imitation.json` adds `escalate_to_human` to `mustNotCallTools` so the new bias-to-escalate clause can't quietly tip an otherwise-resolved shipping question to escalate.

**Verify.** Run the full eval suite; confirm the 2 new fixtures pass and the existing 25+ stay green.

**Done when.** All ~27 fixtures pass consistently across 2 consecutive local runs.

---

**Sub-step summary.**

| Sub-step | Files | Effort |
|----------|-------|--------|
| 3A Prompt rewrite | `lib/agent/prompt.ts` | 30–45 min |
| 3B Strip forced `tool_choice` | `lib/agent/run.ts`, `lib/agent/planner.ts` | 30–45 min |
| 3C Calibration fixtures | 2 new JSON fixtures, 1 defensive update | 30 min |

**Open decisions.**
- **How strict on bias-to-escalate?** If you tune the prompt too far, the agent escalates everything and the auto-pilot value evaporates. The eval suite needs cases on both sides — "should escalate" AND "should NOT escalate" — to keep this in calibration. Fixture 5 (`no-tool-single-word`) is the canary.
- **PR shape.** 3A + 3B together (paired conceptually, both small) or separate? Either is fine; separate gives cleaner bisection if a regression surfaces later. 3C stays its own PR because of the test infra surface area.

---

## Step 4 — Autonomy tier wiring (M, depends on Steps 1–3) [COMPLETED]

The 5 tiers (`watch`/`guarded`/`trusted`/`broad`/`full`) exist as labels collected at onboarding but the runtime doesn't read them. They're flattened into legacy booleans + caps at onboarding, then the tier name is stored but ignored downstream. Wire them properly so picking a tier (or changing one later) actually changes runtime behavior.

Broken into 9 sub-steps. Total: ~4 working days. 4.1 is the foundation everything else depends on; 4.2/4.3/4.4/4.6/4.7 can largely parallelize once 4.1 lands; 4.5 follows 4.4 (it consumes the new `auto_execute` classification); 4.8 verifies the whole thing. Suggested PR shape: bundle 4.1 alone (pure refactor, easy to review), then 4.2–4.4 (the behavior change), then 4.5 on its own (this is where auto-execution lives — highest trust risk, easiest to ship behind a feature flag), then 4.6/4.7 together (UI), then 4.8.

**Layout decision.** Tier→settings derivation lives in the runtime (`lib/agent/settings.ts`), not in onboarding. Onboarding becomes a thin client that writes `autonomyTier` only; the resolver does the rest at read time.

---

### Step 4.0 — Audit `alwaysDraftReply` (~30 min) [COMPLETED]

**Resolution.** Confirmed dead — zero runtime readers across `lib/agent/**` and `app/**`. Removed end-to-end (types, defaults, `TIER_DEFAULTS`, override paths, settings UI toggle, `/api/org` allow-list, e2e seed). `watch`-tier "draft only" behavior is already enforced by `toolsEnabled: { action: false, communication: false }`, so the boolean carried no unique semantics.

---

### Step 4.1 — Settings resolver + `TIER_DEFAULTS` (~1 day) [COMPLETED]

Pure refactor, no behavior change. Onboarding still flattens to legacy fields at this point, so observed behavior is unchanged — this just relocates the source of truth.

**`apps/dashboard/src/lib/agent/settings.ts`**
- Define `TIER_DEFAULTS: Record<AutonomyTier, Partial<OrgSettings>>`. Reuse the table currently in `apps/dashboard/src/app/(onboarding)/onboarding/_components/model.ts:53-57` but extend it with autonomy implications: e.g. `watch` → `toolsEnabled: { action: false, communication: false, ... }`, `requireApprovalForActions: true`; `guarded` → `requireApprovalForActions: true` for mutative tools; `trusted` → `requireApprovalForActions: false` with caps applied via `maxRefundAmount`, etc.
- Rewrite `resolveAgentSettings`. Precedence: `AGENT_SETTINGS_DEFAULTS` → `TIER_DEFAULTS[settings.autonomyTier ?? "guarded"]` → explicit fields on `settings`. Existing legacy fields (`requireApprovalForActions`, `maxRefundAmount`, `blockCancellations`) keep working — they're overrides on top of the tier now, not the primary policy.
- Default tier when `autonomyTier` is unset: `guarded` (conservative, matches what most existing orgs were flattened to).

**`apps/dashboard/src/app/(onboarding)/onboarding/_components/model.ts`**
- Drop the local tier→settings table. Re-export from `lib/agent/settings.ts` so the onboarding form keeps its preview copy (tier descriptions) but no longer owns the mapping.

**Done when.** Unit test in `settings.test.ts` covers each tier: `resolveAgentSettings({ autonomyTier: "watch", maxRefundAmount: 100 })` produces watch defaults with the override applied. Existing eval suite unchanged.

---

### Step 4.2 — Onboarding writes only `autonomyTier` (~0.5 day) [COMPLETED]

**`apps/dashboard/src/app/(onboarding)/onboarding/page.tsx:146`**
- Currently the onboarding flattens the picked tier into legacy settings on submit. Change to write `{ autonomyTier: pickedTier }` only — let `resolveAgentSettings` do the derivation at read time.
- Existing orgs unaffected: their legacy fields are already populated and still win via precedence (overrides beat tier defaults).
- New orgs will have the tier as their single source of truth, so changing the tier later (post-onboarding) actually changes behavior without backfilling legacy fields.

**Done when.** A new signup lands with `settings.autonomyTier` set and no flattened legacy fields; running a thread through the agent produces identical behavior to a pre-change signup.

---

### Step 4.3 — Prompt branching by tier (~0.5 day) [COMPLETED]

**`apps/dashboard/src/lib/agent/prompt.ts`**

Add a `## Your autonomy` section after `## Instructions` in `buildSystemPrompt`:
- `watch`: "Draft replies and plan actions but never execute. Always require approval."
- `guarded`: "Auto-reply to information questions. For any mutative action (refund, cancel, edit, address change), present a plan for approval and do not execute until approved."
- `trusted`: "Auto-reply to information questions. Auto-execute small refunds (≤ ${maxRefundAmount}), address changes before fulfillment, and shipping replies. For cancellations, refunds above ${maxRefundAmount}, or order edits, present a plan for approval."
- `broad` / `full`: route as `trusted` for V1. Keep them in the type so the onboarding UI can label them "coming soon" without code branching downstream.

Cap values come from `resolvedSettings.maxRefundAmount` etc., so the prompt and runtime agree.

**Eval fixtures.** Three new fixtures in `apps/dashboard/src/lib/agent/__evals__/fixtures/`:
- `tier-watch-refund-draft-only.json` — refund request on `watch` tier. Assert plan only, no execution intent.
- `tier-guarded-refund-approval.json` — same request on `guarded`. Assert plan classifies for approval.
- `tier-trusted-refund-under-cap.json` — same request on `trusted` with cap above amount. Assert auto-execution intent.

(These also serve as eval inputs for 4.4 and 4.5 — same setup, different assertions per sub-step.)

**Done when.** The three new fixtures pass, existing 27 stay green.

---

### Step 4.4 — Plan classification: add `auto_execute` (~1 day) [COMPLETE]

**`apps/dashboard/src/lib/agent/plan-preview.ts`**
- Extend `HomePlanKind`: `"quick_reply" | "needs_review" | "auto_execute"`.
- Make `classifyHomePlan` tier-aware. Takes `resolvedSettings` (or `autonomyTier` + caps) as input.
  - `watch`: every plan → `needs_review`. Quick-replies still surface, but no auto-send.
  - `guarded`: information-only plans → `quick_reply`; any mutative tool → `needs_review`.
  - `trusted`: information-only → `quick_reply`; mutative under caps and not blocked by overrides (`blockCancellations`, etc.) → `auto_execute`; otherwise `needs_review`.
- Cap check uses the same comparison the executor uses (`maxRefundAmount`, etc.) — extract a shared helper if needed so policy enforcement and classification can't drift.

**Done when.** Unit tests in `plan-preview.test.ts` cover the tier × action matrix. The fixtures from 4.3 also assert the classification each plan receives.

---

### Step 4.5 — Approval routing + auto-execute path (~1 day) [COMPLETED]

Depends on 4.4. This is where the trust risk lives — auto-execution means the agent acts without a merchant in the loop. Recommend shipping behind a per-org feature flag (or gating by `autonomyTier === "trusted"` and capping rollout via merchant comms).

**`apps/dashboard/src/app/api/agent/quick-approve/route.ts`**
- Already handles `quick_reply`. Extend to handle `auto_execute`: when a cached plan is auto-execute, the dashboard can call this endpoint without merchant input. Same audit trail as quick-reply, plus the mode is recorded as `auto_executed` (per Step 5).

**`apps/dashboard/src/lib/agent/api/dashboard-approval.ts`**
- `shouldPlanBeforeExecuting` becomes tier-aware. In `trusted+`, only plan-before-executing if the action is above tier caps. In `guarded`/`watch`, behavior unchanged.

**Auto-plan-on-open path** (gateway → `/api/agent/plan-internal` → dashboard, then dashboard surfaces the cached plan):
- After the plan is classified, if `auto_execute`, fire the run immediately. Cache still populated for audit. Telegram/notification path per Step 5 surfaces "agent just refunded $X for Jane" so the merchant has real-time visibility.
- If `auto_execute` is gated by a flag, the gate lives here.

**Done when.** End-to-end: a `trusted` org's incoming refund-eligible thread auto-executes without merchant input and produces an audit row; a `guarded` org's same thread still surfaces an approval card.

---

### Step 4.6 — Settings UI: tier selector + override surface (~0.5 day) [COMPLETED]

**`apps/dashboard/src/app/dashboard/settings/_components/AgentTab.tsx`**

Add a new `SectionCard` titled "Autonomy" at the top of the page (above Identity / Sample Replies / etc.):
- Radio group with 5 tiers and descriptive copy per tier (reuse onboarding copy from `model.ts`).
- `broad` and `full` rendered as disabled with a "Coming soon" label.
- Below the selector, the existing legacy fields (`requireApprovalForActions`, `maxRefundAmount`, `blockCancellations`, etc.) render with a visual cue showing the tier default and whether the current value is overriding it ("Default for Trusted: $50 · You set: $100" with a "Reset to tier default" link).
- Wire through the existing reducer pattern; persist via the same `/api/org` PATCH used elsewhere.

**Done when.** Switching the tier in the UI and saving updates `settings.autonomyTier`; legacy field defaults visibly track the chosen tier; overrides persist independently.

---

### Step 4.7 — Persistent autonomy visibility pill (~1 hour) [COMPLETED]

**`apps/dashboard/src/app/dashboard/_components/DashboardHeader.tsx`** (or the sidebar — pick whichever is more visible from any dashboard route).

Small pill: "Autopilot: Trusted" with a tier-tinted background (e.g., yellow for `watch`, green for `trusted`). Clicking navigates to `/dashboard/settings#autonomy`. Per the trust principle, the merchant should always know how much rope the agent has — including when they're deep in tickets and might forget they bumped the tier last week.

**Done when.** Pill renders on every dashboard route, reflects current tier from a fast-cached source (Clerk org metadata, SWR-cached settings, or wherever the existing header reads org context).

---

### Step 4.8 — Verify + eval coverage (~0.5 day) [COMPLETED]

**New eval fixtures** (in addition to those in 4.3):
- `tier-override-cancel-blocked.json` — tier `trusted` but `blockCancellations: true`. Cancellation request must still escalate (override wins over tier).
- `tier-trusted-refund-over-cap.json` — `trusted` tier, refund above `maxRefundAmount`. Must classify as `needs_review`, not `auto_execute`.

**Manual end-to-end.**
1. Switch tier in UI from `guarded` to `trusted`, save.
2. Pill in header updates immediately.
3. Open a thread that would have surfaced approval under `guarded`; verify it auto-executes (or queues for auto-execution if the gating flag is off).
4. Switch back to `watch`; verify next thread plan is draft-only.
5. Confirm the eval suite passes 2 runs in a row.

**Done when.** All ~30 fixtures pass consistently; manual flow above completes without surprise.

---

**Sub-step summary.**

| Sub-step | Files | Effort |
|----------|-------|--------|
| 4.0 Audit `alwaysDraftReply` (dead — removed) | grep-only | 30 min |
| 4.1 Resolver + `TIER_DEFAULTS` | `lib/agent/settings.ts`, `onboarding/_components/model.ts` | 1 day |
| 4.2 Onboarding writes tier only | `(onboarding)/onboarding/page.tsx` | 0.5 day |
| 4.3 Prompt branching | `lib/agent/prompt.ts` + 3 fixtures | 0.5 day |
| 4.4 `auto_execute` classification | `lib/agent/plan-preview.ts` (+ test) | 1 day |
| 4.5 Routing + auto-execute path | `api/agent/quick-approve/route.ts`, `lib/agent/api/dashboard-approval.ts`, auto-plan gateway | 1 day |
| 4.6 Tier selector UI | `settings/_components/AgentTab.tsx` | 0.5 day |
| 4.7 Visibility pill | `_components/DashboardHeader.tsx` (or sidebar) | 1 hr |
| 4.8 Verify | 2 new fixtures + manual | 0.5 day |

**Open decisions.**
- **`alwaysDraftReply`** behavior — settled in 4.0: dead field, removed end-to-end. `watch`-tier "draft only" is enforced via `toolsEnabled` rather than a separate boolean.
- **Should `watch` block action tools entirely** via `toolsEnabled`, or just disable execution? Recommend block entirely — the planner can still propose them as drafts, but `runAgent` cannot call them. Cleaner trust story and matches the "draft only" promise.
- **Auto-execute UX**: when a `trusted` merchant's agent auto-sends a reply or executes a refund, should the merchant see a real-time notification ("agent just replied to Jane")? Yes — this is what gives the merchant confidence to stay on the tier. Telegram already does some of this; extend in 4.5 alongside the audit row from Step 5.
- **Feature flag for auto-execute (4.5)**: ship behind a flag for the first week of `trusted` rollout, or trust the eval suite + manual QA? Recommend flag — auto-execute is the irreversible-side-effect path and the flag costs five minutes.

---

## Step 5 — Action audit table (M, depends on Step 1)

Stop overloading `Message.note` rows with parsed JSON. Make action records first-class.

Broken into 8 sub-steps. Total: ~5 working days. 5.1 is pure schema and lands alone. 5.2 + 5.3 are coupled (the helper is dead code until it's wired into the run loop) and ship together as "dark write" — table is populated but nothing reads it yet, so the change is reversible by deleting rows. 5.4 layers approval context onto the writer. 5.5 + 5.6 flip the read source of truth and backfill historic data — ship together so the dashboard doesn't show an empty list during the gap. 5.7 (UI) and 5.8 (evals) are independent and can land in either order.

**Layout decision.** Dark-write first, then flip readers. The new `AgentAction` table is populated by 5.2 + 5.3 while `action-log.ts` keeps parsing `__clerk_agent__` notes. Only in 5.5 does the read path switch over, with 5.6 backfilling history in the same PR window. This means the writer can soak in production for a few days before any user surface depends on it.

---

### Step 5.1 — Schema migration (~0.5 day) [COMPLETED]

Pure additive change in `packages/db/prisma/schema.prisma`. No reads, no writes — the table just exists.

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

Field semantics:
- `status`: `success` | `error` | `policy_block` | `escalated`
- `mode`: `human_approved` | `auto_executed` | `read_only`
- `category`: mirrors `TOOL_CATEGORIES` value from `lib/agent/tools/registry.ts`
- `approvedPlanHash`: hash of the cached plan at approval time, lets you verify "the executed plan matches what the merchant approved"
- `instructionHash`: hash of the instruction that produced the action (manual-invoke flows)

Add back-relations on `Organization` and `Thread`. Run `npx prisma migrate dev` locally, then apply to Neon.

**Done when.** Migration applied locally and on staging Neon; `prisma generate` produces the `AgentAction` client; `db.agentAction.findMany({ where: { organizationId } })` returns `[]` without errors.

---

### Step 5.2 — Writer scaffolding: types + helper (~0.5 day) [COMPLETED]

Build the helper in isolation so it's testable before wiring into the agent loop.

**`apps/dashboard/src/lib/agent/types.ts`**
- Extend `ActionEntry` with `input: unknown`, `durationMs: number`, `status: "success" | "error" | "policy_block" | "escalated"`, `mode: "human_approved" | "auto_executed" | "read_only"`, `errorDetail?: string`, `category: string`.

**New file `apps/dashboard/src/lib/agent/api/agent-actions.ts`**
- `recordAgentAction(params: { orgId, threadId?, customerId?, action: ActionEntry, mode, approval?: { approverId, approvedAt, approvedPlanHash, instructionHash? } })` — single insert into `AgentAction`.
- `recordAgentActionsBatch(params: { orgId, threadId?, customerId?, actions: ActionEntry[], mode, approval? })` — batched insert via `createMany` so the agent loop can flush N actions in one round-trip.
- Helper computes `approvedPlanHash` / `instructionHash` via a small `hashPlan(plan)` / `hashInstruction(instruction)` utility (SHA-256, hex, 64 chars to match the column).

**Done when.** Unit test in `agent-actions.test.ts` (real DB via `createTestOrg`) inserts an `AgentAction` row through the helper and reads it back with all fields populated.

---

### Step 5.3 — Wire writer into the agent loop (~1 day) [COMPLETED]

This is the dark-write step. After this lands, every agent run writes `AgentAction` rows but nothing reads them yet.

**`apps/dashboard/src/lib/agent/run.ts`**
- In `executeToolCall`, capture `startedAt = Date.now()`, the tool `input` (already in scope), the post-call `status` (`success` / `error` / `policy_block`), `errorDetail` when applicable, and `durationMs = Date.now() - startedAt`. Push the enriched `ActionEntry` to `actionsPerformed`.
- After the agent loop terminates and before `finish()` returns, call `recordAgentActionsBatch` once with the full buffer. Do not write inside the loop — that adds DB latency to every tool call and a partial write on crash is harder to reason about than an all-or-nothing flush.
- For `readOnly` runs (composer-ask flow), pass `mode: "read_only"`. For runs from `approvedToolCalls`, pass `mode: "human_approved"`. For runs from `auto_execute` classification (Step 4.5), pass `mode: "auto_executed"`. Leave `approval` undefined here — it's plumbed in 5.4.
- Escalation: when the agent calls `escalate_to_human`, record the action with `status: "escalated"` so the audit log shows it as a deliberate choice, not a missing row.

**Done when.** Running a real thread through `runAgent` produces one `AgentAction` row per tool call; rows have correct `mode`, `status`, `durationMs`; existing dashboard surfaces are unaffected (still reading from notes).

---

### Step 5.4 — Approval context plumbing (~0.5 day) [COMPLETED]

Layer approver identity onto the rows so the audit log answers "who said yes."

**`apps/dashboard/src/app/api/agent/quick-approve/route.ts`** — already authenticates the merchant. Pass `{ approverId: clerkUserId, approverDisplayName, approvedAt: new Date(), approvedPlanHash: hashPlan(cachedPlan) }` through to `runAgent`.

**`apps/dashboard/src/app/api/agent/route.ts`** — same treatment for the standard approval path.

**`apps/dashboard/src/lib/agent/run.ts`** — accept an optional `approval` param on the entry point; forward to `recordAgentActionsBatch`.

**`apps/dashboard/src/app/api/agent/internal/route.ts`** — Telegram-driven runs. Pass `approverId` derived from the Telegram operator's bound Clerk user (via `OrgMember.userId`).

**Denorm decision** (per Open decisions): store `approverId` as `"clerk_user_id:Display Name"` so the audit UI doesn't need a Clerk lookup per row. Cheap, keeps the read path single-table.

**Done when.** A quick-approved run produces an `AgentAction` with `mode: "human_approved"` and all approval fields populated; an auto-execute run has `mode: "auto_executed"` and `approverId` null; a composer-ask run has `mode: "read_only"` and `approverId` null.

---

### Step 5.5 — Read path rewrite + CSV (~1 day) [COMPLETED]

Flip the source of truth. Ship in the same PR as 5.6 so historic data is present when the new reader goes live.

**`apps/dashboard/src/lib/agent/api/action-log.ts`**
- Replace the `__clerk_agent__` note parser with a query against `AgentAction`: filter by `organizationId`, order by `executedAt desc`, paginate, optionally filter by `tool` / `status` / `mode` / `threadId`.
- Delete the parse-from-notes code path entirely once 5.6's backfill has run (the legacy notes will already have been migrated into `AgentAction` rows).

**`apps/dashboard/src/app/api/agent/actions/route.ts`** — CSV export reads from `AgentAction`. Stream rows to avoid loading all history into memory for large orgs.

**`apps/dashboard/src/lib/agent/api/turns.ts:serializeAgentTurn`** — keep writing a human-readable summary note (e.g. "Refunded $25 to Jane (Order #1234)") for the threads UI to render inline. Drop the structured JSON payload from the note — that data now lives in `AgentAction` and `turns.ts` no longer needs to be the canonical record.

**Done when.** Action-log page renders entries sourced from `AgentAction`; CSV export downloads; threads UI still shows agent turns inline via the summary note.

---

### Step 5.6 — One-shot backfill (~0.5 day) [COMPLETED]

**New file `packages/db/scripts/backfill-agent-actions.ts`**
- Iterates `Message` rows with `senderType: "note"` and body prefixed `__clerk_agent__`.
- Parses each note's JSON payload (the same parser `action-log.ts` used to run).
- Inserts an `AgentAction` row per parsed action. Idempotent: skip if a row already exists with the same `(threadId, tool, executedAt)` tuple (or fingerprint a deterministic id derived from the note's `messageId`).
- Supports `--dry-run` (counts only) and `--org <id>` (one tenant at a time) for safe staging runs.
- Records inferred `mode` from note metadata where present; defaults to `human_approved` for old rows (historic auto-execute is unlikely since the path didn't exist).

**Run order.** Land 5.5 + 5.6 in the same PR. Deploy the schema (5.1) → deploy 5.2/5.3 (dark write) → wait ~1 day so the new table has fresh rows → deploy 5.5 + run backfill → verify counts match → flip readers.

**Done when.** Script runs against staging dump, populates `AgentAction` rows for every historic `__clerk_agent__` note; re-running is a no-op; row count in `AgentAction` ≈ row count of `__clerk_agent__` notes.

---

### Step 5.7 — UI: mode / approver / duration columns (~0.5 day) [COMPLETED]

**`apps/dashboard/src/app/dashboard/activity/`** (or wherever the action log lives — confirm path by grepping for the existing log component).

- Add columns: `mode` (chip — distinct color per value), `approver` (display name from denorm; "—" for auto/read-only), `duration` (`{durationMs}ms`), `input` (collapsible JSON viewer, lazy-rendered).
- Add a mode filter chip row at the top — merchants will reach for "show me everything the agent did without asking" the first day this ships.
- Input column: redact on display (emails, phone numbers, Shopify customer IDs) via a small `redactPii(input)` helper. Raw inputs stay in the DB per the retention decision (Open decisions).

**Done when.** Activity page renders the new columns; mode filter narrows results correctly; input JSON viewer expands on click and shows redacted values.

---

### Step 5.8 — Eval fixtures + verify (~0.5 day) [COMPLETED]

**`apps/dashboard/src/lib/agent/__evals__/types.ts`** — extend `ExpectedPlan` with optional `expectedAgentActions?: { tool: string, status: string, mode: string }[]`.

**`apps/dashboard/src/lib/agent/__evals__/runner.ts`** — after the run completes, if `expectedAgentActions` is set, query `AgentAction` for the test thread and assert the array matches (ordered, by `tool` + `status` + `mode`). Cleanup in `cleanupTestData` already cascades to `AgentAction` via the `Organization` cascade — no extra teardown needed.

**Coverage.** Add `expectedAgentActions` to at least 3 fixtures across the existing suite — one read-only (composer-ask), one human-approved (refund under cap), one auto-executed (trusted tier + shipping reply). Total new fixtures: 0 — this is assertion-only on existing fixtures.

**Manual sanity check.**
1. Run a real refund through quick-approve. Verify `AgentAction` row has `mode: "human_approved"`, `approverId` populated, `approvedPlanHash` matches the cached plan's hash.
2. Toggle a test org to `trusted` tier, run an auto-execute thread. Verify `mode: "auto_executed"`, `approverId` null.
3. Run a composer-ask. Verify `mode: "read_only"`, `status: "success"` for the read tools.

**Done when.** All existing ~30 fixtures pass; the 3 with `expectedAgentActions` catch a deliberate mismatch when one is injected; manual flow above completes cleanly.

---

**Sub-step summary.**

| Sub-step | Files | Effort |
|----------|-------|--------|
| 5.1 Schema migration | `packages/db/prisma/schema.prisma` (+ migration) | 0.5 day |
| 5.2 Writer scaffolding | `lib/agent/types.ts`, new `lib/agent/api/agent-actions.ts` | 0.5 day |
| 5.3 Wire writer into loop | `lib/agent/run.ts` | 1 day |
| 5.4 Approval context | `api/agent/quick-approve/route.ts`, `api/agent/route.ts`, `api/agent/internal/route.ts`, `lib/agent/run.ts` | 0.5 day |
| 5.5 Read path + CSV | `lib/agent/api/action-log.ts`, `api/agent/actions/route.ts`, `lib/agent/api/turns.ts` | 1 day |
| 5.6 Backfill script | `packages/db/scripts/backfill-agent-actions.ts` | 0.5 day |
| 5.7 UI columns | `app/dashboard/activity/**` | 0.5 day |
| 5.8 Eval assertions | `__evals__/types.ts`, `__evals__/runner.ts`, 3 fixture updates | 0.5 day |

**Open decisions.**
- **Backfill old `__clerk_agent__` note rows into `AgentAction` once, or leave as-is and start fresh?** Backfill (settled — 5.6) — the dashboard will show a more useful action history immediately, and the legacy parsing code can be deleted.
- **`approverId` format**: Clerk user ID, or Clerk user ID + display name denormalized? Denorm (settled — 5.4) trades a small storage hit for not needing to join into Clerk's user store every time.
- **Input redaction**: tool inputs may contain customer PII (emails, addresses). Audit-log retention policy needs to align with PII policy. Keep raw inputs but redact on display, or redact on write? Probably keep raw + redact-on-read (settled — 5.7), so raw payloads remain available for incident review.
- **PR shape**: 8 sub-steps could collapse to 5 PRs — (5.1), (5.2 + 5.3), (5.4), (5.5 + 5.6), (5.7), (5.8). Recommended over 8 separate PRs because dark-write only earns its keep if 5.2/5.3 land together and 5.5/5.6 ship together (the read flip needs history).

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
7. **`alwaysDraftReply`** behavior in the runtime — settled in Step 4.0: dead field, removed end-to-end.
