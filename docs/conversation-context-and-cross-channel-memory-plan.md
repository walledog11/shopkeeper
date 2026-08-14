# Conversation Episodes, Cross-Channel Identity, and Relevant Memory

**Status:** planned, not started.  
**Decision date:** 2026-08-12. **Revised:** 2026-08-12 after a source audit.  
**Delete this file when every phase is complete and the durable operating rules
have moved into the code, tests, product truth, and runbook.**

## Objective

A returning shopper must keep their identity and useful continuity without
turning every past transcript into instructions for the current agent turn.

The concrete failure this plan closes is: a storefront visitor returns after
days, sends a new message, and the agent uses the old thread summary/transcript to
generate a confusing merchant action plan.

## Product rules

These are invariants, not prompt suggestions:

1. **Identity persists; conversations end.** A storefront session identifies a
   browser. A canonical person can span verified channels. Neither is a
   conversation transcript.
2. **One `Thread` is one conversation episode.** Raw messages from different
   episodes are never combined in an agent turn.
3. **Episode boundaries are deterministic.** Status, provider conversation
   identity, and elapsed conversational inactivity decide rollover. An LLM does
   not decide whether an old transcript should remain current.
4. **The latest request is separate from the episode summary.** Planning and
   merchant notifications use the newest unanswered customer burst, not the
   whole-thread `aiSummary`.
5. **History is retrieved, not replayed.** Prior episodes enter context only when
   an exact relationship or an explicit open obligation makes them relevant.
6. **Obligations outlive episodes; cached plans do not.** A promised refund
   review can follow the person into a new episode as structured state. An old
   plan, transcript, or model instruction cannot.
7. **Weak identity never joins channels.** Names, model guesses, and unverified
   contact details do not merge people. Every merge is explainable and
   reversible.
8. **Merchant output describes what changed.** A new request summary is a delta;
   an episode summary is background. The UI never labels one as the other.
9. **Elevated tool access is scoped to the proof that granted it.** An episode
   boundary must not silently grant or silently revoke it. See the verification
   correction in P1.

## Build order: capture first, retrieval later

The phases are ordered by how expensive each part is to add after the fact, not
by how visible it is.

**Write-path state is built now.** `Person`, `ChannelIdentity`,
`CustomerObligation`, `PersonMemoryFact` and the episode/request columns record
facts at the moment they occur. Skipping them does not defer the work — it
destroys the data permanently, because nothing can reconstruct later that a
September storefront visitor and an October emailer were one person, or that the
agent promised someone a refund review. These ship even where nothing reads them
yet; inert schema is cheap to carry.

**Read-path selection is deferred.** `ThreadMemoryIndex` and the prior-episode
relevance rules only decide what to *show* the planner. Nothing depends on their
shape, they are derived from data that will already exist, and they are a ranking
problem — ranking rules get tuned against observed queries, and there is no
storefront traffic to tune against yet. Designing them blind is how you ship
matching rules that are wrong in a way no test catches. They are specified in P9
and deliberately not built with the rest.

The bug in the objective does not need the retrieval engine at all. It is closed
by P1 through P3, plus deleting fifteen lines in P6.

## Boundaries and defaults

The first implementation uses fixed, code-owned defaults. Do not add merchant
settings until observed traffic shows a real need.

| Channel | Continue current episode | Start a new episode |
| --- | --- | --- |
| Storefront chat | Latest conversational message is less than 24 hours old and thread is open | Thread is closed or at least 24 hours conversationally idle |
| Instagram DM | Same sender, open thread, less than 24 hours idle | Closed or at least 24 hours idle |
| TikTok Shop | Same provider conversation, open thread, less than 24 hours idle | Provider conversation changes, thread closes, or at least 24 hours idle |
| Email | Same provider conversation when available and less than 7 days idle | Provider conversation changes, thread closes, or at least 7 days idle; missing provider identity falls back to the 7-day boundary |
| Shopify order notes | Not a customer conversation | Never create or roll a customer episode from a synthetic note |

A 30-minute gap may produce a visual time divider, but it is not an agent-context
boundary. Use the latest non-note `Message.sentAt`/`Thread.lastMessageAt` for
inactivity. `StorefrontChatSession.lastSeenAt` is browser activity — written on
every widget open at `bootstrap/route.ts:71-75` — and must never decide
conversational continuity.

