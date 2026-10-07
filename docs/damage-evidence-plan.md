# Damage claims need evidence before compensation — implementation plan

**Status (update as you go):** planned 2026-10-07 against `578da78b`; decisions D1–D4
confirmed by the user the same day. Nothing built.

## Why

On 2026-10-07 a customer on an unlinked Instagram thread wrote "Can I get a refund on
1042. It arrived damaged". The planner proposed a $24.95 full refund and a reply on the
customer's word alone. The merchant wants proof first: the agent should ask what is
damaged and for a photo, and the photo should reach the merchant with the approval card
on every surface.

## Decisions (confirmed by the user, 2026-10-07)

| # | Decision | Answer |
| --- | --- | --- |
| D1 | Which claims need a photo | Both `damaged` and `defective` claims, when a photo is available. The agent asks only on a channel that can carry a customer photo: Instagram, email, TikTok (the set `shouldHydrateAgentMessageImages` covers). On any other channel there is nothing to ask for, so the conversation goes straight to the merchant |
| D2 | What a missing photo does | Pushes the conversation to the merchant to take over: a structural escalation, not a review card the merchant could approve anyway. The agent never proposes compensation on a damage claim without a photo |
| D3 | When the customer can't or won't send one | Ask once; on the next reply without a photo, escalate with the customer's description |
| D4 | Can damage compensation auto-execute with a photo | No. With a photo, it always needs the merchant's approval; the agent never judges whether a photo is genuine |

"Compensation" here is every tool that pays out or replaces: `create_refund`,
`create_partial_refund`, `create_gift_card`, `create_exchange`, `create_shopify_order`.

## What already exists (verified 2026-10-07)

- **The model can see customer images.** `packages/agent/src/image-attachments.ts`
  (`shouldHydrateAgentMessageImages`, `AGENT_IMAGE_LIMITS`) hydrates recent image
  attachments for `ig_dm`, email and TikTok threads into `AgentRecentMessage.attachments`
  (`AgentMessageAttachment`, `type: "image"`). Hydration is capped, so it is not a count of
  what the customer sent.
- **Raw attachments are stored on `Message.attachments`** (`String[]`, URLs or `blob:` refs,
  see `BLOB_ATTACHMENT_PREFIX` in `packages/agent/src/attachment-ref.ts`).
- **The dashboard timeline renders them** through the local `AttachmentList` in
  `apps/dashboard/src/app/dashboard/(shell)/tickets/_components/conversation/timeline/ChatTimeline.tsx`
  (`isImageAttachmentUrl` from `apps/dashboard/src/lib/attachments/blob-ref.ts`).
- **A new customer message replans automatically** (observed on 2026-10-07: the second DM
  produced a fresh plan with no merchant action). "Ask, then wait for the photo" needs no
  new trigger.
- **Request facts are structured but have no reason.** `RequestFacts`, `REQUEST_ASKS`,
  `emptyRequestFacts` and `parseRequestFacts` in `packages/agent/src/classifier-signals.ts`
  carry `ask`, `subject`, `order`, `deadline`, `deadlineText` and `alternative`. The gateway
  classifier writes them (prompt text and JSON schema in
  `apps/gateway/src/message-handlers/inbound/classification.ts`, `CLASSIFIER_VERSION` in
  `classification-contract.ts`, currently 6). "Damaged" exists only in the customer's
  prose, and nothing may branch on prose (CLAUDE.md).
- **Plan-dependent signals have a pattern to copy.** `shopify_customer_unresolved` is pushed
  in `appendInitialPlanningSignals` (`packages/agent/src/planner-read-tools.ts`), and
  `severityFor` (`packages/agent/src/plan-signals.ts`) makes it `blocking` only when the
  plan used customer or order data. `decideAutonomy` (`packages/agent/src/autonomy.ts`)
  already turns any blocking signal into `needs_review` with approval allowed.
- **Structural escalation has a home.** `buildPlanRoutingEvidence` and
  `requestedWriteEscalationCode` (`packages/agent/src/planner-evidence.ts`) turn plan facts
  into a `PlanRoutingEvidenceCode` (`packages/agent/src/types.ts`) with a fixed entry in
  `ESCALATION_REASONS`. A code in `ESCALATION_EVIDENCE` (`packages/agent/src/autonomy.ts`)
  makes `decideAutonomy` return `escalate`, and `planner.ts` rewrites the plan with
  `applyEscalationRouting`. `already_refunded_request` and `compensation_over_cap` work this
  way.
