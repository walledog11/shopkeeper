# iMessage Integration Plan

**Goal:** add **iMessage** as a customer-facing support channel via **Photon's Spectrum**
(`spectrum-ts`), modeled on the existing Instagram DM path but using Spectrum's SDK for inbound
(webhook) and outbound (conversation reconstruction) rather than a raw REST + HMAC integration.
The agent core stays channel-agnostic; this is a new channel adapter plus the provisioning and
deliverability plumbing that iMessage specifically requires.

Written 2026-06-17.

> **Status (2026-06-21): code-complete and live-verified.** All phases (0–5) shipped; the full
> round-trip was proven on a real iPhone (inbound→webhook→worker→DB and outbound→`space.send()`→iPhone
> with `sendStatus` flipped `sent`) on a free shared-pool line. Hard-constraint #6 (stranded `pending`)
> is resolved via the channel-agnostic `OUTBOUND_SEND_SWEEP`. Remaining work is **not code**: the
> per-org Photon connect, the commercial line-tier decision (item 4), and the optional send-pacing
> guard. See **"Deploying to prod"** below for the Vercel/Railway runbook.

> **Vendor framing.** Apple has no official iMessage API. The only paths are (a) run a Mac with
> your Apple ID (BlueBubbles/AirMessage, and Photon's open-source `imessage-kit` — a non-starter
> for multi-tenant SaaS), or (b) a provider that operates **managed iMessage lines**. Photon's
> hosted **Spectrum** is the (b) path. **Use the hosted Cloud-mode SDK only; never the local
> SDK.** Docs: <https://photon.codes/docs/spectrum-ts/introduction>.

---

## Why this fits Shopkeeper's architecture