The first new inbound message performs hard rollover. Bootstrap can report that
the former episode is expired and display it as prior history, but merely opening
the widget must not create a thread or mutate the inbox.

## Migration hazard — read before writing any migration

`threads_one_open_per_customer` is created as raw SQL in
`packages/db/prisma/migrations/20260405000000_add_idempotency_and_thread_uniqueness/migration.sql:4`
and **is not declared in `schema.prisma`**. `prisma migrate dev` builds its
shadow database from the migration history (index present) and diffs it against
`schema.prisma` (index absent), so it will emit a `DROP INDEX` for it inside
whatever migration you are authoring.

That index is the database-level backstop for exactly the close-and-create race
P1 exists to fix. Dropping it while implementing P1 removes the protection P1
depends on, in the same commit, silently.

- [ ] Before the first migration in this plan, add the index to `schema.prisma`
  as a partial `@@unique` on `(organizationId, customerId, channelType)` and
  confirm `prisma migrate diff` then produces no change against production.
- [ ] If that cannot be expressed, hand-write every migration in this plan and
  never run `migrate dev` against this schema.
- [ ] Verify each generated migration contains no `DROP INDEX` before applying it
  anywhere.

## Data model decisions

`Thread` remains the episode record; do not add a second generic episode table.
Add only the state that cannot be derived safely:

- `Thread.requestSummary` — summary of the latest unanswered customer burst.
- `Thread.requestSourceMessageId` — newest customer message covered by that
  summary; used for compare-and-set updates.
- `Thread.requestDisposition` — `none`, `acknowledgement`, `informational`,
  `merchant_action`, or `unclear`.
- `Thread.closedReason` — at least `merchant`, `resolved`, `episode_rollover`,
  `inactivity`, and `superseded`; `status = closed` remains the lifecycle
  authority.
- `StorefrontChatSessionEpisode(sessionId, threadId, startedAt, endedAt)` — owns
  the widget's episode history and, per P1, is the join that resolves storefront
  verification independently of the session's current thread pointer.

`episode_rollover` and `inactivity` are deliberately distinct. P1 writes
`episode_rollover` when a conversation boundary elapses and a new episode starts.
The seven-day retention sweep
(`apps/gateway/src/maintenance/inactive-thread-sweep.ts`) will write `inactivity`
when a quiet thread leaves the inbox for good — it closes the thread today and
does not yet record a reason. Collapsing
them into one value makes the briefing unable to tell "they moved on to a new
question" from "nobody ever came back."

Add canonical identity separately from the existing ingress-oriented
`Customer` table:

- `Person(id, organizationId, displayName, createdAt, deletedAt)`.
- `ChannelIdentity(id, organizationId, personId, customerId, channelType,
  externalId, assurance, scope, verifiedAt, revokedAt)`.
- `IdentityLinkAudit` recording link, merge, unmerge, actor, evidence category,
  and time.

`assurance` distinguishes anonymous, provider-asserted, verified-person, and
merchant-confirmed identities. The existing storefront order-code verification
remains **order-scoped**; it must not silently become a person-level login or
unlock unrelated conversation history.

Add long-lived context as structured records:

- `CustomerObligation(personId, originThreadId, sourceMessageId, kind, summary,
  relatedOrderId, status, createdAt, resolvedAt)`.
- `PersonMemoryFact(personId, key, value, source, sourceThreadId, verifiedAt,
  expiresAt, revokedAt)` for merchant-confirmed or Shopify-sourced stable facts.

Do not store model-inferred preferences as stable facts without an explicit
provenance and promotion rule.

`ThreadMemoryIndex` is **not** in this migration set. It is read-path, derived,
and specified in P9.

Ship this as two additive migrations:

1. Episode/request fields, `closedReason`, and storefront session/episode history.
2. Person, identity, audit, obligations, and stable facts.

Backfill one `Person` per existing `Customer`; this deliberately performs no
cross-channel merges. Keep the existing `threads_one_open_per_customer` index —
see the migration hazard above.

## P0 — Pin the regression before changing behavior

The assertions worth making are all gateway-side: thread creation,
`buildContext` contents, and plan publication. The dashboard storefront proxy
reaches the gateway over HTTP (`messages/route.ts:83`) and every existing
dashboard test mocks that hop (`messages/route.test.ts:144`), so a test written
there proves nothing about episodes. **Write this against
`apps/gateway/src/routes/internal-storefront-chat.ts` with a real database**, not
"the real proxy path."

