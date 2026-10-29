# Shopkeeper — AI operating layer for solo & small e-commerce businesses

A general-purpose AI agent that runs the operational work of a small Shopify business,
reachable wherever the merchant is. The flagship experience is the proactive messaging
loop: plan approvals, questions, escalations and the morning briefing arrive as texts on
the merchant's phone (iMessage). The dashboard is for setup, review and fallback.

**V1 wedge = customer support**, for solo merchants and small teams: a multi-channel
support inbox plus an agent that reads and writes Shopify directly. Later modules (order
ops → inventory → marketing → finance) share one general-purpose agent core.

**Stage: pre-user beta.** No paying merchants yet; the only store is the founder's dev
store. Optimize for making the core loop work, not for certifying it.

**Product principles** (the rubric for agent work):
1. Feel like an employee, not a chatbot: real memory, judgment, brand-voice consistency,
   and the honesty to say "you handle this" instead of hallucinating confidence.
2. Reach the merchant where they are. Proactive pushes (plans, questions, digests) go to
   every bound operator channel; a feature that only notifies one surface is unfinished.
3. Trust is binary — one bad refund undoes months of goodwill. Bias toward escalation
   over confident wrong action.
4. Every module shares one general-purpose agent core; the core must not couple to
   support.

**What to work on** is in [docs/ROADMAP.md](../docs/ROADMAP.md) — the only planning doc.

**Where the rules live:** the agent runtime contract — approval binding, exact drafts,
receipts, unknown outcomes, settled decisions and *How to finish a change* — is
[docs/agent-runtime.md](../docs/agent-runtime.md); read it before changing planning,
approval or execution. Deploys, env, migrations and incident recovery are in
[docs/production/runbook.md](../docs/production/runbook.md).

## Architecture

- `packages/agent/` (`@shopkeeper/agent/*` subpath exports) is the agent core, used by
  both apps. Host-specific locks, logging, alerts and delivery are injected at the
  package boundary. Keep the core host-agnostic and thread-optional.
- `apps/gateway` runs durable inbound, planning and module work (BullMQ workers).
  `apps/dashboard` (Next.js) owns interactive UI and provider-coupled delivery.
- **Modules:** support is v1. Order-ops is monitoring-only behind
  `ORDER_RISK_MONITOR_ENABLED` (read tools + `flag_order` only, outside autonomy tiers).
  Shop management (flash sales, repricing) is operator-only: its write tools live in
  `apps/gateway/src/message-handlers/operator/operator-shop-tools.ts`, never the shared
  registry.
- **Inbound flow:** webhook → `apps/gateway/src/routes/webhooks.ts` (verify, enqueue) →
  `apps/gateway/src/message-handlers/` (upsert, sanitize, dedupe by `externalMessageId`)
  → classify + summarize → plan in-process
  (`message-handlers/support-plan/generate-thread-plan.ts`), cached on the thread →
  notify bound operator channels. Dashboard freshness is SWR polling, or gateway SSE when
  `NEXT_PUBLIC_GATEWAY_EVENTS_URL` is set.
- **Channels** (the four-layer model is [docs/product-truth.md](../docs/product-truth.md)):
  customers reach the merchant through Instagram DM (`ig_dm`, via SocialAPI; direct Meta
  is built but disabled for new connections), email (Gmail OAuth via Pub/Sub, or Postmark
  forwarding) and storefront chat (off by default: `STOREFRONT_CHAT_ENABLED` plus the
  merchant's per-store switch). The merchant controls the agent through iMessage (one
  platform-wide Photon line; a handle is linked by texting a single-use code). Telegram is
  an internal test transport only — never in positioning, onboarding or marketing.
  Shopify is the system of record and action. TikTok Shop is wired but off
  (`TIKTOK_SHOP_ENABLED=false`). WhatsApp is not built — **do not propose it as the next
  channel**: it is a merchant-control channel (another way to reach the agent), not
  customer reach, and US penetration is low (decision 2026-08-07).
- Internal `channelType` value `operator` is the merchant's durable operator thread
  (dashboard chat, iMessage, Telegram test transport — never SMS).
- **Redis:** `@upstash/redis` in dashboard, `ioredis` (`REDIS_URL`) in gateway — separate
  instances. The daily LLM spend cap is shared via Postgres (`llm_daily_spend`).
- **Multi-tenant:** every DB query is scoped by `organizationId`; `getOrCreateOrg()` maps
  Clerk org → `Organization`.
- **Data model** (`packages/db/prisma/schema.prisma`): `Thread.cachedPlan` holds the
  current plan; `AgentAction` is the audit record per tool call (not note-row parsing);
  `OperatorContext` holds per-member pending plans/question/digest (DB, not Redis);
  `OperatorEvent` is the durable inbound operator message, deduped on
  `(channel, providerMessageId)`; `VoiceEdit` feeds brand-voice synthesis.