- **Compensation is already a registry fact.** `ToolPolicyMetadata.dailyRefundSpendLimit`
  (`packages/agent/src/tools/registry/types.ts`) is set on `create_refund`,
  `create_partial_refund` and `create_gift_card`; `create_shopify_order` has
  `freeOfChargeRefused`.
- **Internal tools write thread state through the host.** `add_internal_note`,
  `update_thread_status` and `update_thread_tag` (`packages/agent/src/tools/registry/thread.ts`)
  call `ctx.io.<method>(input, ctx.execution)`; `AgentIO` is in
  `packages/agent/src/agent-context.ts`, and each host implements it.
- **Phone cards are text only.** `apps/gateway/src/clients/telegram-client.ts` exposes
  `sendMessage` only; the iMessage client (`apps/gateway/src/clients/spectrum.ts`) sends no
  media today. Plan cards go out from `sendOperatorPlanNotification`
  (`apps/gateway/src/message-handlers/support-plan/planning-notifications/send-plan.ts`).
- **Guardrail settings UI** lives in
  `apps/dashboard/src/app/dashboard/(shell)/agent/configure/_components/AgentAutonomyAdvancedSection.tsx`
  (`maxRefundAmount`, `blockCancellations`).
- **Eval fixtures carry intents, not request facts.** `fixture-runtime.ts` builds classifier
  signals from `setup.classifierIntents` and `fixture-validator.ts` validates it
  (`apps/dashboard/src/lib/agent/__evals__/`). Three refund fixtures mention damage
  (`refund-full-order-mixed-language`, `refund-partial`, `refund-partial-placeholder`); they
  keep their current expectations because they supply no `reason`.

## Design

1. The classifier records why the customer wants something: a closed `reason` vocabulary.
2. The planner context gets typed evidence facts: how many images the customer sent, and
   whether a photo was already requested.
3. A thread-level wait records "we asked for a photo" (new columns), written by an internal
   tool the planner proposes next to its reply.
4. A setting, `damageEvidence`, makes it the merchant's policy.
5. A prompt section, present only on damage claims, tells the planner what to do in each
   state. `SUPPORT_INSTRUCTIONS` does not grow (its size is an open item in
   `docs/agent-follow-ups.md`).
6. A missing photo hands the conversation over (D2): the routing code
   `damage_photo_missing` escalates structurally, the same way an over-cap refund does. A
   photo that is present raises `damage_photo_attached`, a blocking card signal, so
   compensation always waits for the merchant (D4).
7. The card shows the photos: dashboard thumbnails, and the images themselves on Telegram and
   iMessage.

A **damage claim** is: `requestFacts.reason` is `damaged` or `defective`, **or** the thread is
waiting on a damage photo. The second clause matters: a follow-up that is only a photo may
not be classified as a damage claim on its own.

## Work plan

Work in a worktree off fresh `origin/master` (`npm ci` inside it; copy `.env.local` and
`apps/dashboard/.env.local`). PR 1 is agent-path work: open a PR so the free eval preflight
runs. Paid evals run only when the user asks.

### PR 1 — agent core

**Step 1 — classifier `reason`.**
- `packages/agent/src/classifier-signals.ts`: add
  `REQUEST_REASONS = ["damaged", "defective", "wrong_item", "not_received", "late", "changed_mind", "other"] as const`,
  `type RequestReason`, `RequestFacts.reason: RequestReason | null`, `null` in
  `emptyRequestFacts`, and closed-vocabulary parsing in `parseRequestFacts`: unknown → `null`,
  never coerced to a near match.
- `apps/gateway/src/message-handlers/inbound/classification.ts`: describe `reason` in the
  prompt next to `alternative` (damaged = arrived broken, cracked, torn or crushed;
  defective = arrived intact but does not work; null when the customer gives no reason), add
  it to the JSON schema (`anyOf` enum or null) and to `required`.
- `classification-contract.ts`: `CLASSIFIER_VERSION` 6 → 7. Threads classified before v7
  parse `reason: null` and behave exactly as today.