- [ ] Add a gateway integration fixture with an open storefront thread containing
  an old refund conversation and `aiSummary`, last conversational activity three
  days ago, plus a valid resumable browser session.
- [ ] Post "Hi" to the internal storefront-chat route and assert the current
  broken behavior: the message lands on the old thread and planning can see the
  old refund context. Run it, watch it fail against the fixed behavior you are
  about to build, then invert it — do not leave a knowingly red assertion in the
  suite. The sibling lifecycle plan's own P0 records what happens when a test is
  left red against behavior no phase builds.
- [ ] Add the desired acceptance assertions: a new thread is created, old raw
  messages and old `aiSummary` are absent from `buildContext`, no merchant plan
  is published for the greeting, and the old episode is still retrievable by the
  widget as collapsed history.
- [ ] Add a control proving a ten-minute follow-up remains in the same episode.

## P1 — Make inbound persistence episode-aware and race-safe

- [ ] Extract thread selection from `processInboundMessage` into a shared
  `resolveInboundEpisode` service with channel policy as explicit input.
- [ ] After customer upsert, begin a database transaction and lock the stable
  customer row with `SELECT ... FOR UPDATE`. Inside that transaction, re-read the
  open thread, decide rollover, close the expired thread, create/reuse the new
  thread, and persist the message. The current `findFirst → create → catch P2002`
  sequence at `inbound-persistence.ts:142-184` is not sufficient for
  close-and-create races.
- [ ] On rollover, atomically clear `cachedPlan` and `cachedPlanMessageId`, stamp
  `closedReason = episode_rollover`, and bind the new storefront episode to its
  session. After commit, remove only the old thread's operator pending-plan/question
  state.
- [ ] Preserve genuine unresolved work only through `CustomerObligation`; never
  copy an old cached plan into the new thread.
- [ ] Make provider conversation identifiers part of the decision where they
  exist. Extend normalized email ingestion with a stable provider conversation
  key before enforcing email rollover.
- [ ] Keep dedupe keyed to the provider/client message identity so a retry cannot
  create a second episode.

### Verified-order scope must not move with the thread pointer

`buildContext` resolves storefront verification through
`session: { threadId: thread.id }` (`packages/agent/src/context.ts:215-224`), and
`isGuest` is derived from whether that returns anything. Rebinding
`session.threadId` on rollover therefore changes tool policy on **both** sides of
the boundary, silently:

- The new episode inherits the verification for the remainder of the session's
  30-day TTL (`bootstrap/route.ts:15`), across an unbounded number of episodes.
- The expired episode instantly reads as guest, so a late merchant reply or an
  operator replan on that thread runs under guest policy.

The second is a straightforward bug. The first is a product decision: the proof
was a browser proving control of one order, so carrying it within that browser
session is defensible, but it must be deliberate rather than a side effect of a
pointer update.

- [ ] Resolve verification through `StorefrontChatSessionEpisode` (episode →
  session → verifications) rather than the session's current `threadId`, so every
  episode of a session resolves the same verified orders regardless of which one
  is current. This is the second reason that table exists.
- [ ] Record the decision on carry-forward explicitly in the commit, including
  that it expires with the session and stays scoped to the verified order.
- [ ] Test both directions: a rolled-over episode on a verified session is not a
  guest, and the expired episode does not become one.

### Outbound race that must be fixed in the same phase

`createSentAgentMessage` passes `{ status: THREAD_STATUS.OPEN }` unconditionally
(`apps/dashboard/src/lib/messaging/dispatch-message-common.ts:19`). After a
rollover, a late merchant send could reopen the expired thread and collide with
the new open episode against `threads_one_open_per_customer`.

- [ ] Stop outbound persistence from unconditionally reopening a thread.
- [ ] Before provider delivery or storefront persistence, verify the target is
  still the current open episode and, for storefront chat, still the session's
  current `threadId`.
- [ ] Return a typed `episode_superseded` conflict for a late draft/approval.
  Do not silently reroute model-authored text onto the new episode because it was
  written from different context.
- [ ] Re-check current episode identity when executing cached plans and operator
  approvals, in addition to the existing source-message and plan-ID checks.

## P2 — Separate the current request from the episode summary