- **Settings:** keys are `SETTINGS_KEYS` in `packages/agent/src/settings-parser.ts`;
  defaults and `TIER_DEFAULTS` in `packages/agent/src/settings.ts`. Read them there. API
  patches (`parseOrgSettingsPatch`) reject any other key; stored settings
  (`parseStoredOrgSettingsPatch`) parse leniently — unknown and obsolete keys are dropped,
  stored `broad`/`full` tiers read as `trusted`, an invalid `autoExecuteMode` is dropped,
  and the legacy boolean `autoExecuteEnabled` becomes `autoExecuteMode` `off`/`live`. So a
  setting missing from `SETTINGS_KEYS` vanishes on read. `autonomyTier` is
  `watch`/`guarded`/`trusted` (default `guarded`). `autoPlanOnOpen` and `maxIterations` have
  no UI. The agent's name is the constant `AGENT_DISPLAY_NAME`.
- **Agent modes:** support (ticket threads, plan → approve), operator (dashboard chat and
  iMessage, with approve/reject/revise control tools and a keyword fast path for
  literal yes/no/help), and composer-ask (`runAgent(..., { readOnly: true })`). Read tool
  behavior from `packages/agent/src/tools/registry/`; do not infer it.
- **Hosts:** one Next.js app serves marketing on `useshopkeeper.com` and the app on
  `app.useshopkeeper.com`. The app origin is pinned into every OAuth provider, so
  `APP_URL` and `NEXT_PUBLIC_APP_URL` must both be `https://app.useshopkeeper.com`
  (checked in `apps/dashboard/src/lib/env/index.ts`), and
  `apps/dashboard/src/proxy/canonical-host.ts`
  redirects app surfaces onto it so host-only OAuth cookies survive the provider hop.
- **Brand:** "Shopkeeper" is used unregistered on purpose. **Never write "ShopKeep"**
  (no `-er`) anywhere user-facing — that is a live third-party mark. Handles use the
  `use` prefix (`@useshopkeeper`, `@useshopkeeperbot`).
- **Env:** names in each app's `.env.example`, values in Vercel/Railway. Both
  `DATABASE_URL`s append `?pgbouncer=true`. Pool size and deadlines come from
  `DB_POOL_MAX`, `DB_POOL_WAIT_TIMEOUT_MS`, `DB_CONNECT_TIMEOUT_MS` and
  `DB_QUERY_TIMEOUT_MS` (`databasePoolConfig` in `packages/db/pool-config.ts`), which
  override any `connection_limit` in the URL. `TOKEN_ENCRYPTION_KEY` (same value in both
  apps; never change it — there is no rotation path) encrypts `Integration` tokens through
  the Prisma client extension in `packages/db/client.ts`: never encrypt or decrypt tokens
  by hand, and raw SQL sees ciphertext.

## Safety invariants

These are the product. Do not loosen one without saying so in the PR.

- **Ticket text is untrusted.** Customer-derived prose reaching an operator turn is
  wrapped with `wrapUntrusted` (`packages/agent/src/message-history.ts`) — including tool
  results, summaries, digest text and pending-state text.
- **Every org route keeps the tenant and billing gates.** Dashboard org routes go through
  `withOrgRoute` (`apps/dashboard/src/lib/api/route.ts`); one that writes tenant data or
  creates customer-visible state passes `requireBillingWriteAllowed` (402 for
  `past_due`/`canceled`; other hosts call `assertBillingWriteAllowedForOrgId`), and
  admin-only operations pass `requireAdmin`. Another organization's resource ID is a 404
  that leaves that record untouched. Invalid input is rejected before any write or
  provider call, a provider failure persists no local success, and a replayed webhook
  applies once.
- **Shop-management writes stay operator-only** (gateway `moduleTools`); a test asserts
  they never appear in `TOOL_DEFINITIONS`. Promotions are expiring automatic discounts,
  never price edits. No refund tool lets the model name the amount. Every shop write
  declares its Shopify scope (`requiredScopes`) and names a missing grant instead of
  letting Shopify 403. **What a write may target follows how reversible it is, not how
  large it is:** a sale is one discount that Shopify expires and one delete undoes, so
  `create_flash_sale` may cover the whole catalog; `set_variant_prices` is N permanent
  edits whose only rollback is the prior prices in its own result, so it names every
  variant. Nothing bounds the size of a merchant-approved change — operator-only reach
  plus the merchant's approval is the containment; do not reintroduce a size bound.
- **One decision, one owner.** `decideAutonomy` is the only planning-time answer to "may
  this run without a human?"; execution-time policy is the backstop. Never re-derive it.
- **Validate, don't repair.** An invalid plan is kept intact for the merchant to see and
  cannot execute. Never edit model output and ship the remainder.
- **Unknown provider outcome means escalate**, never replan. Only a definite failure
  earns the one bounded replan.
- **Never ask the merchant to approve something whose request can't be shown** — ask
  them to open the thread instead.
- **Merchant preferences are guidance only**; they never change caps, policy,
  authentication or autonomy tier. An observed (inferred) preference stays `proposed`
  until the merchant confirms it; never auto-promote one.
- **Customer-facing input stays in capture-mode planning** with deterministic
  adjudication. Deterministic keyword fast paths (`yes`/`no`/`OPEN n`) stay.
