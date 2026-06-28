# iMessage → Operator Channel Re-wire Plan

Archived 2026-06-27.

Status: **COMPLETE (2026-06-24).** §1 (data model), §2 (inbound routing), §3 (binding),
§4 (dashboard surfaces), §5 (outbound — retired), §6 (docs), §7 (cleanups — legacy
customer path deleted), and the marketing/help-copy reframe all landed. Open §7
sub-decision (leave-vs-purge pre-GA `imessage` customer threads) is a data call, not
code — deferred. The only `imessage` paths left are the operator transport (webhooks
Photon → `routes/imessage/*` → `sms_agent` thread) and line/handle binding.

## Progress

- **§5 outbound + §7 cleanups — DONE (2026-06-24).** Retired the legacy customer
  paths now that iMessage is operator-only:
  - **§5 (retire, not repurpose):** operator replies already send synchronously from
    the handler, so the async outbound worker had nothing to serve. Deleted the
    gateway `outbound-imessage` worker + handler + tests, the `/queue/outbound-imessage`
    internal route, the `OUTBOUND_IMESSAGE` queue / `SEND_IMESSAGE` job / `OutboundImessage*`
    types / `gateway-queues` entry / `core.ts` wiring, and on the dashboard the
    `imessage-dispatch.ts` + `enqueue-outbound-imessage.ts` modules and the
    `dispatch-message.ts` iMessage branch.
  - **§7 (inbound legacy path):** deleted the unreachable inbound customer path —
    `handleImessageJob` (`channels.ts`), the `inbound.ts` IMESSAGE branch, `JOB.IMESSAGE`,
    the `worker-inbound-imessage.test.ts` suite, and the `makeImessageJob` fixture.
  - `stripMarkdown` (the one reusable util in `outbound-imessage.ts`, imported by the
    operator webhook path) was extracted to `message-handlers/strip-markdown.ts` (+ its
    tests) before deletion. `CHANNEL.IMESSAGE` stays — iMessage is still a real channel.
  - Verification: gateway + dashboard `tsc --noEmit` clean; lint clean on all changed
    files; affected tests green (gateway inbound/core/internal-queue/strip-markdown 18,
    operator message-handler + Photon webhooks 33; dashboard dispatch 7). Repo-wide
    sweep for the retired symbols returns nothing.

- **§6 docs + customer-channel wording reframe — DONE (2026-06-24).** `.claude/CLAUDE.md`
  Channels now lists iMessage under operator (alongside Telegram). The `connect-imessage`
  help article (`help/content/integrations.ts`) is reframed to operator — texting the
  agent from your iPhone, the new "Link your iPhone" connect-code step, and tips that
  drop the customer "inbound-first / 50-per-day cap" framing. Marketing: `Channels.tsx`
  card body and `Pricing.tsx` inbox bullet reframed; on inspection `Features.tsx` (demo
  bubbles already show the merchant texting the agent), `Integrations.tsx`, and
  `NavLinks.tsx` were already operator-consistent and needed no change.

- **§4 Dashboard surfaces — DONE (2026-06-24).** The dashboard now mints the bind
  token and reframes iMessage as operator:
  - New `app/api/integrations/imessage/bind/route.ts` (mirrors the Telegram route):
    `GET` returns line status + this member's bound handles (org-scoped, never leaks
    other members'); `POST` mints an `OrgMemberBindToken` (24h, billing-write-gated),
    `409` until an iMessage line is connected; `DELETE` unbinds one handle
    (`?senderId=`) or all, scoped to the member. New `route.test.ts` (8 cases) green
    against the real test DB.
  - Channel reclassification: removed `imessage` from the customer tickets
    `FILTER_IDS` (`tickets/.../thread-list/constants.ts`) and from
    `DASHBOARD_CHANNEL_TYPES` (`lib/messaging/channels.ts`). The `imessage` entry in
    `CHANNEL_INFO` stays — the operator binding UI still needs its logo/label.
  - Copy reframe: `lib/integrations/catalog.ts` iMessage description + permissions are
    now operator-framed; `connect-bodies.tsx` `ImessageDeliverabilityNote` rewritten
    from the customer "inbound-first / 50-per-day cap" framing to operator framing.
  - Binding UI: new `ImessageBindingSection` (SWR) — lists linked iPhones with unlink,
    "Link your iPhone" mints a code shown with copy + "text this to your line"
    instructions, polls and auto-clears once a handle binds. Wired into
    `IntegrationCard`'s connected iMessage state below the webhook panel.
  - Verification: dashboard `tsc --noEmit` clean, eslint clean on changed files,
    11/11 touched-area tests green. (The pre-existing `imessage/route.test.ts`
    line-provisioning cases 429 in a shell without Upstash Redis — the limiter fails
    closed; unrelated to this change, green on the dev fail-open path.)