Photon's own recommended architecture is a **queue/worker pipeline that dedupes on `message.id`
and persists per-chat state** — which is exactly Shopkeeper's gateway: `webhooks → BullMQ →
message-handlers → processInboundMessage` with `externalMessageId` dedupe. The agent core
(`packages/agent/`) is channel-agnostic, so planner/run/executor/tools need **zero changes**.

What's genuinely new vs. the IG/email channels:

1. Inbound and outbound go through the **`spectrum-ts` SDK**, not hand-rolled HTTP.
2. Outbound is **decoupled** in Shopkeeper (human-approved later), so we must **persist the
   Space id** to reconstruct the conversation in a separate process.
3. iMessage has **no delivery confirmation** and **strict deliverability rules** (inbound-first,
   anti-burst, per-line conversation caps) that shape product behavior, not just code.

---

## How Spectrum actually works (the facts the plan is built on)

- **SDK init** (per project = per org):
  `Spectrum({ projectId, projectSecret, webhookSecret, providers: [imessage.config()] })`.
  Cloud mode (default) talks to Spectrum Cloud over **gRPC** — wants a long-lived process.
- **Inbound = webhooks, inbound-only.** `app.webhook(req, handler)` verifies HMAC-SHA256 over
  `v0:<timestamp>:<rawBody>` (5-min replay window) and calls `handler(space, message)`.
  - First-party **Express adapter** (`spectrum-ts/express`) and a manual overload
    `app.webhook({ body, headers }, handler)` returning `{ status, headers, body }`.
  - **Raw body is mandatory** — HMAC is over exact wire bytes. *This gateway already solves that
    globally:* `index.ts:18` registers `express.json({ verify })`, which captures `req.rawBody` on
    every request; the Meta and Shopify webhooks verify HMAC against it with **no parser bypass**.
    The Photon route reads the same `req.rawBody` — do **not** reorder middleware or add
    `express.raw()`. (`verify` only fires for `application/json`, which Spectrum sends.)
  - Handler is **fire-and-forget, runs after the HTTP response**, **at-least-once** → must be
    idempotent; **dedupe on `message.id`**.
  - Source: <https://photon.codes/docs/spectrum-ts/webhooks>,
    <https://photon.codes/docs/webhooks/events>.
- **Outbound = reconstruct the conversation.** A Space has a **stable `id`**
  (e.g. `any;-;+15551234567`). In any process:
  `const im = imessage(app); const space = await im.space.get(id); await space.send(text)`.
  Or `im.user("+1555…")` → `im.space.create(user)`. Use a **stable `clientGuid`** per send so
  transport-level dedupe is safe across retries.
  Source: <https://photon.codes/docs/spectrum-ts/spaces-and-users>,
  <https://photon.codes/docs/best-practices/recovery-and-state>.
- **Message shape:** `{ id, content, sender, space, platform, timestamp, direction }`;
  `content` is a discriminated union — narrow on `content.type`
  (`text | attachment | voice | contact | richlink | reaction | poll | custom`); attachments
  rehydrate lazily via `content.read()`. `message.sender.id` is the platform user id (phone/
  email). Source: <https://photon.codes/docs/spectrum-ts/messages>.
- **Provider / provisioning:** `imessage.config()` (Cloud). Lines are tiered —
  **Free/Pro = shared number pool** (sender number varies per recipient);
  **Business = dedicated line** + auto-scale. Features (Cloud): attachments, tapbacks, typing,
  threaded replies, groups, mini-app cards, effects.
  Source: <https://photon.codes/docs/spectrum-ts/providers/imessage>.
- **NO delivery/receipt/failure webhooks.** Webhooks deliver inbound only; a sent message does
  not echo back. Delivery/read events are only "emittable" on the streaming connection and are
  **not confirmed for iMessage**.
- **Deliverability is inbound-first.** Apple flags/bans lines for bursts, cold outreach, and
  hammering non-responders. Hard caps: **50 new conversations/line/day** and **5,000
  messages/server/day**. Source: <https://photon.codes/docs/best-practices/imessage-deliverability>.

---

## Architecture decision: host the Spectrum app in the gateway

Cloud mode uses a gRPC client that wants to be long-lived; the gateway is already a persistent
process and the natural home for it. **The gateway owns a per-org cached `Spectrum` app**, used
for webhook verification, attachment rehydration, and **outbound**. The dashboard does **not**
call Photon directly — `dispatch-message.ts` enqueues to the gateway, exactly like the existing
async-email path (`apps/dashboard/src/lib/messaging/dispatch-message.ts:161`). This avoids
cold-starting a gRPC app per Vercel serverless send and keeps one app instance per org.

---

## Phased delivery (each phase ≈ one session, independently verifiable)

Sequenced so each phase compiles and is verifiable on its own, with the risky external unknown
isolated up front. **B** = buildable now against the codebase; **P** = blocked on a Photon answer
(see "Must-resolve with Photon" below). The build-plan sections (§1–§5) are the file-by-file detail
for these phases.

- **Phase 0 — Spike & dependency (P, do first, alone).** Add the `spectrum-ts` dependency (confirm
  the exact package name — it is in **no** package.json today), prove it imports and builds in the
  gateway's ESM/NodeNext toolchain (gRPC native bits included), and answer the four must-resolve
  questions with a throwaway script that inits a `Spectrum` app and round-trips `space.get()`.
  **Gate the whole project on this** — it holds the only real unknowns. Verify: the script
  sends/receives one real message on a test line.
  - **Status (2026-06-17): toolchain GREEN, code path de-risked.** `spectrum-ts@4.2.0` added to the
    gateway and import-verified under NodeNext ESM (`Spectrum`, `imessage.config()`, and
    `spectrum-ts/express` all resolve at runtime; the whole dep tree — `@grpc/grpc-js` + `nice-grpc` +
    `@bufbuild/protobuf`, and the bundled pure-TS `imessage-kit` — is **pure JS, no native build, no
    macOS pin**, so it installs on the Linux gateway). Package manager is **npm workspaces** (not
    pnpm). API surface validated against shipped `.d.ts`: webhook raw overload
    `webhook(WebhookRawRequest, handler): Promise<WebhookRawResult>`, first-class `Space` + `space.send`,
    enqueue-time `clientGuid`. `Spectrum()` is **async** (`await`) — the per-org factory must cache the
    awaited app/promise. **Residual (needs the user):** a Photon account + project creds + a
    provisioned line to run the live send/receive round-trip and measure `space.get()` latency, plus
    the commercial answers in item 4 below.
  - **Update (2026-06-21): live round-trip VERIFIED, residual closed.** Real iPhone
    inbound→webhook→worker→DB and outbound→`space.send()`→iPhone with `sendStatus` flipped `sent`, on
    a free shared-pool line; the Shopkeeper code needed zero changes (every failure was Photon-side
    config). What remains is **only** the item-4 commercial answers (Business-tier pricing/
    dedicated-line provisioning, SMS/RCS fallback) and an unmeasured `space.get()` latency.
- **Phase 1 — Schema + constants (B).** §1. Verify: `prisma generate`, migration applies, both apps
  typecheck, zero behavior change. Safe to merge alone.
  - **Status (2026-06-17): COMPLETE.** Added `ChannelType.imessage`,
    `Thread.externalSpaceId`, the Prisma migration, gateway queue/job constants, and
    `CHANNEL_TYPE.IMESSAGE`. Verified with `prisma generate`, applied migration
    `20260617000000_add_imessage_channel`, and passed gateway + dashboard typechecks.
- **Phase 2 — Spectrum app factory (B, after 0+1).** §2. Verify: a unit test builds a per-org app
  from a fake `Integration` and caches it.
  - **Status (2026-06-17): COMPLETE.** Added the gateway Spectrum client factory, credential
    validation, per-integration async app-promise caching, DB lookup helpers for webhook
    integration id and outbound org id, and cache reset support. Verified with the focused
    gateway Spectrum client test and gateway typecheck.
- **Phase 3 — Inbound (B, after 2).** §3. Verify: POST a captured Spectrum webhook body to the route
  → a customer/thread/message appears with `externalSpaceId` set, and a replay dedupes.
  - **Status (2026-06-18): COMPLETE.** Added the Photon/Spectrum webhook route at
    `/webhooks/photon/:integrationId`, raw-body handoff to Spectrum's webhook verifier, iMessage
    content normalization + attachment upload, inbound queue payloads with `externalSpaceId`, the
    inbound worker branch, `handleImessageJob`, and thread persistence/backfill for the Space id.
    Verified with gateway typecheck, lint, full gateway integration suite, and mocked-Spectrum
    webhook tests for text, attachments, missing raw body, worker persistence, and replay dedupe.
    Live Photon send/receive remains the Phase 0 residual pending real credentials.
- **Phase 4 — Outbound (B, after 2; heaviest but fully templated).** §4, the 3-part clone. Verify: an
  approved reply flips a `pending` row to `sent` and the test line receives it; a forced `send()`
  throw lands `failed` with an `opsAlert` log.
  - **Status (2026-06-20): COMPLETE (code + unit tests; live send remains the Phase 0 residual).**
    Cloned the `OUTBOUND_EMAIL_ASYNC` path end to end: dashboard `enqueueOutboundImessage` + an
    always-async `dispatchImessageAsync` branch (no sync fallback), the `sendReply` tool-gate +
    success branch (honest "Reply queued" wording — never implies delivery), the gateway
    `/internal/queue/outbound-imessage` route, the `outbound-imessage` worker + handler
    (`im.space.get(externalSpaceId)` with an `im.user()`→`im.space.create` fallback, `sent`-on-ack /
    `failed`-on-throw, config errors fail fast, `opsAlert` on permanent failure), and the
    `core.ts` / `types.ts` / `gateway-queues.ts` wiring. Verified with gateway + dashboard typecheck,
    lint, and tests (handler, internal-queue route, worker-registration, dispatch-message). **Two
    deviations from the plan:** (1) `spectrum-ts@4.2.0` `space.send()` exposes **no
    `clientGuid`/idempotency key** (grep-verified against the shipped `.d.ts` overloads), so
    cross-retry dedupe rests solely on the `sendStatus` gate — the same risk profile as the email
    worker, not better. (2) The stranded-`pending` sweep (hard-constraint #6) was **deferred** here and
    **resolved 2026-06-21** by generalizing the existing email sweep to `OUTBOUND_SEND_SWEEP`.
- **Phase 5 — Provisioning UI + deliverability guards (B, after 3+4).** §5 plus the inbound-first
  rule, send-pacing/coalescing, and caps surfaced. Verify: connect flow stores an encrypted
  `Integration` and shows the webhook URL; the agent refuses to open a cold outbound conversation.
  - **Status (2026-06-21): COMPLETE (code + unit tests; live connect remains the Phase 0 residual).**
    *Provisioning:* added the `imessage` catalog entry + `connectType`, a self-contained
    `ImessageConnectBody` credential form, and `POST /api/integrations/imessage` storing the Spectrum
    creds on an encrypted `Integration` (projectId→`externalAccountId`, projectSecret→`accessToken`,
    webhookSecret→`refreshToken`). The per-org webhook URL (`/webhooks/photon/:integrationId`, built
    server-side from the gateway base URL — there is no `NEXT_PUBLIC_` gateway URL) is returned by the
    route and surfaced persistently on the connected card via `ImessageWebhookPanel` (added to the GET
    serialization). *Channel sweep:* `imessage` added to `FILTER_IDS`, `INBOX_CHANNEL_TYPES`, and
    `DASHBOARD_CHANNEL_TYPES` (`channels.ts` already carried the label/icon from Phase 3).
    *Inbound-first guard:* `dispatchImessageAsync` refuses any send on a thread with no stored Space,
    the outbound worker dropped its `im.space.create` cold-start fallback (fails the row instead), and
    the agent receives an honest refusal message. *Deliverability copy* (inbound-first, ~50 new
    conversations/line/day cap, Business-line recommendation) surfaced in the connect + webhook UI.
    Verified with dashboard + gateway typecheck, lint, and tests (new iMessage route test, updated
    outbound-worker + dispatch-message guard tests, channels unit). **Deferred:** send-pacing/
    coalescing (plan-optional, not a verify criterion). The stranded-`pending` sweep
    (hard-constraint #6, carried over from Phase 4) was **resolved 2026-06-21** — see #6 below.

Phases 3 and 4 are independent once 2 lands and can go in either order. A failed Phase 0 is a signal
to renegotiate scope, not to push forward.

## Build plan (file by file)

### 1. Schema + shared constants

- `packages/db/prisma/schema.prisma:15` — add `imessage` to `enum ChannelType`; `prisma generate`
  + migration (regenerates `DbChannelType`, which `processInboundMessage`/`dispatchMessage`
  already key off — no logic change there).
- **New column** `Thread.externalSpaceId String? @map("external_space_id")` — the Space id needed
  to reconstruct the conversation for approved-later outbound. (`Customer.platformId` already
  stores the sender phone/email, matching `im.user(phone)`.)
- `apps/gateway/src/constants.ts` — `CHANNEL.IMESSAGE = 'imessage'`, `JOB.IMESSAGE`,
  plus `QUEUE.OUTBOUND_IMESSAGE` + `JOB.SEND_IMESSAGE` (mirror the outbound-email pair at
  `constants.ts:26,51`).
- `@shopkeeper/agent/thread-constants` — add `CHANNEL_TYPE.IMESSAGE` (consumed by
  `dispatch-message.ts` and `tools/thread.ts`).

### 2. Per-org Spectrum app factory (gateway)

- New `apps/gateway/src/clients/spectrum.ts` — cache one `Spectrum({ projectId, projectSecret,
  webhookSecret, providers: [imessage.config()] })` per org, built from the org's `Integration`
  credentials. Used by inbound verify, attachment rehydrate, and outbound send.

### 3. Inbound (mirror Instagram, SDK-mediated)

- New `apps/gateway/src/routes/webhooks-photon.ts` — per-org path (e.g.
  `/webhooks/photon/:integrationId`) so we load the right `webhookSecret`. Feed the existing
  `req.rawBody` (captured globally by `express.json({ verify })` at `index.ts:18` — the same source
  Meta/Shopify verify against) to `app.webhook({ body: req.rawBody, headers: req.headers },
  handler)`; **no parser bypass needed**. Mirror `webhooks-meta.ts:33-127` for rate limiting + org
  resolution; register alongside the other `registerXWebhookRoutes` calls in `webhooks.ts` (lines
  19-22).
- Inside the handler (fire-and-forget, at-least-once): narrow `message.content.type`, capture
  `message.id`, `message.sender.id`, `space.id`, download attachments via `content.read()` → blob
  (reuse `uploadInboundAttachment`), then `getMessageQueue().add(JOB.IMESSAGE, { platform:
  CHANNEL.IMESSAGE, organizationId, senderId, text, externalMessageId: message.id, externalSpaceId:
  space.id, attachments, traceId })`. Dedupe is handled downstream by the existing
  `externalMessageId` check.
- `apps/gateway/src/workers/inbound.ts:24` — add an `IMESSAGE` branch → `handleImessageJob`.
- `apps/gateway/src/message-handlers/channels.ts` — `handleImessageJob` calls the unchanged
  `processInboundMessage(orgId, senderId, CHANNEL.IMESSAGE, text, q, { externalMessageId,
  attachments, traceId, … })`.
- `apps/gateway/src/message-handlers/inbound-persistence.ts:51` — one small addition: accept and
  persist `externalSpaceId` onto the Thread at create time (`:107`).

### 4. Outbound (dashboard enqueues → gateway sends) — a **3-part** clone of the email async path

The `OUTBOUND_EMAIL_ASYNC` path is the exact template, and it is three files plus worker wiring,
not a single worker. Mirror each part:

- **Dashboard enqueue.** `dispatch-message.ts:145` — replace the `else { Unsupported channel }`
  reject with an `IMESSAGE` branch that pre-creates the agent message as `pending` (its id is the
  stable **clientGuid**) and calls a new `enqueueOutboundImessage` helper — a clone of
  `enqueue-outbound-email.ts`, which does **not** touch BullMQ but POSTs to a gateway internal-queue
  route under `INTERNAL_API_SECRET`. `sendStatus` is the source of truth. iMessage has no
  synchronous fallback (unlike IG it *always* goes async), so it returns optimistically exactly like
  `dispatchEmailAsync` (`:161`).
- **Dashboard tool gate.** `apps/dashboard/src/lib/agent/tools/thread.ts:81` — add `IMESSAGE` to the
  allowed-channel gate and a third success-message branch at `:96`.
- **Gateway internal-queue route.** `apps/gateway/src/routes/internal-queue.ts:22` — add a
  `/queue/outbound-imessage` handler (clone of `/queue/outbound-email`) that adds `JOB.SEND_IMESSAGE`
  to `QUEUE.OUTBOUND_IMESSAGE`.
- **Gateway outbound worker.** New `apps/gateway/src/workers/outbound-imessage.ts` +
  `message-handlers/outbound-imessage.ts` (clone of the email pair) — get the cached org app,
  `const space = await imessage(app).space.get(externalSpaceId)` (fallback `im.user(platformId)` →
  `im.space.create`), `await space.send(text)` with the message id as `clientGuid`, flip
  `Message.sendStatus` → `sent`/`failed` via the same `markFailed` + idempotency-on-`sent` gate.
  **Record failures gateway-side** the way `message-handlers/outbound-email.ts:98` does — a
  `logger.error({ opsAlert: true, … })` line — **not** via the dashboard's `provider-send-failures.ts`
  (the gateway can't import dashboard code, and that module is only on the synchronous IG path).
- **Wiring + types.** Register `createOutboundImessageWorker` in `workers/core.ts` (instantiate, add
  to the `workers:` array, extend `CoreWorkerResources`), and add `OutboundImessageJobData` to
  `apps/gateway/src/types.ts` (plus extend `InboundJobData` with the inbound `externalSpaceId`).

### 5. Provisioning + UI

- `/dashboard/integrations` connect card + API route storing an `Integration` (platform
  `imessage`; `externalAccountId` = projectId; `accessToken` = projectSecret; `refreshToken` =
  webhookSecret — all auto-encrypted by the Prisma `$extends`). Surface the per-org webhook URL to
  paste into Photon's dashboard.
- Channel-label/icon sweep wherever `CHANNEL_TYPE.IG_DM` is mapped in `apps/dashboard/src`
  (thread list, badges, filters).

---

## Hard constraints to design around (the real story, not the wiring)

1. **No delivery confirmation.** `space.send()` resolving means *accepted*, not *delivered*;
   there are **no receipt webhooks** and stream events aren't confirmed for iMessage. This is the
   principle-3 (trust-is-binary) gap. Decide explicitly: treat send-ack as best-effort, flip
   `failed` only on a thrown error, and **do not imply delivery certainty to the merchant**.
   Revisit a gateway streaming consumer only if iMessage delivery events ever ship.
2. **Inbound-first only.** Lines get banned for cold/bursty outbound. Great for support (customer
   texts first); means **no proactive iMessage** (shipping notifications, marketing) in v1.
   Enforce a rule: the agent replies only inside an existing inbound conversation.
3. **Send-pacing guard.** A multi-step plan firing several `send()`s in seconds looks automated →
   flag risk. Coalesce agent output into one message or throttle. (Photon's inbound-pipeline doc
   even recommends a ~5s debounce/batch — optional but aligned.)
4. **Plan tier is a product decision.** Free/Pro shared pool varies the sender number per
   recipient → breaks store identity + threading. **Business dedicated line is effectively
   required** for a real support channel. Cost flag.
5. **Caps: 50 new conversations/line/day, 5,000/day.** A busy merchant exceeds 50 → needs Business
   auto-scale. Surface in onboarding/limits.
6. **Stranded `pending` rows.** Outbound pre-creates a `pending` message and flips it on `send()`
   ack — but with no delivery webhook, a crashed worker would leave it `pending` forever.
   **Resolved (2026-06-21):** the former `OUTBOUND_EMAIL_SWEEP` reconciler was already
   channel-agnostic — its `updateMany` has no channel filter and every `Message` defaults `sentAt`
   at create time — so it was generalized to `OUTBOUND_SEND_SWEEP`
   (`apps/gateway/src/maintenance/outbound-send-sweep.ts`): one 5-min job that marks any send still
   `pending` after 10 min `failed` with a retry-able error, covering email and iMessage alike.
   iMessage has nothing to reconcile *toward* (no delivery webhook), so this is the recovery path —
   the flipped-`failed` row surfaces the composer's retry affordance. (BullMQ queue/job string
   values stay email-legacy so the live repeatable job isn't orphaned.)

---

## Criteria coverage

| Required by Spectrum/platform | How the plan meets it |
|---|---|
| Use `spectrum-ts`, per-org creds | Gateway app factory; creds in `Integration` |
| Webhook over **raw body**, SDK HMAC, fast 200 | Manual overload fed the global-`verify` `req.rawBody` (Meta/Shopify pattern — no bypass) |
| **Idempotent, at-least-once** (handler runs post-response) | Existing `externalMessageId === message.id` dedupe |
| **Persist `space.id`** for decoupled outbound | New `Thread.externalSpaceId` |
| Stateless outbound by stored id (~~+ stable clientGuid~~) | `space.get(id).send()` in gateway. **`clientGuid` n/a in `spectrum-ts@4.2.0` `send()`** — dedupe via the `sendStatus` gate, matching the email worker |
| Long-lived gRPC client | Hosted in gateway, not Vercel |
| Content-type narrowing + attachment rehydrate | `switch(content.type)` + `content.read()` → blob |
| Channel-agnostic core untouched | planner/run/executor/tools unchanged |
| Deliverability discipline | Inbound-first guards (dispatch + worker) + caps/Business-line surfaced in UI; send-pacing deferred |

---

## Must-resolve with Photon before building

*Phase 0 (2026-06-17) resolved 1 and 3 from the docs + shipped types, mostly resolved 2, and left 4
for Photon sales.*

1. ~~Per-project webhook routing + per-project `webhookSecret`?~~ **Resolved — yes.** `webhookSecret`
   is project-level (constructor or `SPECTRUM_WEBHOOK_SECRET`); you host the endpoint at any URL you
   control. Shipped types confirm the manual overload
   `webhook(request: WebhookRawRequest, handler): Promise<WebhookRawResult>`, so per-org
   `/webhooks/photon/:integrationId` verifying against that integration's secret works.
2. gRPC outbound as request-scoped calls from the worker + `space.get()` latency. **Mostly resolved:**
   transport is pure-JS `@grpc/grpc-js` / `nice-grpc` (no native build); a long-lived per-org
   `Spectrum` app in the gateway keeps the channel warm, and `Space` / `space.send` are first-class.
   **Open:** real round-trip latency — needs live credentials to measure.
3. ~~Any delivery/failure signal for iMessage?~~ **Resolved — no.** Webhooks are inbound-message-only;
   no delivery, read-receipt, or send-failure events. Confirms hard-constraint #1.
4. **Still open — needs Photon sales:** Business-tier pricing ($), dedicated-line provisioning
   mechanics/timeline, and SMS/RCS fallback behavior (all undocumented publicly). Tiers + caps are
   confirmed: Free/Pro shared pool vs. Business dedicated number; 50 new conversations/line/day,
   5,000 messages/server/day, raisable on request.

---

## Deploying to prod (Vercel + Railway)

No code changes ship with deployment — iMessage rides the same Railway gateway + Vercel dashboard
split as IG/email. Going live is config plus a per-org Photon connect.

**The one subtlety — `GATEWAY_INTERNAL_URL` does double duty.** `getGatewayBaseUrl()` (reads
`GATEWAY_INTERNAL_URL`; legacy alias `GATEWAY_PUBLIC_URL` — must match if both set) backs *both* the
dashboard→gateway outbound enqueue hop *and* the webhook URL the merchant pastes into Photon
(`buildPhotonWebhookUrl` → `https://<base>/webhooks/photon/<integrationId>`). Because the dashboard
(Vercel) can't reach the gateway (Railway) over private networking, this var is already the gateway's
**public** Railway domain — exactly what Photon's cloud must reach. **Never point it at a
`*.railway.internal` host:** inbound breaks silently because the displayed webhook URL is unreachable.
Verify the connected card's URL curls to `400` on an unsigned POST.