`getConversationStage` (`apps/gateway/src/message-handlers/planning-notifications.ts:124-139`)
already computes the trailing unanswered customer burst and already scopes to one
`threadId`. **Reuse it; do not write a second burst calculator.**

- [ ] Promote `getConversationStage`'s trailing-run logic into the shared helper
  the request summariser and the notification formatter both call, returning the
  burst's messages rather than only its count.
- [ ] Change thread intelligence to produce both an episode summary and a request
  result: `requestSummary`, `requestDisposition`, source message ID, order
  references, and product references.
- [ ] Build the request result from that burst only. The prior episode summary is
  not an input. The current episode summary may use earlier messages in the same
  episode.
- [ ] Commit intelligence with compare-and-set semantics: thread must still be
  open and `requestSourceMessageId` must still describe the newest unanswered
  customer message. Discard a superseded result.
- [ ] Remove every planning fallback from `thread.aiSummary`. Three exist:
  `generate-thread-plan.ts:81`, `operator-answer-replan.ts:120`, and
  `apps/dashboard/src/app/api/agent/answer/route.ts:78`. All must use the stored
  current request summary or the current burst.
- [ ] Preserve the existing plan-ID/source-message freshness checks and add the
  episode ID/thread-status check from P1.

## P3 — Gate plans and merchant notifications on the current request

- [ ] `none` and `acknowledgement` requests never create a merchant action plan.
  A greeting or "thanks" can receive the product's safe acknowledgement behavior
  without appearing as work for the merchant.
- [ ] Routine informational reads/replies follow the existing product decision:
  perform the safe read/reply when policy permits and report the outcome; do not
  present an approval card whose only value is asking permission to answer.
- [ ] Only `merchant_action` and genuinely unresolved `unclear` requests can park
  a merchant plan or question.
- [ ] Replace notification `aiSummary` inputs with `requestSummary`. The episode
  summary can appear only in a separately labelled background field when needed.
- [ ] Immediately before publishing a notification, assert current thread,
  current request source, current plan ID, and eligible disposition.

`getConversationStage` needs no episode-scoping work: it already queries by
`threadId`, so it becomes episode-local for free the moment P1 makes a thread an
episode. Nothing to build here — noted so nobody builds it twice.

This phase overlaps the safe-reply auto-execution that has since shipped in
`packages/agent/src/plan-execution.ts`: the routing and auto-execute decision
must be implemented once and evaluated together, not as two competing changes.

## P4 — Make the widget episode-aware

- [ ] Change bootstrap to return `currentEpisode` and a bounded list of
  `previousEpisodes` metadata rather than one flat message array
  (`bootstrap/route.ts:92-100`).
- [ ] Add an authorized history endpoint that accepts an episode ID only when the
  `StorefrontChatSessionEpisode` row proves the session owns it.
- [ ] Render current messages normally. Render prior episodes as collapsed, dated
  "Previous conversation" sections and fetch their messages only when expanded.
- [ ] Add a "New conversation" divider after hard rollover and a time divider
  after the soft 30-minute presentation gap.
- [ ] Reset optimistic-echo and `seen` bookkeeping per episode
  (`extensions/shopkeeper-chat/assets/shopkeeper-chat.js:111,131-149`) so
  identical text in two episodes is not suppressed or duplicated.
- [ ] Return the newest page of current messages. Bootstrap currently takes the
  *oldest* fifty (`orderBy: sentAt asc, take: 50`); paginate backward for older
  display history.
- [ ] Prove that expanding old history changes only the browser UI and never the
  agent request payload.

## P5 — Capture identity and obligations

Write-path only. Nothing in this phase changes what the planner sees; it starts
recording the facts P6 and P9 will read, because those facts cannot be
reconstructed after the fact.

- [ ] Backfill one person per customer and resolve context through
  `ChannelIdentity`, while leaving inbound routing on existing `Customer` IDs.
- [ ] Link automatically only from high-assurance evidence: authenticated Shopify
  Customer Account identity, a dedicated verified email/phone flow intended for
  person linking, or a merchant-confirmed merge. Customer Account OAuth is still
  a sketch in the storefront plan's M2 section, so expect every `Person` to hold
  exactly one `ChannelIdentity` until it lands. That is the expected state, not a
  failed rollout.
- [ ] Keep the existing order-code challenge scoped to its verified order unless
  a separate reviewed product decision upgrades that ritual to person identity.
