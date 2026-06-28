# iMessage Operator Channel Plan

Archived 2026-06-27.

**Goal:** make iMessage **production-ready and merchant-account-free** by repointing it from a
customer-support channel to the **operator channel** — the agent↔merchant link, the exact role
Telegram plays today. The agent texts the merchant action plans, digests, and questions; the
merchant replies `yes`/`no`/instructions. No merchant ever touches Photon: they text one Shopkeeper
number from their iPhone, the same way they tap one Shopkeeper Telegram bot.

Written 2026-06-22.

> **Supersedes the customer-facing framing** in [`imessage-integration-plan.md`](./imessage-integration-plan.md).
> That doc shipped a working support channel (inbound→`Customer`/`Thread`→support reply), live-verified
> on a real iPhone 2026-06-21. The product intent is different: **iMessage carries operator traffic,
> not customer traffic.** Customers reach the merchant on Email / Instagram / TikTok; iMessage is
> strictly agent↔merchant. The Spectrum transport plumbing from that work is reused; the
> support-channel wiring is removed (see *Clean cut*).

> **Decisions locked (2026-06-22):**
> 1. **Channel-agnostic binding** — new `OrgMemberOperatorChat { channel, externalId, spaceId }`, not
>    an iMessage-only table. WhatsApp operator is next on the roadmap and this *is* the operator binding.
> 2. **iMessage is a per-user device binding**, sitting beside Telegram — not an org-level "Integration"
>    with pasted Spectrum credentials.
> 3. **Clean cut** — delete the support-channel iMessage path outright (no GA users). No dual path.

---

## The reframe in one line

iMessage is **Telegram's twin**: one shared Shopkeeper line that every merchant texts, with each
merchant differentiated by their **sender phone number** bound to an `OrgMember` — the precise analog
of how Telegram binds a numeric `chatId`. Everything downstream (operator command parsing, plan
approvals, digests, `OperatorContext`, the agent run) is **reused unchanged**; only the transport
(Spectrum/iMessage instead of the Telegram Bot API) and the binding key (phone instead of `chatId`) differ.

## How users are differentiated (the question that drove the reframe)

There is **one** Shopkeeper iMessage line — its own dedicated number — exactly as there is **one**
Shopkeeper Telegram bot. Every merchant texts that one number.

| Question | Identifier | Telegram analog | Where it lives |
|---|---|---|---|
| **Which merchant?** | sender phone `message.sender.id` | numeric `chatId` | `OrgMemberOperatorChat.externalId` (unique) → `OrgMember` |
| **Where do I reply?** | the `Space` (`space.id`) | the chat | `OrgMemberOperatorChat.spaceId` |
| **Operator state** | `pendingPlan` / `pendingDigest` / history | same | `OperatorContext (organizationId, chatId)` — reused, key namespaced `im:+1555…` |

Inbound routing is `senderPhone → binding → { organizationId, clerkUserId }`, mirroring
`telegram/message-handler.ts:48` (`orgMemberTelegramChat.findUnique({ where: { chatId } })`). A
sender we have no binding for is told to connect from the dashboard — same as an unbound Telegram chat.

## Apple's cold-outbound ban is the mechanism, not an obstacle

The agent **cannot text a merchant first** (Apple bans proactive/cold outbound; the existing
inbound-first guards at `outbound-imessage.ts:67` and `imessage-dispatch.ts:35` enforce it). That
makes binding necessarily **merchant-initiated**, which is exactly what we want:

1. Dashboard shows: *"Text `CONNECT <token>` to +1-555-SHOPKEEPER"* (with a tap-to-text `imessage:`
   deep link that prefills the body on iPhone).
2. The merchant sends it. That single inbound **(a)** establishes the `Space` so the agent can reply
   into it indefinitely afterward, and **(b)** carries the bind token.
3. From then on the agent pushes plans/digests into that Space whenever it needs the merchant.

This is the spiritual twin of Telegram's `https://t.me/{bot}?start={token}` deep link
(`api/integrations/telegram/route.ts:96`), adapted to iMessage's inbound-first rule. iMessage has no
WhatsApp-style session window, so once bound the agent can message the operator at any time.