**Deploy order.**
1. **Migrate the prod DB first.** Neither `vercel.json` nor `railway.json` runs migrations (build only
   `prisma generate`s). Apply `20260617000000_add_imessage_channel` (`ChannelType.imessage` +
   `Thread.externalSpaceId`) manually with prod `DATABASE_URL` + `DIRECT_DATABASE_URL` set (`directUrl`
   is what migrate uses): `npm run db:migrate:deploy`. Run before the app deploys — both apps reference
   the new enum/column.
2. **Deploy the gateway (Railway):** Photon webhook route (registered unconditionally), outbound
   worker, generalized `OUTBOUND_SEND_SWEEP`.
3. **Deploy the dashboard (Vercel):** provisioning UI + dispatch enqueue.

**Gateway roles — needs both halves.** `npm run start -w apps/gateway` → `start.js` spawns by
`GATEWAY_RUNTIME_ROLE` (default `all`). iMessage needs **server** (Photon webhook + internal enqueue
route; holds the public domain) *and* **worker** (inbound queue + `OUTBOUND_IMESSAGE` queue + the
sweep). A single service with role `all` covers both; if split, the worker service needs
`GATEWAY_ENABLE_MAINTENANCE_WORKERS=true` (default) for the sweep and only the server service needs the
public domain.

