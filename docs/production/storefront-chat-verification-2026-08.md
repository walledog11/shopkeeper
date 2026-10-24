# Storefront chat — findings and standing constraints

The findings that apply beyond this channel, the invariants to read before
changing anything inside it, how to enable and verify it on a store, and the
deferred M2 sketch. The verification chronology these came from is in git
history.

## Durable findings

Each one cost a live failure to learn.

- **"On HEAD" has to name three deploy surfaces.** Vercel, Railway, *and* the
  Shopify app version. The theme extension asset ships inside the app version
  and reaches no storefront until `shopify app deploy`, so the widget can be
  days stale while both hosts are current. "Merged" is not "deployed" on any of
  the three.
- **A migration must reach production before the code that reads it.** Nothing
  in the deploy path enforces the ordering, and the failure is invisible from the
  merchant side: the dashboard stays healthy and an unsigned probe answers `401`,
  which reads as alive. Check `prisma migrate status` against production as a
  release step.
- **Check the deployed gateway version after a build failure.** Railway can keep
  the last good container serving. The production build now excludes tests;
  run the separate typecheck as well. Check `railway deployment list` whenever
  gateway-side code looks like it did not take effect.
- **The agent registry and `static-policy.ts` reach the client bundle.** Anything
  they import comes with them (`node:crypto` and `@shopkeeper/db` have both
  leaked in this way). Confirm with `next build`, not by reasoning about it.
- **Notification shape follows the decision the merchant has to make, not what
  the agent did.** Routine, safe, identity established → act, then report in one
  line. Genuine uncertainty → one question about the uncertain thing, not a
  restatement of the conversation. Risky or irreversible → the full card, and
  "Good to send?" belongs there and only there. Before shipping any
  merchant-facing surface, read it as a 24-year-old selling artisan products, no
  e-commerce experience, who bought something that promised an employee rather
  than a bot. If it reads as paperwork, the fix is upstream of the copy.
- **A prompt growing situation-by-situation means a capability is missing.**
  The guest section once grew to 13 bullets of per-output patches and still
  shipped bad turns; adding the missing capability collapsed it to 5 bullets of
  principle.
- **Stock-vs-flow.** A delta ("sent N more messages") pasted next to a stock
  (`aiSummary`, the whole conversation) makes every follow-up re-read as news.
- **A link that is built is not a link that resolves.** Any outbound URL —
  notification, email, deep link — needs one live click, once. Tests that assert
  the string is constructed do not prove the route exists.
- **Free text in a tool argument reaches the merchant ungrounded.** A
  model-authored `escalate_to_human` reason rendered verbatim can assert an
  action that was neither executed nor proposed. `AgentAction` answers what ran
  and the cached plan answers what was planned; a claim absent from both is
  fabricated, and only the pair proves it.
- **A deterministic fast path passing is not the model path working.** `yes`
  can execute a pending plan while "go ahead and approve the refund" on the same
  plan reads as a fresh instruction. Verify the prose path separately or the
  keyword path will hide it.

---

## Standing constraints

Read these before changing anything on this channel.

**Identity and disclosure**

- **Nothing a shopper types is proof of identity.** An order number, email, phone
  number, Liquid customer value, browser-supplied Shopify ID, or claim to be staff
  changes what can be looked up only through a tool built to take it — never
  through the model's judgement that they sound genuine.
- **Disclosure only ever flows to the address already on the order.** The reply to
  a verification request is identical whether the order exists, whether the email
  matched, and whether anything was mailed. A Shopify lookup error returns `sent`
  too — surfacing it would make Shopify's availability observable per order number.
- **Verification is scoped to the order, not the customer.** Verifying `#1025`
  cannot read `#1026`. Enforced in static policy on parsed arguments, not in the
  prompt.
- **Verification unlocks reads and never mutations.** Cancel, edit, refund and
  address change stay out of guest and verified alike at every autonomy tier, and
  continue to escalate. Whether a verified shopper should be able to *initiate* a
  mutation that then goes to merchant approval is deliberately still open.
- **Blocking happens in static tool policy, not the prompt.** Every order read,
  customer read and mutative Shopify action is refused ahead of argument parsing,
  so a plan naming a forbidden tool is blocked at execution rather than merely
  absent from the tool list.
- **The host runs the challenge, not the agent.** The model never decides whether
  someone is verified; it only ever sees a session that already is or is not. That
  keeps the ritual out of the plan/approve loop and leaves the planner's
  no-side-effects contract untouched on every channel.

**Speech**

- **Shop register, not system register.** Never name tools, lookups, widgets,
  integrations or permissions to a shopper, and never invent a support department
  or an email address that was never given.