- **§2 Inbound routing + §3 binding (gateway) — DONE (2026-06-24).** iMessage now
  dispatches operator-side, mirroring Telegram:
  - New channel-neutral `routes/operator-message.ts` (`OperatorMessageContext`,
    `OperatorPresence`, `progressOnlyPresence`). The shared Telegram command
    handlers (`agent-execution`, `digest-commands`, `pending-plan-commands`,
    `pending-question-commands`) were generalized off `TelegramMessageContext` onto
    it — `senderRef` replaces the hardcoded `telegram:` prefix, and presence is
    injected (Telegram keeps `withOperatorPresence`; iMessage uses progress-only).
    Telegram behavior is unchanged (all existing tests green).
  - New `routes/imessage/{message-handler,binding}.ts`: resolves the sender via
    `OrgMemberImessageBinding`, dispatches help/summary/digest/pending-plan/
    order-lookup/free-form through the shared handlers, and replies over the
    inbound Spectrum space (`space.send(stripMarkdown(...))`). Unbound senders are
    handled by `handleImessageBinding` — a texted single-use `OrgMemberBindToken`
    binds the handle (mirrors `handleStartBinding`); anything else gets connect
    instructions. No ticket, no customer persistence.
  - `webhooks-photon.ts` rewired: the per-message callback dispatches the operator
    turn **synchronously** (mirrors Telegram; avoids the inbound queue's `attempts:3`
    retry-duplication of a non-idempotent turn). Decisions made here:
    - **Synchronous dispatch over queue** — trust-is-binary; a retried agent turn
      could double-execute a refund.
    - **At-least-once dedupe** — Spectrum webhooks redeliver, so each provider
      `message.id` is claimed via Redis `SET NX EX 300` before dispatch (fails open
      on Redis error: a rare duplicate beats dropping a merchant instruction).
  - The legacy customer path (`JOB.IMESSAGE` → `handleImessageJob` →
    `processInboundMessage`) is now **unreachable** — nothing enqueues it. Left in
    place (no deletion) pending §7 cleanup, per the plan's rollout note. The async
    `outbound-imessage` worker is likewise now inbound-less (still a §7 decision).
  - Tests: new `routes/imessage/message-handler.test.ts` (unbound rejection, token
    binding + consumption, bound HELP dispatch); `webhooks.test.ts` Photon cases
    rewritten to assert operator dispatch (no enqueue, reply over the space).
    Migration applied to the local test DB. Gateway typecheck + lint clean; all
    route tests (104) green.
  - **§7 multi-operator** resolved toward **allow**: `@@unique([integrationId,
    senderId])` lets different members bind different handles to one line.

- **§1 Data model — DONE (2026-06-24).** Added `OrgMemberImessageBinding`
  (`orgMemberId`, `integrationId`, `senderId`, `spaceId`, `displayName`) with
  `@@unique([integrationId, senderId])` and FKs to both `OrgMember` and
  `Integration` (`onDelete: Cascade`, so disconnecting the Spectrum line drops its
  bindings). Back-relations `imessageBindings` added on `OrgMember` and
  `Integration`. The `(integrationId, senderId)` unique resolves the §7
  multi-operator decision toward **allow** (different members bind different handles
  to one line). Migration `20260624000000_add_org_member_imessage_bindings` verified
  byte-for-byte against Prisma's canonical DDL (no future drift); client regenerated;
  `packages/db` typechecks. `OrgMemberBindToken`/`OperatorContext` reused unchanged.
  Migration not yet applied to a live DB (applies on deploy / test-bootstrap).