- Check: typecheck and the gateway classification unit tests. Change a test only if it pins
  the schema's field list.

**Step 2 — wait columns (migration).**
- `packages/db/prisma/schema.prisma`: `enum CustomerWait { damage_photo }`; on `Thread`:
  `awaitingCustomer CustomerWait? @map("awaiting_customer")` and
  `awaitingCustomerSince DateTime? @map("awaiting_customer_since") @db.Timestamptz`.
- Migration named after the newest existing one (it was
  `20261006120000_add_turn_usage_first_call_cache_write`), e.g.
  `<today>120000_add_thread_customer_wait`. Write the SQL by hand. **Do not run
  `prisma format`**: it realigns the whole schema into a several-hundred-line diff.
- Apply it to the local test database; it is shared with every worktree (`clerk_test`).

**Step 3 — evidence facts in the planner context.**
- `packages/agent/src/agent-context.ts`: `SupportContext.requestEvidence:
  { customerImages: number; photoRequestedAt: string | null }`.
- `packages/agent/src/context.ts`: count image attachments on the thread's customer
  messages, only those after `awaitingCustomerSince` when a wait is set. Count from
  `Message.attachments`, not the hydrated list, which is channel-limited and capped.
  `photoRequestedAt` comes from the two new columns. Decide "is an image" with the predicate
  `image-attachments.ts` already uses: export it rather than writing a third one (the
  dashboard has `isImageAttachmentUrl` as well; one helper per concept).
- Give this load its own `.catch` (fall back to `{ customerImages: 0, photoRequestedAt: null }`
  and log). An uncaught fan-out load in `buildContext` once stopped all planning for a day.

**Step 4 — internal tool `await_customer_photo`.**
- `packages/agent/src/tools/registry/thread.ts`: new definition, category `internal`, group
  `thread`, input `{}`, label "Wait for a photo of the damage" (`TOOL_LABELS` /
  `PLAN_STEP_LABELS`). Execute through `ctx.io.awaitCustomerPhoto(input, ctx.execution)`.
- `AgentIO.awaitCustomerPhoto` in `agent-context.ts`. Implement it in all three `AgentIO`
  hosts, or one of them stops compiling: the gateway sink
  (`apps/gateway/src/message-handlers/support-plan/agent-thread-sink.ts`), the dashboard
  (`apps/dashboard/src/lib/agent/context.ts`) and the eval harness
  (`apps/dashboard/src/lib/agent/__evals__/fixture-runtime.ts`). The real hosts set
  `awaitingCustomer = damage_photo` and `awaitingCustomerSince = now()` with an org-scoped
  update and return a typed result.
- **Offer the tool only on damage claims on a photo-capable channel.** Filter it out of the
  planner's tool set otherwise, the way `planner.ts` filters guest-only tools. Every other support turn then
  keeps a byte-identical tool list and prompt cache.
- The registry is in the dashboard's client bundle: no `@shopkeeper/db` import in registry
  files. Run `npx turbo run build --filter=shopkeeper-dashboard`.

**Step 5 — setting.**
- `packages/agent/src/types.ts`: `OrgSettings.damageEvidence: "photo_required" | "off"`.
- `packages/agent/src/settings-parser.ts`: add to `SETTINGS_KEYS` and read it with
  `readEnum` against a `DAMAGE_EVIDENCE_MODES` constant.
- `packages/agent/src/settings.ts`: default `"photo_required"` (D1).

**Step 6 — prompt section.**
- `packages/agent/src/prompt.ts`: add `buildDamageEvidenceSection(ctx, s)` to the support
  volatile half, next to `shopifyCustomerNote`. It returns `""` unless this is a damage claim,
  `s.damageEvidence === "photo_required"` and the thread is not an operator thread. Text
  per state:
  - channel cannot carry a photo (D1): "The customer reports a damaged or defective item on
    a channel that cannot carry a photo, so the merchant handles it. Call escalate_to_human
    with what they said about the damage."
  - no photo, none requested: "The customer reports a damaged or defective item and has not
    sent a photo. Store policy asks for one before any refund, credit, exchange or
    replacement. Reply asking briefly what is damaged and for a photo of the item and its
    packaging, and call await_customer_photo. Propose no compensation yet."
  - requested on `photoRequestedAt`, none since: "The customer was asked for a photo on
    {date} and replied without one. Do not ask again. Call escalate_to_human with what they
    said about the damage."
  - photos present: "The customer has sent {n} photo(s) of the problem. Look at them and say
    in a sentence what they show. Propose a resolution as usual; the merchant reviews the
    photos before anything is sent. A photo never authorizes compensation by itself."