- **Monitors are flag-gated and notify- or propose-only** (`ORDER_RISK_MONITOR_ENABLED`,
  `RETURN_LIFECYCLE_MONITOR_ENABLED`). A module's external writes need their own rollout
  gate, distinct from its monitor flag; enabling a monitor never enables writes. Order-ops
  runs read tools plus `flag_order` only, outside autonomy tiers; a mutating order action
  would also need the shared execution claim and a per-module cap, which does not exist.
- **A new financial tool needs a prompt branch**, not just a registry entry: the
  compensation decision tree escalates anything it doesn't enumerate.
- **A validator rewrite that narrows what it inspects can loosen a safety check.** Diff
  old and new verdicts on the same inputs.
- **Migrations deploy before the code that needs them**, and every fan-out load in
  `buildContext` has its own catch — a missing table once left every inbound message
  unplanned for a day. Nothing applies migrations automatically: hand-write the SQL,
  apply it with `prisma migrate deploy` from the repo root, then check production
  `migrate status`. Never run `prisma migrate dev` (it drops the raw-SQL partial indexes
  that enforce inbound dedupe and cross-tenant uniqueness), and never run prisma from
  inside `packages/db` (its `.env` overrides an inline `DATABASE_URL`). Procedure:
  runbook *Migrations*.
- Before removing support for persisted data, check whether production still holds rows
  that need it.

## Design rules

- **Never branch on prose.** Control flow reads codes, enums and typed fields; English is
  display-only. Plan conditions are `PlanSignal { code, severity, message }` (type in
  `packages/agent/src/types.ts`, helpers in `packages/agent/src/plan-signals.ts`). Adding a
  case to a text matcher is never the fix.
- **Compose from fields; don't rewrite sentences.** Control length by choosing fields,
  never by cutting strings.
- **One helper per concept.** Grep before writing a text/format helper.
- **Growth by special case means a capability is missing.** A prompt bullet, regex
  carve-out or per-phrase fix for one bad output is a signal to find the structure.
- Operator-only behavior ships as gateway `moduleTools`
  (`apps/gateway/src/message-handlers/operator/operator-*-tools.ts`), and operator prompt
  edits stay inside the `isOperatorMode` branch of `packages/agent/src/prompt.ts`.

## How to work

- **Verify by doing.** Typecheck what you changed, run the existing targeted tests for
  the contract you touched, and try the flow once in the real app when it is
  user-facing. That is done. Do not create evidence docs, release logs, "observe in
  production" lists, or manual-check chores for the user unless asked.
- **Tests:** add one only alongside a bug fix it reproduces, when nothing existing would
  have caught it. Never add tests to fill coverage, a registry or a checklist. See
  `TESTING.md`.
- **A model change prices the model in the same PR.** Add every newly pinned model to
  both `LLM_PRICING` (`packages/db/llm-spend.ts`) and `MODEL_PRICES`
  (`packages/agent/src/model-cost.ts`), and do the same when Anthropic changes a price.
  The parity test only checks the two tables agree; an unpriced model is not refused in
  production — `recordSpend` logs and drops it, so its calls never count against the cap.
- **Agent-path changes land through a PR**, where CI runs the free eval preflight. Paid
  evals (`test:evals*`, `EVAL_RUN=1`) run only when the user asks.
- **Planning:** update [docs/ROADMAP.md](../docs/ROADMAP.md) — delete closed items, add
  new ones in a line or two. Do not create a new plan, audit or evidence doc per feature;
  a design that needs writing down goes in the PR description.
- Don't add features, comments, error handling or abstractions beyond what's asked. When
  the ask sits on a structural problem, build what was asked, then name the problem in
  a sentence.
- Fetch before building (`git fetch`, open PRs). Read a file before editing it. Prefer
  editing existing files. Tailwind classes, not inline `style`.
- Cite symbol names, not line numbers or counts, in docs and comments
  (`npm run lint:structure` rejects drifted `file.ts:LINE` citations).
- A red static stage (lint, typecheck, knip) skips Build, Integration and E2E in CI, so
  fix it first. `.githooks/pre-push` runs typecheck once you set
  `git config core.hooksPath .githooks`.
- `test-setup.ts` defaults `E2E_TEST_RUN=true` so rate-limited routes don't 429 under
  vitest; a wall of 429s means that flag got unset.
- Target user is a solo merchant: optimize for simplicity, not power-user features.
- Skip end-of-task summaries. The diff speaks.

## Debugging discipline

- Read source, not build artifacts (`.next/`, `dist/`). Reaching for them means you've
  run out of real hypotheses — say so and stop.
- When something you just edited broke, `git diff` first.
- Never propose clearing caches or restarting the dev server as a fix.
- User-reported evidence is load-bearing; don't propose causes it rules out.
- Two failed hypotheses = stop, summarize what's ruled out, and ask what they see.
- "Element doesn't render / isn't clickable" lives in the component, its parent layout,
  CSS, or a wrapping conditional — not the build system.