## Why this exists

**Intent (product owner):** iMessage is an *operator* channel, exactly like Telegram
— the merchant interacts with the agent and the agent replies; **no customer ever
texts the iMessage line.** It is a second doorway to the same agent the merchant
already reaches over Telegram/Concierge.

**Current state (verified against the code):** iMessage was built as a
*customer-support* channel — the opposite of the intent. Evidence:

- `isOperatorChannel` (`packages/agent/src/thread-constants.ts`) — the operator set
  is exactly `{dashboard_agent, sms_agent}`; `imessage` is excluded, so the agent
  core treats it as customer-support.
- Inbound `handleImessageJob` → `processInboundMessage`
  (`apps/gateway/src/message-handlers/{channels,inbound-persistence}.ts`) upserts a
  `Customer`, opens a `customer` thread, writes `senderType: customer`, and enqueues
  `SUMMARIZE_THREAD` — byte-for-byte the IG DM / email ticket flow.
- Outbound `handleOutboundImessageJob` (`workers`/`message-handlers/outbound-imessage.ts`)
  replies into the customer's `externalSpaceId` with an inbound-first "never cold-start
  a conversation" guard — the customer-reply dispatch path (mirrors outbound-email).
- iMessage appears in **none** of the operator-path files (`operator-context`,
  `operator-notify`, `execute-operator-agent-turn`, `intent` routing,
  `routes/webhooks-telegram`, `routes/internal-operator`, `routes/telegram/*`).
- No operator identity binding: `OrgMemberTelegramChat` binds the merchant's Telegram;
  there is no iMessage equivalent. Every inbound sender is upserted as a `Customer`.
- Dashboard groups `imessage` with customer channels (`lib/messaging/channels.ts`
  `DASHBOARD_CHANNEL_TYPES`) and in the **tickets** channel filter
  (`tickets/_components/thread-list/constants.ts`). The integrations catalog says
  "Reply to *customers* who text your business on iMessage."

**Corroboration that operator was always the intent:** the `OrgMemberBindToken`
schema comment already reads *"Single-use deep-link tokens for binding operator
channels (Telegram, **iMessage**)."* The operator scaffolding anticipated iMessage;
the inbound routing was just built down the wrong path.

## Target behavior (mirror Telegram exactly)

The merchant texts the org's dedicated Spectrum iMessage line → the message is routed
to the **operator agent** (instructions, order lookups, digests, one-tap plan
approvals) → the agent replies on iMessage. No tickets are created from the line.

This is the same agent surface as Telegram (`sms_agent`). It reuses, unchanged:

- `executeFreeFormInstruction(orgId, clerkUserId, message, context)` and
  `handleOrderLookup` (`routes/telegram/agent-execution.ts`) — channel-agnostic.
- The `sms_agent` internal operator thread (`packages/agent/src/internal-thread.ts`).
- `OperatorContext` (`apps/gateway/src/operator-context.ts`) — keyed by
  `(organizationId, chatId)`; `chatId` becomes the bound iMessage identifier.
- `OrgMemberBindToken` (already generic; comment already names iMessage).
- Digest / pending-plan / pending-question command handlers (`routes/telegram/*`).

Because operator turns already run on the `sms_agent` thread and `isOperatorChannel`
already accepts `sms_agent`, **the agent core needs no change.** Operator-iMessage is
a new *transport + binding* layer mirroring `routes/telegram/`.

## Work breakdown

### 1. Data model (`packages/db/prisma/schema.prisma`)
- Add `OrgMemberImessageBinding` mirroring `OrgMemberTelegramChat`:
  `orgMemberId`, `integrationId`, `senderId` (merchant handle), `spaceId` (for
  replies), `displayName`. Unique on `(integrationId, senderId)`; relation back to
  `OrgMember` (add `imessageBindings OrgMemberImessageBinding[]`).
- Reuse `OrgMemberBindToken` and `OperatorContext` as-is (no schema change).
- Migration: new table only. Existing `imessage` *customer* threads (pre-GA test
  data) — decide leave vs. purge (§7).