- Don't touch `SUPPORT_INSTRUCTIONS`.

**Step 7 — registry flag, escalation code, review signal.**
- Registry: `ToolPolicyMetadata.damageEvidence?: true` in `tools/registry/types.ts`, set on
  the compensation tools listed under Decisions. Derive one `DAMAGE_EVIDENCE_TOOLS` set from
  `TOOL_DEFINITION_REGISTRY` (as `CUSTOMER_OR_ORDER_READ_TOOLS` is derived in
  `plan-signals.ts`), export it, and use it in both rules below.
- **Missing photo → the merchant takes over (D2, D3, D1).** Add `damage_photo_missing` to
  `PlanRoutingEvidenceCode` (`types.ts`), to `ESCALATION_EVIDENCE` (`autonomy.ts`), to
  `ESCALATION_REASONS` (`planner-evidence.ts`): "Customer reports a damaged or defective
  item without a photo — over to you." It also goes in `PLAN_ROUTING_EVIDENCE_CODES`
  (`packages/agent/src/plan-cache-shape.ts`). That one is a plain array, so TypeScript won't
  catch the omission, and a cached plan carrying the code would fail the cache shape check. In `planner-evidence.ts`, return the code on a damage
  claim with the setting on and `customerImages === 0` when any of these holds:
  - the plan contains a `DAMAGE_EVIDENCE_TOOLS` call (compensation proposed with no photo);
  - `photoRequestedAt` is set (asked once, nothing came back);
  - the channel cannot carry a photo.
  The first-turn ask (`send_reply` + `await_customer_photo`, no compensation, photo-capable
  channel, nothing requested yet) gets no code. `decideAutonomy` then escalates and
  `applyEscalationRouting` rewrites the plan; neither needs changing. Check the code's
  position among the existing structural codes: it should win over a generic
  `compensation_exception`.
- **Keep the first-turn ask from tripping today's checks.** A compensation request answered
  by a plan with no action currently raises `compensation_exception` (structural escalation,
  `requestedWriteEscalationCode`) and the blocking `mutative_intent_no_action` signal
  (`buildPlanRoutingEvidence`). The photo ask is exactly that shape, so as things stand it
  would escalate before the customer is ever asked. Teach `planShape` that an
  `await_customer_photo` call answers the request (e.g. `hasEvidenceRequest`) and exclude
  such plans from both.
- **Photo present → merchant review (D4).** Add `damage_photo_attached` to
  `ProducedPlanSignalCode` (`types.ts`) and `PLAN_SIGNAL_MESSAGES` (`plan-signals.ts`): "The
  customer sent photos of the damage - check them before approving." In `severityFor` it is
  `blocking` when the plan contains a `DAMAGE_EVIDENCE_TOOLS` call, `advisory` otherwise.
  Push it from `appendInitialPlanningSignals` (`planner-read-tools.ts`) on a damage claim
  with the setting on and `customerImages > 0`. If that function does not receive settings,
  pass the resolved settings in from `planner.ts`. `decideAutonomy` already forces review on
  a blocking signal.

**Step 8 — tests (minimal; mutation-check each).**
- `buildPlanRoutingEvidence` returns `damage_photo_missing` for a damage claim with no photo
  and a `create_refund` call, and for one where a photo was requested and none came back. For
  the first-turn ask it returns no escalation code at all (no `compensation_exception`) and
  no `mutative_intent_no_action` signal. These pin D2 and D3: a refund on the customer's
  word alone never reaches an approval card, and the ask itself is not escalated.
- `damage_photo_attached` is `blocking` with `create_refund` in the plan and `advisory`
  without it (D4).
- Break each condition and watch its test go red. Nothing that pins prompt wording, labels
  or the registry list (TESTING.md).

**Step 9 — eval harness (optional; free to build, paid to run).**
- Let fixtures supply `setup.requestFacts` (types, `fixture-runtime.ts`,
  `fixture-validator.ts`). Add `damage-claim-no-photo-asks-for-photo`: `mustCallTools`
  `send_reply`, `await_customer_photo`; `mustNotCallTools` the compensation tools. A
  with-photo fixture only if fixtures can carry image attachments; check first.

