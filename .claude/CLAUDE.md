# Shopkeeper — AI operating layer for solo & small e-commerce businesses

**Vision:** a general-purpose AI agent that runs the operational work of a small Shopify business and is reachable from wherever the merchant is (Telegram and iMessage now; the dashboard is one surface, not *the* surface). The flagship experience is the proactive messaging loop: plan approvals, questions, escalations, and the morning briefing arrive as texts on the merchant's phone — the dashboard is for setup and review, not the daily driver. Over time the same agent core (memory, approval/autonomy, multi-channel interaction, tool use) extends across workflow modules: support → order operations → inventory & supplier → marketing → finance.

**V1 wedge = customer support.** Only the support module is built today. The architecture assumes more modules will share one *general-purpose* core, not a support-coupled one — support remains the V1 focus and the thing that must ship. Solo merchants and small teams. Multi-channel support inbox + AI agent that reads/writes Shopify directly.

**Product principles** (the rubric for agent work):
1. The agent should feel like an employee, not a chatbot — real memory, judgment, brand-voice consistency, and the honesty to say "you handle this" instead of hallucinating confidence.
2. The merchant interacts from wherever they are (mobile, messaging), not just the dashboard. Proactive pushes (plans, questions, digests) must reach every bound operator channel — a feature that only notifies the dashboard, or only Telegram, is unfinished.
3. Trust is binary — one bad refund undoes months of goodwill. Bias toward escalation over confident wrong action; failure modes matter more than success modes.
4. Every workflow module shares one general-purpose agent core. The core must not couple to support specifically.

**Architecture:** The agent core lives in `packages/agent/` (`@shopkeeper/agent`) and is consumed by both apps. The gateway runs durable inbound, planning, and module work in-process; the dashboard owns interactive UI and provider-coupled delivery. Host-specific locks, logging, alerts, and delivery are injected at the package boundary. More execution continues to move into the gateway worker. Read this before assuming a support-only framing when touching agent architecture.