**Env that must match across Vercel ↔ Railway.**
- `TOKEN_ENCRYPTION_KEY` — dashboard encrypts the Spectrum creds onto `Integration`; the **gateway
  decrypts** them to verify webhooks + send. Mismatch = silent failure.
- `INTERNAL_API_SECRET` — auth on the dashboard→gateway enqueue hop.
- `GATEWAY_INTERNAL_URL` — public gateway URL; **mandatory** (without it `enqueueOutboundImessage`
  returns false and replies fail).
- `REDIS_URL` (gateway BullMQ), `BLOB_READ_WRITE_TOKEN` (gateway uploads inbound iMessage attachments),
  `DATABASE_URL` / `DIRECT_DATABASE_URL`.

No new Spectrum env vars — `projectId` / `projectSecret` / `webhookSecret` are per-org runtime data
entered in the dashboard and stored on `Integration`, not deploy config.

**Per-org Photon connect (runtime, once per merchant).**
1. Paste Spectrum `projectId` / `projectSecret` / `webhookSecret` into the dashboard connect form.
2. Register the displayed `/webhooks/photon/<integrationId>` URL in app.photon.codes → Webhooks.
3. The `webhookSecret` is **per-endpoint and rotates when the endpoint is recreated** — the dashboard
   value must match the secret Photon shows for that exact endpoint.
4. **Order: re-seed creds → restart the gateway → then text.** The gateway caches the per-org Spectrum
   app in memory (`clients/spectrum.ts`); any cred change needs a Railway restart/redeploy.
5. Smoke-test inbound-first: customer texts the line → thread appears; approve a reply → `sendStatus`
   flips `sent`.

---

## Effort

~IG-sized for the happy path, **plus** the `externalSpaceId` plumbing, the gateway-hosted app +
outbound queue, and the pacing guard — **minus** the delivery-confirmation work that the channel
makes impossible. The codebase is well-shaped for it; the real unknowns are external (Photon's
webhook routing, gRPC-from-worker, delivery signals, pricing), not internal.