### PR 2 — dashboard

**Step 10 — setting toggle** in `AgentAutonomyAdvancedSection.tsx`, beside
`blockCancellations`: "Ask for a photo before refunding a damaged item".

**Step 11 — evidence on the card.** In `ActionPlanBody.tsx`
(`.../tickets/_components/conversation/composer/`), under `damage_photo_attached`, render the
customer's photos. Move `AttachmentList` out of `ChatTimeline.tsx` into a shared file and
reuse it. A missing photo never reaches a card (D2): it arrives as an escalation, which the
inbox already shows as "Flagged for you".

### PR 3 — phone and briefing

**Step 12 — photos with phone cards.** In `sendOperatorPlanNotification`, when the plan
carries `damage_photo_attached`, send the images to every bound channel (CLAUDE.md principle
2: a push that reaches only one surface is unfinished).
- Telegram: add `sendPhoto` / `sendMediaGroup` to `telegram-client.ts`, uploading the bytes
  (Blob storage is private: never send a URL).
- iMessage: check whether `spectrum-ts` can send attachments (the spectrum skill, or the
  installed package). If it can't, the card text says "{n} photos - view them in the
  dashboard".

**Step 13 — briefing line.** In `apps/gateway/src/maintenance/digest-briefing/`, list open
threads with `awaitingCustomer = damage_photo` and no customer image after
`awaitingCustomerSince` as "Waiting on a photo from {name} ({order})". Compose it from
fields.

## Verification (live; a green suite is not acceptance)

Drive the dashboard in the user's Chrome; the user sends customer messages from their phone.
- IG DM "my order #____ arrived damaged, can I get a refund?" with no photo: the plan
  replies asking for a photo and waits (`await_customer_photo`); no compensation step.
- Reply with a photo: the new plan proposes the refund; the card shows the photo and
  `damage_photo_attached`; approve; Shopify shows the refund (read back via
  `/api/orders?limit=50` in page JS).
- The same card on the phone shows the photo.
- Reply "I don't have a photo" after the ask: the thread escalates to the merchant with the
  customer's description; no second ask, no refund card.
- A damage claim on the storefront chat (no photo channel): escalates without asking.
- Setting off: today's behavior.
- Email variant of the first two.

Pick a clean paid dev-store order (`/api/orders?limit=50`; limit tops out at 50). Use a
fresh DM each time: Instagram rejects business replies more than 24 hours after the
customer's last message.

## Deploy (PR 1)

1. Migrate production **before** merging, from the PR's worktree with Railway's env (the
   user runs these via `!`):
   `cd <main checkout> && railway run --service shopkeeper sh -c 'cd <worktree> && npx prisma migrate status --schema=packages/db/prisma/schema.prisma'`,
   then the same with `migrate deploy`. Status must show only the new migration.
2. Merge (the auto-mode classifier usually refuses `gh pr merge`: hand over
   `gh pr merge <n> -R walledog11/shopkeeper --squash --delete-branch --match-head-commit <sha>`).
3. Watch the merge commit's statuses (Vercel, Railway `shopkeeper`, Railway `Gateway Worker`),
   then `curl https://clerk-production-e37f.up.railway.app/health/deep`.

## Known issues that will get in the way (found 2026-10-07)

- **Composer text router.** `shouldUsePrivateComposerAsk` in `useConversationAgentFlow.ts`
  sends an `@shopkeeper` instruction to the read-only Q&A unless it *starts* with an action
  verb. "the return came back fine, refund #1032…" went to Q&A, which then said it cannot
  issue refunds. Start test instructions with the verb, or fix it separately (it branches on
  prose).
- **Stale card.** After a new customer message, the card kept showing the previous composer
  plan until a page reload, and its Cancel did not dismiss it.
- **Unreadable draft bubble.** The reply draft on the plan card rendered near-black text on a
  black bubble.
- **Dev-store order #1032** is cancelled but still `paid` with no refund; the planner
  escalates any refund on it. Use another order.
- A $24.95 refund card for #1042 on the `rajbirsambi` Instagram thread was left unapproved on
  2026-10-07.