- [ ] Never merge on display name, approximate text, an LLM judgment, or an
  unverified identifier supplied inside chat.
- [ ] Provide merchant merge and unmerge operations with an audit trail. Unmerge
  must stop future shared context without rewriting historical message ownership.
- [ ] On identity revocation/deletion, remove the link from future retrieval and
  preserve required audit/deletion semantics.
- [ ] Write `CustomerObligation` rows at the moment the agent commits to
  something — a promised refund review, a callback, a replacement — sourced from
  verified action outcomes and merchant decisions, not from a model's free-form
  recollection.
- [ ] Write `PersonMemoryFact` rows only from Shopify data or an explicit
  merchant/verified-person confirmation, with provenance and expiry.

## P6 — Stop dumping recent tickets

The cheap half of relevance, built now. Deleting the dump is the fix; ranking
what replaces it is P9.

- [ ] Delete the "three most recent closed threads for this Customer" query from
  `buildContext` (`packages/agent/src/context.ts:231-245`; it is already skipped
  for operator channels, so the deletion only affects customer threads).
- [ ] Always include applicable open obligations as their own structured section,
  resolved through the verified `Person`. This is deterministic — an obligation is
  open or it is not — and needs no relevance scoring.
- [ ] Include stable facts only when Shopify-sourced or merchant/verified-person
  confirmed, with provenance and expiry where appropriate.
- [ ] Remove the prompt-only instruction asking the model to ignore irrelevant
  tickets (`packages/agent/src/prompt.ts:43`). Keep a defensive wording boundary,
  but make upstream selection the correctness mechanism.

Eval consequences, checked against the fixtures rather than assumed:

- `memory-past-tickets-no-derail` passes trivially once the dump is gone — its two
  past tickets (#5012, Canada shipping) are unrelated to the current #5050
  question, so an empty memory section is the desired state. Rewrite the assertion
  to check the built context contains no past-ticket section at all, rather than
  that the model resisted one.
- `memory-past-ticket-continuity` will lose its continuity signal, and this is the
  fixture that proves P9 cannot be designed blind. Its customer message —
  "The replacement lamp you sent has the exact same cracked base as the first
  one" — names **no order number and no exact product title**. The naive
  deterministic rule sketched for P9 would not select the prior episode from the
  message text; only a match against `recentOrders` (#6060) or the resolved
  obligation would. The fixture is `advisory: true` and in the `extended` suite,
  so it degrades a judge-scored check rather than a hard safety gate. Accept that
  regression through P6 and close it in P9, recording the fixture as P9's
  acceptance case.

## P7 — Context assembly and budget rollout

- [ ] `buildContext` loads raw messages only from the current thread/episode.
- [ ] Replace `pastTickets` with typed `openObligations` and `stableFacts` fields
  (`relevantMemories` arrives with P9). Preserve provenance through the prompt
  boundary.
- [ ] `ctx.thread.aiSummary` means current-episode summary only. It may provide
  background, but it never supplies the planning instruction or notification
  delta.
- [ ] Make `AGENT_CONTEXT_BUDGET_MODE` default to `enforce` after the episode
  paths are proven. Remove the legacy unbounded branch after its rollback window
  rather than retaining two permanent context semantics.
- [ ] Update `apps/gateway/src/scripts/canary-context-budget.ts` to seed one
  visitor/person with multiple episodes and report selected/rejected memory counts
  without logging content.

## P8 — Rollout, observability, and cleanup

- [ ] Add `CONVERSATION_EPISODE_MODE=off|shadow|enforce`. Shadow computes the
  rollover decision and logs IDs/ages/reasons without closing or creating a
  thread. It must never log message or summary text.
- [ ] Add metrics for rollover reason/channel, stale-plan rejection,
  superseded-outbound rejection, request disposition, and identity assurance.
- [ ] Run shadow against storefront traffic first. Compare decisions to real
  transcripts manually on an isolated test organization.
- [ ] Enforce on the dev store, then a single controlled merchant store. Confirm
  the widget, dashboard, operator notification, and reply/approval paths together.
- [ ] Run the full agent eval gate **once**, after P2, P3, P6, and P7 are all
  complete — not once per phase. Safe-reply auto-execution has already landed and
  owes a gate run of its own; batch it into this one if the window allows, since
  both change planner-visible routing and a single gate covers them. If they land
  apart, each owes its own justification.
- [ ] After the rollback window, remove the old whole-thread planning fallback,
  flat widget history response, and shadow mode.

## P9 — Prior-episode retrieval (deferred)

**Do not build this with the phases above.** It is read-path: nothing depends on
its shape, it is derived from data P5 and P6 will already be recording, and it is
a ranking problem with no traffic to rank against yet. Revisit when storefront
chat has run under P1–P8 long enough to show what continuity shoppers actually
ask for.

Specified now so the intent is not lost:

- `ThreadMemoryIndex(threadId, personId, orderReferences, productReferences,
  resolutionSummary, createdAt)` for deterministic prior-episode retrieval, as a
  third additive migration.
- Include a prior episode only when at least one deterministic key matches:
  current order reference, product/variant reference, support tag plus a specific
  entity, or an explicit unresolved obligation. An explicit phrase such as "that
  refund" may resolve an open obligation; it is not permission to dump all past
  summaries.
- Return at most two prior episode memories, each containing channel, date,
  relationship reason, resolution summary, and references. Never include its raw
  transcript.
- Add `relevantMemories` to the context type alongside the P7 fields.

**Closes when:** `memory-past-ticket-continuity` passes again — that fixture
matches on `recentOrders` and the resolved obligation rather than on message text,
so it is the case that proves the matching rules are real. Add cross-channel
controls proving verified identities share relevant memory and unverified
lookalikes share nothing.

## Acceptance scenarios

- [ ] A visitor returns after three days and says "Hi": fresh episode, no old raw
  messages or old summary in context, no merchant plan, old chat collapsed in UI.
- [ ] The same visitor follows up after ten minutes about the active issue: same
  episode and coherent context.
- [ ] A visitor returns after three days and says "What happened with that refund
  for #1024?": fresh episode plus only the matching open obligation, with
  provenance; no old raw transcript. (Prior-episode memory beyond obligations
  arrives with P9.)
- [ ] An old cached plan exists when rollover occurs: it is expired and removed
  from operator queues; a structured unresolved obligation remains if applicable.
- [ ] A merchant attempts to send an approval drafted for the expired episode:
  typed superseded conflict, no provider send, no old-thread reopen.
- [ ] A verified storefront session rolls to a new episode: still verified, and
  the expired episode is still verified too.
- [ ] A verified email customer later uses an authenticated storefront account:
  the identities link, and relevant cross-channel memory can be selected once P9
  ships.
- [ ] A same-name or self-asserted-email storefront visitor receives no email or
  Instagram history.
- [ ] Two concurrent first messages after expiry create one new open episode and
  persist both messages exactly once.
- [ ] Expanding prior history in the widget has no effect on agent context.

## Verification commands

Run targeted suites during each phase, then the complete gates before rollout:

```bash
npm run test:unit -w packages/agent
npm run test:integration -w packages/agent
npm run test:unit -w apps/gateway
npm run test:integration -w apps/gateway
npm run test:unit -w apps/dashboard
npm run test:integration -w apps/dashboard
npm run typecheck
npm run lint
npm run test:evals -w apps/dashboard
```

The eval command needs a real configured model key and should be run once at the
explicit P8 gate, not after every mechanical phase.

## Audit-conflict coverage

| Existing conflict | Closed by |
| --- | --- |
| Session and conversation conflated | P1, P4 |
| Rollover only after manual close | P1 |
| Whole-thread raw history | P1, P7 |
| Prior summary carried through token bounding | P2, P7 |
| Whole-thread summary used as planning instruction | P2 |
| Every unanswered customer message treated as plan-worthy | P2, P3 |
| Merchant notifications restate whole conversation | P3 |
| Three recent tickets injected without relevance | P6 |
| Verified-order scope moves silently with the thread pointer | P1 |
| No cross-channel person identity | P5 |
| No structured request, obligation, or memory state | Migrations, P2, P5 |
| Flat widget transcript with no episode boundary | P4 |
| Late outbound can reopen an expired thread | P1 outbound race |
| No relevance ranking for prior episodes | P9 (deferred) |

## Out of scope

- Conversation-to-sale attribution; it is separately recorded in
  [to-do-list.md](to-do-list.md).
- Cross-device anonymous history without verified identity.
- Vector search over every transcript.
- LLM-decided identity merging or episode boundaries.
- Rewriting historical messages when people are merged or unmerged.