## What the reframe removes from the prior plan

- ❌ **Per-merchant line provisioning** and the **Photon reseller/billing API** — gone. Shopkeeper
  provisions **one** Business line once (`photon spectrum lines add`). The only Photon account is
  Shopkeeper's.
- ❌ **`space.phone → org` routing** — replaced by the proven `senderPhone → binding` pattern.
- ❌ **Per-org Spectrum credentials** pasted into the dashboard — replaced by one set of
  platform credentials in gateway env.
- ⚠️ The existing iMessage **support wiring** (`Customer`/`Thread` creation via `inbound-persistence`,
  support replies via `imessage-dispatch`) — deleted.

---

## Architecture mapping (iMessage ⇄ Telegram)

| Concern | Telegram (today) | iMessage (this plan) |
|---|---|---|
| Transport | Telegram Bot API (`clients/telegram-client.ts`) | `spectrum-ts` cloud, one platform app |
| Inbound route | `routes/webhooks-telegram.ts` → `telegram/message-handler.ts` | `routes/webhooks-photon.ts` (shared) → new `imessage/operator-handler.ts` |
| Identity key | numeric `chatId` | sender phone `message.sender.id` |
| Binding flow | `/start {token}` → `telegram/start-binding.ts` | `CONNECT {token}` → new `imessage/start-binding.ts` |
| Bind token mint | `api/integrations/telegram/route.ts` (Redis `telegram:bind:{token}`) | `api/integrations/imessage/route.ts` (Redis `imessage:bind:{token}`) |
| Binding table | `OrgMemberTelegramChat` | `OrgMemberOperatorChat` (channel-agnostic) |
| Outbound notify | `operator-notify.ts` → `telegramSend` | `operator-notify.ts` → `outbound-imessage` enqueue into Space |
| Operator state | `OperatorContext` | `OperatorContext` (unchanged) |
| Command handlers | `telegram/{command-parser,pending-plan-commands,digest-commands,…}` | **reused unchanged** |
| Agent turn | `execute-operator-agent-turn.ts` | **reused unchanged** |

---

## Data model

**New `OrgMemberOperatorChat`** (channel-agnostic; replaces the per-channel `OrgMemberTelegramChat`
role). Mirrors `schema.prisma:300`:

```prisma
model OrgMemberOperatorChat {
  id          String   @id @default(uuid()) @db.Uuid
  orgMemberId String   @map("org_member_id") @db.Uuid
  channel     String   @db.VarChar(32)          // "telegram" | "imessage"
  externalId  String   @map("external_id") @db.VarChar(128) // chatId | sender phone (E.164)
  spaceId     String?  @map("space_id") @db.Text            // iMessage Space; null for Telegram
  displayName String?  @map("display_name") @db.VarChar(255)
  username    String?  @db.VarChar(255)
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz

  orgMember OrgMember @relation(fields: [orgMemberId], references: [id], onDelete: Cascade)

  @@unique([channel, externalId])
  @@index([orgMemberId])
  @@map("org_member_operator_chats")
}
```