- **The guest prompt section is principle, not situation-patching.** See the
  finding above before adding a bullet.
- **Every capability with an edge will try to narrate that edge.** State the
  boundary *and* the move that replaces talking about it, or the model will fill
  the gap by explaining itself.

**Containment**

- **The storefront budget is denominated in messages, not dollars**, and sits
  beneath the org daily cap rather than inside it. Exhausting the storefront must
  degrade the widget alone and leave the merchant's email and Instagram agents
  running, which a shared counter cannot express.
- **The gate runs before the model**, so a refusal costs nothing. Counters move
  only on an admitted message.
- **The per-IP limit rests on an unverified header** and is keyed on
  (integration, address) so that being wrong degrades into a second per-shop rate
  limit rather than leaking across merchants or locking out the internet. Neither
  daily budget nor the per-session burst limit depends on it.

**Accepted costs, recorded so they can be revisited**

- **A valid order number reveals that order's shipping state.** The residual cost
  of `get_order_fulfillment_status`, which deliberately needs no identity because
  "has it shipped" does not. Bounded to shipping state; no name, address, contact
  details, items, amounts, or tracking number. Requiring the email alongside the
  number is a one-line change if the trade stops being worth it.
- **No cross-channel customer identity.** A shopper who chats on the storefront
  and later emails is two customers with two threads, and agent memory will not
  join them. Until cross-channel identity is built, channels stay separate rather
  than joined by a weak name or address guess. The deferred identity work is in
  [ROADMAP.md](../ROADMAP.md).
- **The merchant must disable Shopify Inbox** to avoid duplicate launchers. There
  is no coexistence story.

---

## Running it on a store