### 2. Inbound routing (gateway)
- In `routes/webhooks-photon.ts`, replace `enqueueInboundImessageMessage`'s
  customer-ticket enqueue with an operator dispatch. The webhook already resolves
  `integrationId → organizationId`, so the org is known.
- New `message-handlers`/`routes` module `imessage-operator` mirroring
  `routes/telegram/message-handler.ts`:
  - Resolve the member via `OrgMemberImessageBinding` by `senderId`. Unbound sender →
    reply with binding instructions (no ticket — strangers are not expected).
  - `getContext(orgId, boundChatId)` → dispatch help/summary/digest/pending-plan/
    order-lookup/free-form, reusing the existing handlers.
  - Provide an iMessage `reply(text)` that sends into the space via Spectrum
    (`im.space.get(spaceId).send(...)`), reusing `getSpectrumAppForIntegration` and
    `stripMarkdown`.
- Retire the `JOB.IMESSAGE` → `handleImessageJob` → `processInboundMessage` customer
  path (or keep behind a temporary flag during rollout).

### 3. Binding flow
- **Decided: one-time token texted to the line.** iMessage has no Telegram-style
  `/start <token>` deep link, so binding works by verification token: the dashboard
  mints a single-use token (stored as `OrgMemberBindToken`) and the merchant texts it
  to the iMessage line. The gateway consumes it via `findOrgMemberBindToken`, verifies
  it, and upserts `OrgMemberImessageBinding` (mirroring `handleStartBinding`). Until a
  sender is bound this way, inbound messages are rejected with binding instructions —
  no ticket, no agent run. (Chosen over dashboard handle-entry, which is spoofable and
  requires knowing the handle.)

### 4. Channel classification & dashboard
- Operator-iMessage turns run on the `sms_agent` thread, so `OPERATOR_CHANNEL_TYPES`
  needs **no** change. The raw `imessage` channelType remains only for the
  binding/transport layer, not for threads.
- Remove `imessage` from the customer **tickets** filter
  (`tickets/_components/thread-list/constants.ts` `FILTER_IDS`) and reconsider its
  place in `lib/messaging/channels.ts` `DASHBOARD_CHANNEL_TYPES`.
- Integrations page: move iMessage to operator framing alongside Telegram — connect =
  provision the Spectrum line + bind your handle (mint token / show instructions),
  not "customers text your business." (`lib/integrations/catalog.ts`,
  `components/integrations/connect-bodies.tsx`, `IntegrationsPageClient.tsx`.)

### 5. Reply / outbound
- Operator replies send synchronously from the handler (like Telegram's `sendMessage`),
  reusing the Spectrum space send. The existing async `outbound-imessage` worker +
  `imessage-dispatch` is the *customer-reply* path; once §2 lands it has no inbound
  customer threads to serve — decide retire vs. repurpose for operator async sends.

### 6. Docs / notes
- `.claude/CLAUDE.md` Channels section: list iMessage under operator (with Telegram),
  not as a customer/support `channelType`.
- Update `docs/to-do-list.md` (done in this pass — records intent + divergence).

### 7. Open decisions
- Multi-operator: may multiple `OrgMember`s bind one line? (Telegram allows 3
  devices/member — mirror or restrict to one.)
- Existing pre-GA `imessage` customer threads: leave or purge.
- Retire vs. repurpose the async outbound-imessage worker (§5).

## Customer-channel wording — reframe at implementation time

**Decided: leave the current customer-support wording in place and reframe it to
operator as part of executing this plan** (not a pre-emptive revert). These surfaces
were written while iMessage was understood as customer-support; when the re-wire ships,
update their wording from "customers text your store" to the operator framing ("text
your store's agent from your iPhone"):
- `apps/dashboard/src/app/dashboard/_components/help/content/integrations.ts` —
  `connect-imessage` article ("customers who text you").
- Marketing copy: `(marketing)/_components/{Channels,Integrations,Features,Pricing,NavLinks}.tsx`
  — the `Channels.tsx` card ("Customers text your store…") needs the most rework.
- `docs/to-do-list.md` "Take iMessage to GA" entry (superseded by this plan).

Note: this wording is undeployed (working tree only), so it carries no live risk while
it waits for implementation.