- `@@unique([channel, externalId])` keeps the "one chat/phone → one member" invariant per channel
  (today's `OrgMemberTelegramChat.@@unique([chatId])`).
- `OrgMember.telegramChats` becomes `OrgMember.operatorChats`.
- **Migration:** add the table, backfill existing `OrgMemberTelegramChat` rows as
  `{ channel: "telegram", externalId: chatId, spaceId: null, … }`, repoint queries, drop the old
  table. Device cap (`MAX_OPERATOR_DEVICES = 3`) is now per-member across channels (or per-channel —
  decide during impl; per-member is simpler and matches the "3 devices" UX).

**`OperatorContext` is unchanged** — `(organizationId, chatId)` with an opaque `chatId` string
(`schema.prisma:261`). iMessage uses the namespaced sender phone (`im:+1555…`) as the `chatId` value
so it can never collide with Telegram's numeric ids in the shared table.

**No `Integration` row for iMessage operators.** iMessage leaves the `Integration`/Spectrum-creds
model entirely; the binding lives on `OrgMemberOperatorChat`.

---

## Gateway changes

### 1. One platform Spectrum app — `clients/spectrum.ts`
Collapse the per-integration `Map` (`spectrum.ts:30`) to a single lazily-built app from env:

```ts
Spectrum({
  projectId: process.env.PHOTON_PROJECT_ID,
  projectSecret: process.env.PHOTON_PROJECT_SECRET,
  webhookSecret: process.env.PHOTON_WEBHOOK_SECRET,
  providers: [imessage.config()],
})
```

Cache as a single promise with the existing reject-eviction guard. `stopAllSpectrumApps()` stays
(now stops the one app) — the in-flight shutdown diff (`index.ts`, `worker.ts`) remains valid.
Delete `getSpectrumAppForIntegration`, `getSpectrumAppForOrganization`, `readSpectrumCredentials`,
and the credential-hash machinery.

### 2. Shared inbound webhook → operator — `routes/webhooks-photon.ts`
- One route `POST /webhooks/photon` (drop `:integrationId`), verified by `app.webhook(...)` against
  the platform webhook secret.
- In the `app.webhook` callback, narrow to iMessage and build the operator message context:
  `{ phone: message.sender.id, spaceId: space.id, body, reply }` where `reply` sends into the Space.
- Hand to a new `imessage/operator-handler.ts` that **mirrors `telegram/message-handler.ts`**:
  - `CONNECT`/start → `imessage/start-binding.ts` (mirror `start-binding.ts`): read
    `imessage:bind:{token}` from Redis → resolve `OrgMember` → upsert `OrgMemberOperatorChat`
    (`channel:"imessage"`, `externalId: phone`, `spaceId`) → reply "Connected."
  - else look up binding by `(channel:"imessage", externalId: phone)` → member; unbound → reply
    "connect from your dashboard."
  - else load `OperatorContext` and **dispatch through the existing command handlers verbatim**
    (`parseTelegramCommand` → generalize the name; help/summary/digest/plan-run/plan-dismiss/
    order-lookup/pending-question/`executeFreeFormInstruction`). These already take a `reply` closure
    and are org-scoped; the only transport-specific seam is `reply`.
- **Refactor seam:** the `telegram/` command handlers are transport-agnostic except for the injected
  `reply`. Lift the parser + handlers to a channel-neutral `operator/` module (or keep in place and
  import) so both `webhooks-telegram` and `webhooks-photon` feed them. No behavior change.

### 3. Outbound / notify generalization — `operator-notify.ts` + `planning-notifications.ts`
- `notifyOperator` (`operator-notify.ts:45`) is Telegram-only today (`telegramSend`). Make it
  **channel-aware**: the member carries `{ channel, externalId, spaceId }`; dispatch
  `telegram → telegramSend`, `imessage → enqueue outbound-imessage into spaceId`. The
  `OperatorContext` patch persistence is unchanged (keyed by the namespaced id).
- The fan-out functions in `planning-notifications.ts` (`sendOperatorPlanNotification`,
  `sendOperatorQuestionNotification`, `sendOperatorAutoExecutionNotification`) query
  `orgMemberTelegramChat` (`planning-notifications.ts:82,145,184`). Repoint to enumerate **all**
  `OrgMemberOperatorChat` rows for the org and notify each on its own channel. Result: a merchant who
  bound iMessage receives plan pushes over iMessage — the planner needs **zero** changes.

### 4. Clean cut of the support path
- Remove the iMessage branch that routes inbound to `processInboundMessage` (`channels.ts` →
  `inbound-persistence.ts`), i.e. stop creating `Customer`/`Thread` rows for iMessage.
- Delete the support dispatch path `lib/messaging/imessage-dispatch.ts` and its wiring.
- **Keep** the low-level Spectrum send (`message-handlers/outbound-imessage.ts`) — `stripMarkdown`,
  the `sendStatus` idempotency gate, and the inbound-first guard all still apply; it now carries
  operator notifications into a Space instead of customer replies. (Re-evaluate whether the message
  row model still fits, or whether operator sends should be fire-and-forget like `telegramSend`.)

---

## Dashboard changes

### 1. Connect UI — mirror Telegram
Rewrite `api/integrations/imessage/route.ts` to mirror `api/integrations/telegram/route.ts`:
- `POST` → upsert `OrgMember`, enforce the device cap, mint a Redis bind token
  (`imessage:bind:{token}`, 24h TTL), return the **Shopkeeper iMessage number** + a tap-to-text
  `imessage:` deep link prefilled with `CONNECT {token}`.
- `GET` → list the member's bound iMessage devices.
- `DELETE` → disconnect one/all (mirror the Telegram DELETE).

Replace the credential-paste body in `components/integrations/connect-bodies.tsx` with the
number + tap-to-text link + the inbound-first explainer. iMessage now renders as a **per-user device
card beside Telegram**, not an org "connect your account" integration.

### 2. Catalog copy — `lib/integrations/catalog.ts:67`
Reframe from *"Reply to customers who text your business on iMessage"* to the operator framing,
matching Telegram's card: *"Approve agent plans and get ticket digests over iMessage."*

---

## Env & one-time ops

**Gateway** (add): `PHOTON_PROJECT_ID`, `PHOTON_PROJECT_SECRET`, `PHOTON_WEBHOOK_SECRET`,
`PHOTON_IMESSAGE_NUMBER` (the line to display / pin sends to). Update `.env.example`, env validation,
and the gateway env list in `.claude/CLAUDE.md`.

**Dashboard** (add): the Shopkeeper iMessage number for the connect UI (`NEXT_PUBLIC_…` or proxied
from the gateway).

**One-time:** provision the single Shopkeeper Business line (`photon spectrum lines add`; upgrade the
project to Business for a dedicated number), then point its Spectrum webhook at `/webhooks/photon`.
Remove the per-org webhook-URL surface (`_lib/photon-webhook.ts` `buildPhotonWebhookUrl`).

---

## What's reused unchanged

- The agent core (`packages/agent/`) — channel-agnostic; no changes.
- `OperatorContext` model + `operator-context.ts` helpers.
- All `telegram/` command handlers, `command-parser`, `pending-plan-commands`, `digest-commands`,
  `pending-question-commands`, `execute-operator-agent-turn.ts`, `agent-execution.ts`.
- `order-status-fast-path`, `intent.ts`, digest builder.
- The internal operator agent run route (`agent/internal`, `sms_agent`).

## Open verification items (before coding the webhook)

1. **`message.sender.id`** is the merchant's stable E.164 (the binding key) across messages — via
   iMessage platform narrowing (`imessage(message)` / `imessage(space)`).
2. **`space.id`** is durable for sending into later (the agent reuses it days afterward), and
   `im.space.get(spaceId)` reconstructs it.
3. Confirm the `imessage:`/`sms:` deep-link body-prefill behavior on iOS for the tap-to-connect link
   (fallback: instruct the merchant to type `CONNECT <token>`).

## Sequencing

1. **Data model** — `OrgMemberOperatorChat` + migration + repoint Telegram queries (no behavior
   change; keeps Telegram green). *This is the spine.*
2. **Gateway one-platform app** + shared `/webhooks/photon` route scaffold (no operator logic yet).
3. **Binding** — `imessage/start-binding.ts` + dashboard `POST/GET/DELETE` + connect UI.
4. **Inbound operator** — lift command handlers to channel-neutral, wire the iMessage handler.
5. **Outbound** — channel-aware `notifyOperator` + `planning-notifications` fan-out.
6. **Clean cut** — delete the support-channel iMessage wiring.
7. **Env/ops** + docs.

## Testing (real DB, per repo convention)

- Binding: phone→member resolution, token expiry, device cap, rebind-moves-binding, unbound reply.
- Inbound: operator command dispatch parity with Telegram (reuse the telegram handler tests against
  the iMessage `reply`).
- Outbound: channel-aware `notifyOperator` routes telegram vs imessage; plan/question/auto-exec
  fan-out reaches an iMessage-bound member.
- Webhook: signature against the platform secret; unknown sender; non-inbound skipped.
- Update the live-iMessage verification recipe for the shared-line + binding model.