**Current implementation (October 2026).** Verification attempts are serialized,
resends preserve the remaining guesses, and email/order/shop limits survive a
new browser session. Matching and nonmatching requests both leave a challenge,
so a follow-up code submission does not disclose an order/email match. Product
search on this channel requires active Online Store publication and returns no
internal inventory quantities. This follows Shopify's
[product publication fields](https://shopify.dev/docs/api/admin-graphql/2026-04/objects/Product#field-Product.fields.onlineStoreUrl).
Pending, failed and unknown replies are excluded from the shopper transcript.
Expired sessions cannot authorize order access or receive new replies.

Message persistence and the session/shop message budgets commit together;
duplicate retries consume no extra allowance. Burst counters still count new
attempts, including refused ones. The session allowance is for the session's
lifetime; only the shop allowance resets daily. The widget retains failed drafts
in the open tab and retries with the original message ID. A slow reply is shown
as waiting; only server-confirmed escalation displays a handoff.

**Release configuration.** Set a random `STOREFRONT_CHAT_SIGNING_SECRET` of at
least 32 characters on the dashboard before enabling the platform switch. Keep
`SHOPIFY_APP_SECRET`, `INTERNAL_API_SECRET`, `GATEWAY_INTERNAL_URL` and dashboard
Redis credentials configured, with the internal secret matching the gateway.
The integration setup panel reports recorded Shopify permissions, email sender
configuration, merchant messaging, and the last storefront connection. These are
configuration checks, not proof of provider delivery or active theme placement.
Reconnect older Shopify installs for `write_app_proxy`, `read_products` and
`read_orders`; the OAuth scope request now includes the app-proxy permission.

Deploy the dashboard, gateway and Shopify app version together. This change
requires no new database migration. Before enabling a customer-facing store,
use a development store to check the theme embed on desktop and mobile, a
published product question, an unpublished product exclusion, verification email
delivery, a merchant handoff and reply, refresh/resume, an interrupted send and
retry, and disabling chat. Save the embed on the intended live theme. Keep the
platform switch off until that end-to-end check passes.

**Enable for a merchant.** Two switches, both off by default: the platform kill
switch `STOREFRONT_CHAT_ENABLED=true` on the dashboard (without it the merchant's
toggle reads "not available for your workspace yet"), and the merchant's own
toggle. The merchant then does three things, and ops edits no metadata:

1. Turn on storefront chat from the Shopify integration card.
2. Activate the **Shopkeeper Chat** theme app embed (the card links to the theme
   editor) and save the theme.
3. Remove the Shopify Inbox chat bubble.

The widget a store shows is the one the last `shopify app deploy` released (see
the first finding above).

**A missing launcher can be a missing asset.** On October 22 the active embed on
the development store referenced `shopkeeper-production-29/assets/shopkeeper-chat.js`,
but Shopify's CDN returned an HTML 404. Chromium reported `ERR_BLOCKED_BY_ORB`;
the root element existed but had no shadow root. Check the actual deployed script
URL, status and content type before changing the merchant's activation settings.
Before publishing, substituting the repaired asset in an isolated browser
confirmed the app proxy returned 200 and issued a session. A normal launcher
click worked on desktop, and the mobile composer cleared the preview toolbar.

**Preview toolbar overlap.** Shopify's preview toolbar is in the browser's top
layer and can cover a fixed chat launcher regardless of its z-index. The widget
now measures `PBarNextFrameWrapper`, keeps the launcher and desktop panel above
it, and limits the mobile panel to the remaining viewport. Measure the visible
wrapper: its iframe spans the viewport even though only the bottom strip shows.

**October 22 extension release.**
[`storefront-chat-repair-20261022-2`](https://dev.shopify.com/dashboard/40511769/apps/382559485953/versions/1178311491585)
is active. The published `test-data` theme (`144485875946`) on
`palette-dev-3peukw16.myshopify.com` still has the correct chat embed enabled.
Post-release browser verification is pending a fresh preview link: the supplied
link expired and now redirects to `/password`. Check the actual rendered script
URL returns JavaScript, then click the launcher and confirm bootstrap succeeds.
This release publishes the Shopify extension only; the dashboard and gateway
changes above still require their own deployment.

**Browser matrix**, on the dev store: Online Store 2.0 and a vintage theme ×
desktop and mobile × embed on and off × Shopify Inbox bubble present and removed.

**Router-materialized escalation.** When routing escalates on structural
evidence, `applyEscalationRouting` replaces the plan's escalation with one whose
id is `tu_route_escalate` and, on storefront, keeps the drafted `send_reply`
(`keepReply`). A model-elected `escalate_to_human` keeps the model's own id and
never reaches that branch, so firing it takes a message the model believes it can
answer while routing escalates anyway.
`apps/gateway/src/scripts/inspect-escalation-routing.ts` lists recent cached plans
and marks each escalation router-materialized or model-elected, and whether the
reply was kept.

**Episode boundary.** Widget, dashboard, operator notification and the
reply/approval paths together across a rollover; boundaries are
`CHANNEL_EPISODE_POLICY` in
`apps/gateway/src/message-handlers/inbound/resolve-inbound-episode.ts`. Closing the
thread from the dashboard does not test it, because a closed thread takes the
plain no-open-thread branch. `apps/gateway/src/scripts/backdate-episode-clock.ts`
moves one thread's conversational clock back so the next message crosses the
idle boundary; it is a dry run unless `CONFIRM=1`, and `HOURS=-25` undoes
`HOURS=25`.

**A `chat_assisted` order.** Talk to the widget, verify an email, buy something,
then confirm a `conversation_attributions` row with `kind = 'chat_assisted'` and
the attribution line in the next briefing (`loadAttributionLine`). Attribution
reaches only shoppers the order can be tied to (`match_basis` is
`verified_email`, `customer_platform_id` or `shopify_customer`); a wholly anonymous
shopper is not counted.

---

## M2 — Customer Account OAuth, deferred and largely superseded

Kept as a sketch. **Do not build against this section without specifying it
properly.**

The emailed-code verification (M1.5) covers most of what this milestone was for,
without forcing a re-authorization on anyone. What it does *not* cover is genuine
account binding — order history across orders, saved addresses — which is the
only reason left to build it, and only if a merchant actually asks.

Customer Account OAuth provides a high-assurance channel identity that links the
storefront visitor to a canonical person. It does not turn the session into a
conversation or authorize replaying every prior transcript; it restores the normal
autonomy and tool policy for that shopper only at the assurance scope the login
establishes.

It needs: a `StorefrontChatAuthAttempt` table for single-use state and the PKCE
verifier; the `customer_read_customers` and `customer_read_orders` scopes;
encrypted access/refresh token storage through the existing token-encryption
utilities; refresh and revalidation on later bootstraps with identity cleared on
refresh failure; session revocation when a token refresh fails; and a persistent
sign-in control in the widget.

Two things must be settled before it is scheduled:

- **Those scopes force re-authorization for every already-connected merchant** —
  a migration with merchant-facing consequences, needing its own plan.
- **The Customer Account API requires the shop to be on new customer accounts.**
  Merchants on classic accounts could never use the verified path and would stay
  guest-only. Confirm the eligibility rule and decide whether a permanently
  two-tier experience is acceptable before committing.

## Deferred beyond M2

Checkout and thank-you chat extensions, attachments, offline verified email,
Storefront MCP commerce cards, rich commerce UI, cross-device history, App Store
listing, and public distribution.