**Modules:** Support is v1 (built). Order-ops (module #2) is code-complete and monitoring-only behind `ORDER_RISK_MONITOR_ENABLED` — flag-and-notify only, no autonomy tiers, no plan surface. Shop management (inventory, promotions, repricing) is code-complete and **operator-only** — its write tools live in `apps/gateway/src/message-handlers/operator-shop-tools.ts`, never the shared registry. Open rollout gates are in `docs/to-do-list.md`.

**Channel priority — do not propose WhatsApp as the next channel** (decision 2026-08-07). WhatsApp is a *merchant-control* channel, not a customer-origin one (`docs/product-truth.md` §2 and its guardrails), so building it adds a third way for the merchant to reach the agent alongside Telegram and iMessage — it does not add a way for customers to reach the merchant. It is also a weak wedge in the US market Shopkeeper targets, where WhatsApp penetration is low. Treat it as built-when-a-merchant-asks, never as the default next thing. It stays on the roadmap and is not a removal candidate.

## Stack
- `apps/dashboard/` — Next.js 15 (app router), Tailwind, SWR, Clerk.com auth → Vercel
- `apps/gateway/` — Express + BullMQ worker → Railway
- `packages/db/` — Prisma + Neon Postgres, exported as `@shopkeeper/db`
- Redis: `@upstash/redis` (REST) in dashboard; `ioredis` (`REDIS_URL`) in gateway — **separate instances** (gateway needs a dedicated per-instance Redis for BullMQ, not Upstash). Daily LLM spend cap is shared across both apps via Postgres (`llm_daily_spend`), not Redis.
- AI: Anthropic SDK (agent, plan, summary). KB search is Prisma `contains`, not embeddings.
- Multi-tenant: every DB query is scoped by `organizationId`. `getOrCreateOrg()` maps Clerk org → DB `Organization`.
- Ops alerts emit structured Pino logs (`opsAlert: true`) when thresholds are crossed; the dashboard also reports errors to Sentry (`@sentry/nextjs`).

## Hosts & brand
Marketing on the apex `useshopkeeper.com`, dashboard on `app.useshopkeeper.com` — **one Next.js app, one Vercel project**. `src/app/(marketing)/page.tsx` is `/`, `src/app/dashboard/` is `/dashboard/*`; nothing is split at the code level.

The app lives on `app.` because the app origin is pinned into Google OAuth + restricted-scope verification, Shopify, Meta, Clerk, `DASHBOARD_URL`/`GATEWAY_INTERNAL_URL`, and Telegram deep links, while the marketing origin is pinned into nothing — marketing can later move to a CMS without touching any of them. `APP_URL` and `NEXT_PUBLIC_APP_URL` must both be `https://app.useshopkeeper.com`; they are equality-checked in production at `apps/dashboard/src/lib/env/index.ts`.

Both hostnames serve every route, so `src/proxy/canonical-host.ts` 307s the app surfaces (`/dashboard`, `/onboarding`, `/select-org`, `/create-workspace`, `/api/integrations`) from any sibling host onto the `APP_URL` host. Without it the `*_oauth_*` handshake cookies — host-only — are set on whichever host the merchant started from and are gone after the provider hop, failing the state check on every connect. `/login` and `/signup` are deliberately *not* in that list; the signup funnel starts on the apex.

**"Shopkeeper" is a working brand, not a registrable mark** — `SHOPKEEP` (Lightspeed, IC 042 SaaS) is live, incontestable, and a `+SHOPKEEPER` application was refused against it in 2024. Operating unregistered is a deliberate decision; see `docs/to-do-list.md` for the findings and the conditions for revisiting. **Never write "ShopKeep"** (no trailing `-er`) in any user-facing surface, bot username, or logo lockup — the `-er` is what distinguishes this product from that mark. Bot/handle convention is the `use` prefix (`@useshopkeeper`, `@useshopkeeperbot`), matching the handles already held on X and Instagram.

## Inbound flow
External webhook → `apps/gateway/src/routes/webhooks.ts` (HMAC verify, enqueue BullMQ) → `apps/gateway/src/message-handlers/` (upsert customer/thread/message, sanitize prompt-injection, dedupe by `externalMessageId`, enqueue summary) → Claude tags + 1-sentence summary → gateway generates the agent plan in-process (`@shopkeeper/agent` planner, `message-handlers/generate-thread-plan.ts`) and caches it on the thread → Telegram notify bound org members. Dashboard polls `/api/threads?status=open` via SWR every 15s (60s for secondary lists, paused when the tab is hidden). When realtime is enabled — `NEXT_PUBLIC_GATEWAY_EVENTS_URL` set — gateway SSE becomes the primary freshness signal and those intervals drop to 60s/120s as a safety net.

## Database (`packages/db/prisma/schema.prisma`)
- `Organization` — Stripe subscription fields + `settings` JSON (agent config)
- `Integration` — per platform per org (access token, expiry)
- `Customer` — unique `(organizationId, platformId)`; `platformId` = email / IG sender ID / phone
- `Thread` — `channelType`, `status` (open/pending/closed), `aiSummary`, `tag`, `shopifyCustomerId`, `cachedPlan`, soft-delete + archive
- `Message` — `senderType`: customer/agent/ai/note. Agent turn transcripts in threads are `note` rows prefixed `__shopkeeper_agent__`; the audit trail is `AgentAction`, not note-row parsing.
- `AgentAction` — first-class audit record per agent tool call (tool, category, status, mode, approver); backs `/api/agent/actions` and the Review page
- `AutonomyShadowDecision` — per-plan shadow record while `autoExecuteMode: "shadow"`: what the agent would have auto-executed vs. what the human decided
- `OperatorContext` — per (org, `memberKey`) operator pending-state only: `pendingPlans` (a newest-last JSONB array, at most one entry per thread), `pendingQuestion`, `pendingDigest` (the approval ledger's backing store). **DB-backed, not Redis.**
- `OperatorEvent` — durable inbound operator-message record (P4-03, complete): persisted+enqueued before the webhook ack, claimed once by the operator-event worker, unique `(channel, providerMessageId)` for dedupe. Always on for Telegram and iMessage. A 15-min `operator-event-sweep` maintenance job reconciles stale `claimed` rows to `unknown` and re-sends committed-but-undelivered replies.
- `OrgMember` — extends Clerk org membership; Telegram chats bound via `OrgMemberTelegramChat`
- `KnowledgeBase` (`source: "user" | "shopify"`) / `KbArticle` (tagged for context filtering) / `KbCitation` (per-thread article citation events)
- `VoiceEdit` — merchant edits to AI drafts, consumed by gateway voice synthesis to refine the brand-voice brief

## Channels
Email (Postmark inbound/outbound + Gmail native OAuth inbound via Pub/Sub push), Instagram DM (Meta OAuth), Telegram (operator-only, single Shopkeeper bot), iMessage (operator-only, single platform-wide Photon Spectrum line for all orgs — no per-org credentials; merchants link a handle by texting a single-use code, routed by the sender→member binding), Shopify (OAuth + webhooks). TikTok Shop is fully wired but gated off (`TIKTOK_SHOP_ENABLED=false`): signed webhook → normalize → queue → worker, plus outbound dispatch and OAuth. WhatsApp is not built.

Internal-only `channelType` values (not user-facing): `dashboard_agent` (Concierge sessions), `sms_agent` (operator threads via Telegram — legacy name).

## Agent core (`packages/agent/`, imported as `@shopkeeper/agent/*`)
Canonical location for all agent logic; both apps import it via subpath exports.
- `context.ts` — `buildContext()` (loads thread, customer, recent messages, KB, recent orders)
- `planner.ts` — `planAgent()` (generates plan with no side effects, caches in `Thread.cachedPlan`)
- `run.ts` — `runAgent()` (executes approved plan or runs an instruction end-to-end)
- `prompt.ts` — system prompt builder
- `intent.ts` — customer-prose guard signals (mutative-intent detection over message text)
- `plan-preview.ts` — classifies plans as `quick_reply` vs `needs_review` for the dashboard home
- `tools/registry/` — all tool definitions (Anthropic format), `TOOL_CATEGORIES`, `PLAN_STEP_LABELS`, `TOOL_LABELS`, input types
- `tools/executor.ts` — tool dispatch + policy enforcement (`maxRefundAmount`, `blockCancellations`, etc.)
- `shopify/*.ts` — Shopify API implementations
- `settings.ts` — defaults + resolver. Settings live in `Organization.settings` JSON.
- `thread-auth.ts`, `plan-cache.ts`, `plan-cache-shape.ts`, `turns.ts`, `turn.ts`, `plan-execution.ts` — route-facing helpers

### Dashboard host adapters (`apps/dashboard/src/lib/agent/`)
Not a copy of the core — these inject dashboard infrastructure into it:
- `context.ts` / `run.ts` — wrap core `buildContext`/`runAgent` with the thread I/O sink and ops-alert recorder
- `tools/thread.ts` — the actual thread I/O sink (send reply/email, escalate)
- `runner.ts` — barrel composing core + wrapper exports
- `api/*` — Next.js route glue (validation, sessions, action-log, dashboard approval, turn seams)
- `__evals__/` — agent eval harness, wired to `test:evals` / `test:evals:baseline`

Modes:
- **Support** — ticket threads. Auto-plan on open if last message is from the customer; plan cached in `Thread.cachedPlan`. `ActionPlanCard` → approve → `POST /api/agent`. Manual invoke via `@{agentName}` in the ticket composer.
- **Operator** — `/dashboard/agent` (Concierge: each session opens a new `dashboard_agent` thread and closes the previous), and Telegram/iMessage via `sms_agent`: one durable operator thread per binding; pending approvals are agent state + control tools (approve/reject/revise/answer the pending plan), with a keyword fast path for literal yes/no/help.
- **Shop management** — operator turns only, via gateway `moduleTools` (`operator-shop-tools.ts`): flash sales over the whole catalog or named variants, ending them, and enumerated repricing. Every write declares its Shopify scope. A support thread cannot reach these. **Nothing bounds the size of the change** — no variant cap, no discount-depth ceiling, no revenue-at-risk limit (removed 2026-08-29). A merchant setting their own prices knows what it costs them, and the guard that second-guessed it also blocked the undo of a write it had permitted. Operator-only reachability plus the merchant's own approval is the containment; do not reintroduce a bound without one.
- **Composer-ask** — read-only Q&A inside the support composer (`POST /api/agent/ask`). Calls `runAgent(..., { readOnly: true })`, which filters tools to `read` category and never mutates anything.

Read tool list and exact behavior from `packages/agent/src/tools/registry/` — do not infer.

`Organization.settings` keys: `agentName`, `aiContext`, `brandVoice`, `autoPlanOnOpen`, `defaultInstruction`, `requireApprovalForActions`, `autonomyTier` (watch/guarded/trusted; stored `broad`/`full` map to trusted), `autoExecuteMode` (off/shadow/live; legacy boolean `autoExecuteEnabled` is migrated), `toolsEnabled` (action/communication/internal/read), `maxRefundAmount`, `blockCancellations`, `blockCustomLineItems`, and `maxIterations` (default 10). Note that `autoPlanOnOpen`, `maxIterations` and `blockCustomLineItems` are read but have no writer in either app.

### Agent-change invariants
Standing rules for any change to agent behavior (promoted from the 2026-07 behavior plan):
- **Don't touch the support-planner surface without the eval gate.** Operator-only changes ship as gateway `moduleTools` (`apps/gateway/src/message-handlers/operator-*-tools.ts`), **not** the shared registry, and prompt edits stay inside the `isOperatorMode` branch of `packages/agent/src/prompt.ts`. Operator prompt changes are verified by live phone round-trip, not evals.
- **Land agent-path work through a pull request.** Since 2026-08-27 `evals.yml` also triggers on `push: branches: [master]`, so a direct push runs the **free preflight** and an ungated agent change shows as a red check within minutes — but it reports, it does not block, and no paid lane runs outside `workflow_dispatch`. A PR is still how agent-path work lands. 31 of 34 agent-path commits between 2026-08-09 and 08-19 bypassed the gate before that trigger existed, planner-behavior changes among them; that backlog, not CI, is what the eval bill was paying for.
- **The gate trigger is "can this change move an assertion?" — not "did it touch a gated path?"** The `paths` filter is deliberately coarse; the reasoning is not. Read what the fixtures actually assert before booking a paid run. Worked example: `groundEscalationReasons` rewrote `escalate_to_human` reason text, but zero fixtures assert on that tool's inputs and `judge.ts` grades only `replyText`, so it provably could not move a result and owed no run. A tool *description* edit is the opposite case — it sits in the prompt the model reads, so it is gated even when no assertion names it.
- **Justify every eval run** before making it; single-fixture probes for diagnosis, no tune-then-rerun loops.
- **Ticket text is untrusted.** Any customer-derived prose reaching an operator turn is wrapped in `<customer_message>` tags (`wrapUntrusted` in `packages/agent/src/message-history.ts`) — tool results, `aiSummary`, digest/briefing blurbs, and pending-state ledger text, not just raw message bodies.
- **Deterministic keyword fast paths stay** (`yes`/`no`/`OPEN n`/…). They're a latency win and muscle memory; make the model path capable and the fast-path copy warmer rather than removing them.
- Proactive/mutative monitors are flag-gated and notify-only until their rollout gate lands; enabling a flag never bypasses a gate.
- Keep the agent core host-agnostic and thread-optional. Add narrow injected seams only for real host differences. New modules reuse the existing run, spend, policy, observability, and tool contracts — no speculative plugin framework.
- Read-only and flag-only modules may ship behind a feature flag. External writes require reviewable shadow evidence and an explicit rollout gate **distinct from** the monitor flag.
- **Shop-management writes stay operator-only.** A promotion or reprice tool in the shared registry is reachable from a customer ticket, which is how "give me 90% off everything" becomes a plan step. They ship as gateway `moduleTools`, and a test asserts they never appear in `TOOL_DEFINITIONS`. Promotions are expiring automatic discounts, never price edits; no refund tool lets the model name the amount. **What a write may target follows how reversible it is, not how large it is.** A sale is one discount object that Shopify expires on its own and one delete undoes exactly, so it may cover the entire catalog — `create_flash_sale` takes `applies_to: "entire_catalog" | "variants"` (2026-08-29). `set_variant_prices` is N permanent edits whose only rollback is the original prices in its own result, so it still names every variant, and a bulk undo that can half-fail is the reason. Enumeration was never a size bound: with the value-at-risk guard gone a merchant can discount everything by listing it, so requiring the list only taxed the honest request while leaving the dangerous one reachable the long way round.
- **One decision, one owner.** `decideAutonomy` is the only planning/preview autonomy owner; execution-time policy is the authoritative current-state backstop. Never add a fifth site that re-derives "may this run without a human?".
- **Validate, don't repair.** Invalid plans are preserved for diagnosis and cannot execute. Never repair model output and ship the remainder — returning the plan to the merchant with a reason beats shipping a half-correct one.
- **Never replan after an unknown provider outcome.** Unknown means escalate. Only a *definite* failure earns the one bounded replan.
- **Merchant preferences are guidance only.** They never change caps, policy, authentication, or autonomy tier, and an inferred preference is never auto-promoted.
- **Never ask the merchant to approve or decide an item whose request cannot be shown.** If context cannot be recovered, ask them to open the thread instead of asking for a decision.
- **Never remove support for persisted data** on the strength of fixture migration or code age alone. Inventory live rows first; a version still holding actionable state is not retired.
- **Customer-facing input stays in capture-mode planning** with deterministic adjudication.
- **A new financial tool needs a prompt branch, not just a registry entry.** The compensation decision tree enumerates what is allowed and escalates the rest, so a tool absent from it is unreachable-to-unreliable whatever its description says. Adding to the shared registry also adds it to every support fixture's option set — grep the fixtures whose scenario the tool's own description claims *before* booking the gate.
- **A validator rewrite that narrows what it inspects can loosen a safety check** while reading as a pure fix, and its own new tests will agree with it. Diff old against new verdicts on the same inputs; it costs nothing.
- **The completion bar** for a milestone — outcome, compatibility, deterministic coverage, model evidence, production canary, rollback, documentation — and the relaxed pre-user standard that currently applies are recorded in `AGENT_AUDIT.md`. A green component test, paid eval, or one live message is not sufficient by itself.
- **Order-ops** stays flag-and-notify-only: `runOrderOps` selects read tools plus `flag_order` only. It sits outside autonomy tiers (`flag_order` sets `policy.categoryPermission: false`). Before any mutating order action: shadow period, P1 execution-claim rollout verified, per-module cap enforcement proven, and a separate rollout gate from `ORDER_RISK_MONITOR_ENABLED`.

## Other entry points
- `apps/gateway/src/health.ts` — `/health` (liveness only, touches no dependency — point uptime monitors here; a recurring DB check keeps the Neon compute from scaling to zero), plus `/health/deep` and `/health/queues` diagnostic endpoints

## Env
Names live in each app's `.env.example`; values in Vercel/Railway.

Both `DATABASE_URL`s append `?pgbouncer=true&connection_limit=1`. `TOKEN_ENCRYPTION_KEY` (AES-256-GCM, 32 raw bytes — hex64, base64, or 32 ASCII chars) encrypts `Integration.accessToken`/`refreshToken` at rest, applied transparently via Prisma `$extends`; same value in both apps; required in production.

## Architecture
Design law, derived from the 2026-08-21 pipeline audit (`AGENT_AUDIT.md`, which holds the
evidence and the phased work order). These describe the direction every change moves in,
including changes that don't mention them. Moving away from one needs a reason in the diff.

- **Never branch on prose.** Control flow reads codes, enums, and typed fields; English is
  display-only. `warningBlocksQuickReply` used to decide whether the agent may act without a
  human by substring-matching a sentence another module wrote, and producer and test had
  already drifted to different sentences. It is gone: plan conditions are
  `PlanSignal { code, severity, message }` (`packages/agent/src/plan-signals.ts`), severity
  is resolved once in `planAgent`, and `message` is display-only. New decision points carry
  a `code`, not a `.includes(`. Adding a case to a prose matcher is never the fix.
- **Validate, don't repair.** A wrong model output is evidence the model misunderstood the
  situation, not a sentence to edit. The planner used to run six sequential repair passes,
  two of which deleted sentences from the reply the customer would read; shipping the
  remainder is a worse failure than stopping. They are gone — `validatePlan` now grades the
  proposal exactly as authored and an invalid plan stays intact so the merchant can see what
  failed. The one thing that still discards a proposal is structural escalation evidence,
  and it discards it wholesale rather than editing it. Where a schema can express the rule,
  put it in the tool schema rather than in a later pass.
- **Compose from fields; don't rewrite sentences.** The classifier emits structured facts and
  the surface renders them. It must never emit an English sentence that a downstream layer
  re-tenses, re-subjects, re-punctuates, and truncates — that is what grew the digest
  briefing into a hand-rolled NLP engine larger than the agent it serves. It has since been
  broken up into `apps/gateway/src/maintenance/digest-briefing/`, which bounds the damage
  without changing the lesson. Control length by choosing which fields to render, never by
  cutting a string.
- **One decision, one owner.** "May this run without a human?" was once answered in four
  places across two packages, chained through a mutable `plan.routing` field, with static
  policy evaluated twice. It is now `decideAutonomy`, one function with one return type, and
  execution-time policy is the authoritative current-state backstop behind it. A decision
  re-derived at each call site has no owner and nothing keeps the copies agreeing — so call
  `decideAutonomy`, never add a site that re-derives its answer.
- **One helper per concept.** "What do we call this person" once had five implementations and
  reported a verified customer to the merchant as an anonymous visitor. `customerFirstName`,
  `endSentence` and `lowerFirst` had each drifted into two versions with different trimming;
  each is now defined once. Grep before writing a text/format helper.
- **Growth by special case means a capability is missing.** A prompt bullet, a repair pass, a
  regex carve-out, or a per-phrase fix added in response to one observed bad output is a
  signal to find the missing structure, not a fix worth keeping. `SUPPORT_INSTRUCTIONS` was
  27 bullets when this was written and is over fifty now, which is the law being broken
  rather than followed; most describe invariants a schema or the executor could enforce
  structurally.

## Coding
- Don't add features, comments, error handling, or abstractions beyond what's asked. This
  bounds the diff, not the judgment: when the ask sits on top of a structural problem — a
  fifth copy of a helper, a seventh repair pass, a new branch on prose — build what was
  asked, then name the problem in a sentence. Staying silent is how the digest briefing
  passed a thousand lines one reasonable minimal diff at a time.
- **Local verification is free; model calls are not.** Typecheck, lint, and unit/integration
  runs cost nothing — run them without asking and before every push. Only live-model runs
  (`test:evals*`, anything setting `EVAL_RUN=1`) need justifying. Eval-cost discipline is
  never a reason to skip `npm run typecheck`.
- **Run the whole suite, not the files you touched, before closing anything.** Milestones 4 and 6 both closed on targeted green runs; a full `npm run test:integration` would have caught a stale job count and an acceptance test that only passes on an empty database. Targeted runs are for the edit loop, never for the close.
- **A red static stage hides everything behind it.** `Static Verification` gates Build, Integration/Coverage and E2E in `ci.yml`. One unused export over the knip baseline skipped all three for two commits and let broken tests reach `master` unseen. A knip baseline failure is a blocked pipeline, not a lint nit.
- **A migration that ships behind its code is an outage, not a lag.** Milestone 5 shipped `loadActiveMerchantPreferences` to production while its table did not exist; the `P2021` threw out of an uncaught `Promise.all` in `buildContext` and every inbound message went unplanned for a day. Read production `migrate status` before closing anything that adds a table, and give every fan-out load in `buildContext` its own catch.
- **Cite names, not line numbers or counts.** A doc is read to decide what to build, so a
  stale citation costs a whole investigation before anyone thinks to check it — and it reads
  as authoritative the entire way. `npm run lint:structure` resolves every path-plus-line
  citation in the docs and fails when one drifts onto a closing brace, but it cannot check "27
  prohibitions", "four places", "1,068 lines", or a number measured on one code path and
  quoted about another. Those rot silently and have. Name the symbol, say which path a
  measurement came from, and date it.
- **Fetch before building.** Check whether the work already exists (`git fetch`, open PRs) before starting a parallel implementation.
- Read the file before editing it.
- Edit existing files. Don't create new ones unless necessary.
- Tailwind classes, not inline `style`.
- Real DB in tests; never mock the DB.
- `test-setup.ts` defaults `E2E_TEST_RUN=true` so rate-limited route tests pass on a bare `vitest run` — `rate-limit.ts` fails **closed** unless `NODE_ENV === 'development'`, and with no Upstash env under vitest every request would 429. Pass `E2E_TEST_RUN=false` to opt back into enforcement. A wall of 429s means the flag got unset, not that your change broke something.
- Target user is a solo merchant / small team — optimize for simplicity, not power-user features.
- Skip end-of-task summaries. The diff speaks.

## Debugging discipline
- Read source, not build artifacts. `.next/`, `dist/`, and compiled chunks are off-limits for diagnosing UI/runtime bugs. Reaching for them means you've run out of real hypotheses — say so and stop.
- When something you just edited broke, `git diff` is the first move. Read your own changes before forming any theory.
- Never propose "clear the cache" / `rm -rf .next` / restart the dev server as a fix. Dev mode invalidates on file change. If you genuinely think an artifact is stale, prove it by diffing file contents — not mtimes.
- User-reported evidence is load-bearing. If they say "no console errors," do not propose causes that would produce console errors (missing imports, render crashes, undefined components). Rule those out and move on.
- Two failed hypotheses = stop. Summarize what's been ruled out and ask what they see (DOM tree, computed styles, network tab) before pivoting to a third theory.
- For "element doesn't render / isn't clickable" bugs, the cause lives in: the component source, parent layout, CSS (display/visibility/pointer-events/z-index/overflow), or a wrapping conditional. Not the build system.
