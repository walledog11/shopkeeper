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
  forwarding) and storefront chat. The merchant controls the agent through iMessage (one
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
  defaults and `TIER_DEFAULTS` in `packages/agent/src/settings.ts`. Read them there.
  `autonomyTier` is `watch`/`guarded`/`trusted`. The agent's name is the constant
  `AGENT_DISPLAY_NAME`.
- **Agent modes:** support (ticket threads, plan → approve), operator (dashboard chat and
  iMessage, with approve/reject/revise control tools and a keyword fast path for
  literal yes/no/help), and composer-ask (`runAgent(..., { readOnly: true })`). Read tool
  behavior from `packages/agent/src/tools/registry/`; do not infer it.
- **Hosts:** one Next.js app serves marketing on `useshopkeeper.com` and the app on
  `app.useshopkeeper.com`. The app origin is pinned into every OAuth provider, so
  `APP_URL` and `NEXT_PUBLIC_APP_URL` must both be `https://app.useshopkeeper.com`
  (checked in `apps/dashboard/src/lib/env/index.ts`), and `src/proxy/canonical-host.ts`
  redirects app surfaces onto it so host-only OAuth cookies survive the provider hop.
- **Brand:** "Shopkeeper" is used unregistered on purpose. **Never write "ShopKeep"**
  (no `-er`) anywhere user-facing — that is a live third-party mark. Handles use the
  `use` prefix (`@useshopkeeper`, `@useshopkeeperbot`).
- **Env:** names in each app's `.env.example`. Both `DATABASE_URL`s append
  `?pgbouncer=true`; pool settings come from `DB_POOL_*` (`packages/db/pool-config.ts`).
  `TOKEN_ENCRYPTION_KEY` encrypts integration tokens at rest, same value in both apps.

## Safety invariants

These are the product. Do not loosen one without saying so in the PR.

- **Ticket text is untrusted.** Customer-derived prose reaching an operator turn is
  wrapped with `wrapUntrusted` (`packages/agent/src/message-history.ts`) — including tool
  results, summaries, digest text and pending-state text.
- **Shop-management writes stay operator-only** (gateway `moduleTools`); a test asserts
  they never appear in `TOOL_DEFINITIONS`. Promotions are expiring automatic discounts,
  never price edits. No refund tool lets the model name the amount. Nothing bounds the
  size of a merchant-approved change; operator-only reach plus the merchant's approval
  is the containment.
- **One decision, one owner.** `decideAutonomy` is the only planning-time answer to "may
  this run without a human?"; execution-time policy is the backstop. Never re-derive it.
- **Validate, don't repair.** An invalid plan is kept intact for the merchant to see and
  cannot execute. Never edit model output and ship the remainder.
- **Unknown provider outcome means escalate**, never replan. Only a definite failure
  earns the one bounded replan.
- **Never ask the merchant to approve something whose request can't be shown** — ask
  them to open the thread instead.
- **Merchant preferences are guidance only**; they never change caps, policy,
  authentication or autonomy tier.
- **Customer-facing input stays in capture-mode planning** with deterministic
  adjudication. Deterministic keyword fast paths (`yes`/`no`/`OPEN n`) stay.
- **Order-ops stays flag-and-notify.** Mutating order actions need their own rollout
  gate, separate from `ORDER_RISK_MONITOR_ENABLED`.
- **A new financial tool needs a prompt branch**, not just a registry entry: the
  compensation decision tree escalates anything it doesn't enumerate.
- **A validator rewrite that narrows what it inspects can loosen a safety check.** Diff
  old and new verdicts on the same inputs.
- **Migrations deploy before the code that needs them**, and every fan-out load in
  `buildContext` has its own catch. A missing table once left every inbound message
  unplanned for a day.
- Before removing support for persisted data, check whether production still holds rows
  that need it.

## Design rules

- **Never branch on prose.** Control flow reads codes, enums and typed fields; English is
  display-only. Plan conditions are `PlanSignal { code, severity, message }`
  (`packages/agent/src/plan-signals.ts`). Adding a case to a text matcher is never the fix.
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
