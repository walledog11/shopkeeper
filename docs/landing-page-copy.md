# Landing page copy

**Status:** Locked and **not yet implemented** — `Hero.tsx` still renders the
pre-deck H1. Applying it is an open item under Phase 2 of
[landing-page-media-and-content-plan.md](landing-page-media-and-content-plan.md).

**Last updated:** 2026-09-01

**Scope:** The homepage only — `apps/dashboard/src/app/(marketing)/page.tsx` and the
components it composes. The navbar, the footer, and the four `/product/*` pages are
not covered here.

**Source of product status:** [product-truth.md](product-truth.md),
[to-do-list.md](to-do-list.md), and
[landing-page-media-and-content-plan.md](landing-page-media-and-content-plan.md)

This document is the copy spec. It is written to be implemented from directly: each
section names the component that renders it and gives the final strings. Nothing in
this document is code, and applying it is a separate task.

---

## Read this before changing anything here

### Who this copy is written for

A solo Shopify merchant running a small clothing, candle, or accessories brand, often
alone, often alongside a job. They answer their own DMs at 11pm. They are not
technical and will not read a spec. Their alternative to this product is doing
nothing.

### The rules this copy was written under

1. Second person throughout. There is no "the merchant" anywhere on the page.
2. Banned words: *consequential*, *supported* (as an adjective), *workspace*,
   *surface* (as a noun), *context* (as a noun), *execution*, *eligible*,
   *configured*, *operating record*. Where a hedge was protecting a real limitation,
   the limitation is stated in plain words instead of hedged around.
3. Every section body contains at least one concrete noun from the merchant's actual
   day — an order number, a customer's request, a time of night, a refund amount.
4. Sentences under 20 words. One idea each.
5. **Every factual claim stays exactly as true as it was.** Rewriting for voice must
   not restore a claim the honesty pass removed. See "Load-bearing hedges" below.

### One story, told at five depths

The page follows a single request end to end: Maya Chen asks to swap a linen jumpsuit
from Medium to Small on **order #3102**, which is paid and not yet shipped, with 12
Small in Sand in stock. The hero, the demo, the workflow, the grounding section, the
four-places diagram, and now the morning briefing are all the same request seen closer
up. Keep her. A page that invents a new customer per section reads as five features;
this reads as one employee.

The clock runs straight through, and it is easy to break by accident: Maya writes at
**2:14 AM** (Section 3 and the demo video), you get to your DMs at **11pm** and say yes
(Section 1), and the **7am** briefing next morning reports it done (Section 8). Three
times, one sequence. Changing any one of them in isolation puts the page back where
this document found it.

**One string in the video has to move.** `HeroMedia.tsx` timestamps Maya's message
`Today 4:12 PM`, in two places, which is a second time for the message Section 3 puts
at 2:14 AM. Making 11pm *yours* fixed the hero's conflict but not this one. Change both
to `Today 2:14 AM`. It is the only code change in this document that is not a string
swap in a copy deck, and it is still a string swap.

---

## Decisions taken

All four open items were resolved on 2026-09-01 against the code. The reasons are
recorded because each is a claim someone will want to re-open later, and the
reason is the part that rots.

**[1] Website chat is a real channel, and it goes on the page.** Storefront chat
is built and released: `shopify_chat` is in the `ChannelType` enum, the data
model is there (`StorefrontChatSession` plus its usage, verification, and episode
tables), the proxy routes live under `api/storefront-chat/`, and
[to-do-list.md](to-do-list.md) records that the released Shopify app carries the
widget, so a merchant connecting today gets it. The FAQ answer was the stale
half, not the tile. Sections 6, 9, and 12 now name the channel together.

**[2] Starter and Pro differ by volume and seats, not by features.** Resolved
against `packages/db/plan-limits.ts`, whose own comment exists to stop this being
reintroduced: the ladder sells volume and seats, and "nothing here gates a tool
or a capability." Commit `c558c788` — *Stop the pricing page selling gates that
do not exist* — already removed this framing from `Pricing.tsx` on 2026-08-19,
and a later redesign put it back, which is the state the live page is in today.
So the narrow reading of "AI-assisted customer replies" was not the safe
direction. It was false: a $19 subscriber already gets Shopify actions, phone
approvals, and voice training. Section 11 is rewritten around what actually
differs.

**[3] The site says "store". The app keeps "workspace" until it is renamed.**
Two of the three collisions turned out not to be collisions. The app's control is
labelled **Trust level** (`AgentAutonomySection`), and its three modes are
**Draft only**, **Ask first**, and **Trusted** (`autonomy-tiers.ts`) — Section 5
and FAQ Q1 already match the product exactly and must not be "fixed". There is no
*custom instructions* control anywhere in the app; the nearest real field is
**About your store**, which is what Sections 7 and 9 now say. Only *workspace* is
a genuine divergence, and there the site leads.

**[4] "Most picked" comes off the Pro card,** replaced by **Recommended** — which
is also the word the app already badges its recommended trust level with.

### The smaller calls

- **The hero's hour is settled at 11pm, and it is yours.** The amendment is now
  the hero body, and the stronger pitch — the work is already done when you show
  up — comes first. That fixes the hero, but the video's `Today 4:12 PM` was
  still a second time for Maya's message, so it moves to 2:14 AM as well. Both
  occurrences, in `HeroMedia.tsx`.
- **Draft-only is promoted into Section 5**, as a line under the three cards
  rather than a fourth card, so the grid is untouched.
- **The first-time-customer limit is stated in Section 7**, on the left card, so
  the body still closes on the thing that section exists to settle.
- **The morning briefing gets a real section.** Section 8 now shows the message
  instead of describing it.
- **"I don't use Shopify. What do I get?" stays softened.** "Is this useless?" is
  better copy and remains available, but that word sits beside your own product
  in a large font on a page people screenshot.
- **The alternative close stays unwritten.** "Give it two weeks. Fire it if it's
  bad." does not move to the pricing card either — Section 11 now has volume and
  seats to explain and does not need a second job.
- **"Configurable" stays banned** as the same family as *configured*. The Section
  11 rewrite removed the line that wanted it.
- **Section 10's fact 1 stays flat and falsifiable.** "Another store using
  Shopkeeper can't see your customers or your orders" is a promise being chosen,
  not a hedge that slipped past.

## Follow-on work this page creates

This document holds no checkboxes. Applying this deck, provisioning the two Stripe
price IDs, renaming workspace → store in the app, and dropping the website-chat
hedge on `/product/integrations` are all open items in
[landing-page-media-and-content-plan.md](landing-page-media-and-content-plan.md),
which is where every landing-page task is tracked. The storefront-chat production
canary is in [to-do-list.md](to-do-list.md).

## Load-bearing hedges — do not polish these away

Each of these survived an honesty pass. They read as friction and a later editing pass
will want to cut them. Cutting any one of them restores a claim this product cannot
make.

| Where | The words | What they protect |
|---|---|---|
| Hero, trial line | "You add a card when you pick a plan" | A payment method **is** collected, just later. Not "no credit card required." |
| S2, caption | "Fictional customer, store, and order details" | Nothing in the demo is a customer outcome. Not "example." |
| S2, caption | "Once it ships, a swap becomes an exchange" | The real boundary, read out of the registry rather than hedged around: `edit_shopify_order` is for orders that have not shipped, `create_exchange` takes over after, and only when the replacement costs the same or less. |
| S3, dark card | "Demo data" / "Fictional store and customer" | Same as above. The card is invented and must say so. |
| S4, body | "It asks you before it does" | Not "before every one" — an absolute a settings change could falsify. |
| S4, link | "See everything it can do to an order" | The nine listed items are **not** the complete set — the registry carries about twice as many. Verified 2026-09-01. |
| S5, card 1 | "if that's the trust level you set" | There is a mode where nothing sends at all. |
| S5, under cards | "can't send anything at all" | Draft only is a real mode in `autonomy-tiers.ts`, not a turn of phrase. |
| S6, strip | The whole strip | It is what keeps "you never have to open the dashboard" honest, since setup happens there. |
| S7, body | "it asks you instead of inventing one" | Matches the FAQ's hedged claim. Not "it always knows." |
| S7, chips | "Your approved voice" | The voice brief only changes after you approve it. "Your voice" alone implies it drifts on its own. |
| S7, left card | "A first-time customer has no history" | States the limit the old "available history" hedge only gestured at. |
| S8, card | Two separate *optional*s | The briefing is opt-in, **and** the sales and low-stock lines are opt-in on top of it. Merging them loses one. |
| S8, message | The briefing's own wording | Quoted from what the gateway actually writes (`handled-section.ts`, `needs-you.ts`). Rewriting it into marketing prose turns the message into a mock-up of a message. |
| S9, H2 | "in minutes" | Inherited and untimed. Do not sharpen to a specific number without a stopwatch. |
| S10, all | "logins are encrypted" | Connected-provider credentials only. **Not** "your data is encrypted." |
| S11, sub | "Check the plan and total in checkout" | Checkout is the price source of truth; the page cannot guarantee the number beside it. |
| S11, shared line | "Both plans are the same product" | There is no per-tier feature gating anywhere in the codebase, and nothing on the card may imply one. This is the sentence that keeps the whole section honest. |
| S11, the numbers | 500 / no limit, one / two seats | Real in `PLAN_LIMITS`, unenforced in production until the two price IDs are provisioned. They understate what a merchant gets today — the safe direction — but they are not yet true *as limits*. |
| S12, Q1 | All five clauses | The most claim-dense passage on the page. If it must be shorter, cut a question, not this answer. |
| S13, sub | "it'll have the reply ready" | True in both modes — routine replies sent, others waiting with facts attached. **Not** "it'll have already replied." |

---

## Section 1 — Hero

**Renders in:** `_components/Hero.tsx`

**Kicker:** An AI support operator for your Shopify store

**H1:** Answers the DM. Fixes the order. Asks before spending your money.

**Body:**

> You get to your DMs at 11pm. Order #3102 already has a size swap waiting, checked
> against live stock. Shopkeeper wrote the reply — it just needs your yes.

**Buttons:** Start free trial · See Shopkeeper work

**Under the buttons:** Free for 14 days. You add a card when you pick a plan.

**Three-role strip:** Customer messages / Instagram, email, website chat · Your
approvals / iMessage · Order work / Shopify

**Notes.** The H1's third verb concedes the approval step in the headline. That is a
narrower promise than "Customer support that can actually fix the order," and it is
deliberate: restraint is what this buyer is shopping for. Dropping the third verb
restores the wider claim.

The body makes 11pm *your* hour rather than the customer's. That is what resolves
the page's three-timestamp problem without touching the video, and it puts the
stronger pitch first: the work is already done when you show up.

The strip's first cell gains website chat per decision 1. It renders one logo and
two lines of text (`integrationRoles` in `Hero.tsx`), so the Instagram mark stays
and only the name line grows. If three channels do not fit at 390px, shorten to
*Instagram, email, chat* rather than dropping one.

---

## Section 2 — The demo block

**Renders in:** `_components/Hero.tsx` (the `#demo` block) and `_components/HeroMedia.tsx`

**Kicker:** Example workflow · demo data

**H2:** One message. The order gets handled.

**Body:**

> The third step is the one that matters. Shopkeeper has the swap ready and stops
> anyway, because changing order #3102 is your call.

**Caption under the video:**

> Fictional customer, store, and order details. Once an order ships, a swap becomes an
> exchange rather than an edit. What Shopkeeper can do is still bounded by the rules you
> set.

**Also in this component:** change both `Today 4:12 PM` timestamps in `HeroMedia.tsx`
to `Today 2:14 AM`, so the video and Section 3's card agree on when Maya wrote.

**Notes.** The H2 is unchanged — six words, two ideas, no banned words, already
passing every rule. Replacing a working line to prove a rewrite happened is not an
improvement.

"The third step is the one that matters" rather than "Watch the third step," because
this block has a reduced-motion path that shows a static frame. "Watch" instructs some
visitors to do something they cannot.

The caption now states the real boundary instead of gesturing at it. The registry
settles it: `edit_shopify_order` is "for while the order has not shipped yet",
`create_exchange` handles the same request after shipping and only when the
replacement costs the same or less, and anything costing more escalates. So a shipped
order is not a wall — the mechanism changes. Refunds have a different limit again
(`create_refund` is full-order-only; partial refunds escalate), which is why the third
sentence stays general rather than trying to carry both.

---

## Section 3 — The workflow

**Renders in:** `_components/ProductOverview.tsx`, `CoreProductOverview`, `#workflow`

**Label:** one request, start to finish

**H2:** A customer asks. The order actually changes.

**Body:**

> You're asleep. Shopkeeper reads the DM, opens order #3102, and gets the swap ready.
> Then it waits for you.

**Dark card:** Demo data · Instagram · 2:14 AM

> "Can you swap my linen jumpsuit from M to S before it ships? Order #3102."

**Dark card footer:** Fictional store and customer. Real product workflow.

**Right card header:** Swap Medium → Small / DM → your yes → Shopify updated

**The four steps:**

| # | Title | Body |
|---|---|---|
| 01 | Reads it | Opens order #3102, checks it hasn't shipped, counts the Small in stock. |
| 02 | Gets it ready | Builds the swap in Shopify and writes out exactly what changes. |
| 03 | Texts you | Stops there. Changing order #3102 needs your yes first. |
| 04 | Does it | Updates Shopify, replies to Maya, keeps a record you can check. |

**Notes.** *Reads it / Gets it ready / Texts you / Does it* is how you would describe an
employee to a friend. *Understand / Prepare / Ask / Finish* is how you would label a
flowchart. This buyer is deciding whether to trust a worker. The four titles carry the
whole pitch if someone scans and reads nothing else, which is what this buyer will do.

The body earns the 2:14 AM already printed on the card. Without it that timestamp is
decoration.

"Hasn't shipped" replaces "unfulfilled" — a small, knowing scope trade. In Shopify
those are not identical (a partially fulfilled order is cleanly neither), but for a
same-price swap on one item the distinction almost never bites, and "unfulfilled" is a
word that makes a non-technical merchant feel talked past.

---

## Section 4 — Operations

**Renders in:** `_components/ProductOverview.tsx`, `#operations`

**Label:** shopify work, not just answers

**Title:** It doesn't just reply. It changes the order.

**Body:**

> You've written that apology before. Shopkeeper can issue the refund on order #3102
> instead, then update Shopify. It asks you before it does.

**The three groups:**

**Fix the order**
- "Where's my order?"
- "I typed the wrong address"
- "Can I swap the size?"

**When it goes wrong**
- "I want a refund"
- "I need to return this"
- "Store credit or a return label?"

**Close it out**
- Update their details
- Add a note on the order
- Mark it fulfilled and send the reply

**Link:** See everything it can do to an order → `/product/order-operations`

**Notes.** The first two groups are in the customer's voice. "Address correction" is
something a support tool has; "I typed the wrong address" is something a merchant read
in a DM last Tuesday. A merchant scanning this recognises their own inbox instead of
evaluating a feature matrix.

The third group stays in plain statements because nobody's customer says "add a note
on the order." Mixing registers there would be cute rather than clear.

The body names the fear directly. This buyer's hesitation is not "can it write" — it
is "will it give my money away." Saying *refund* and *it asks you first* in consecutive
sentences is the fastest route to that argument, and it hands off to Section 5.

An earlier draft opened "Most support tools can only write an apology." Cut: it is an
assertion about products nobody has checked, and this buyer's real alternative is doing
nothing. "You've written that apology before" makes the same point about their own life.

They are not the complete set, so the link keeps its hedge. `tools/registry/order.ts`
and `customer.ts` carry roughly twice as many order-facing tools as the nine listed
here — returns, exchanges, gift cards, return labels, cancellations, order editing,
fulfilment, customer detail updates. Nine is the right number for a scannable section;
"The complete list" would be false, and the link is what carries the rest.

---

## Section 5 — Controls

**Renders in:** `_components/ProductOverview.tsx`, `#controls`

**Label:** control without babysitting

**Title:** It knows when to answer, when to ask, and when to stop.

**Body:**

> You tell it once where your line is. A tracking question and a $180 refund are not
> the same thing, and it knows that.

**The three cards:**

| Eyebrow | Heading | Body |
|---|---|---|
| Routine and safe | Handles it | Answers the easy ones itself, if that's the trust level you set. |
| Money, or a change to the order | Checks with you | Refunds, cancellations, address changes. One text, with the facts already in it. |
| Outside your rules | Won't go near it | Past your cap it stops and hands you the thread. No guessing. |

**Under the cards:**

> There's also a mode where it can't send anything at all. Draft only writes the reply
> and leaves it to you.

**Link:** See approval modes and limits → `/product/approvals-and-controls`

**Notes.** The title is unchanged. It names the exact three cases the cards then take
one at a time, so title and cards lock together — and this section's whole job is
precision about boundaries.

*Handles it / Checks with you / Won't go near it* is the same verb-first pattern as
Section 3's four steps, so the two sections rhyme instead of each inventing a voice.

"Trust level" is the app's own words, verified: `AgentAutonomySection` renders
`label="Trust level"`, and the sidebar describes the page as "Store identity, trust
level, and voice". Nothing to change here, and a later consistency pass should not
"simplify" it into something the settings screen does not say.

$180 and $50 are invented and carry no claim — they exist to make a cap feel like a
real number, and $180 roughly matches the linen jumpsuit already in the story. Swap
them for whatever real merchants' numbers look like.

Draft-only is now promoted out of the accordion, because a mode where the product is
structurally incapable of acting is the single most reassuring fact on this page. It
sits under the cards rather than becoming a fourth one: the three cards are the three
cases the title names, and a fourth breaks both that lock and the grid. *Draft only* is
capitalised as the app labels it (`autonomy-tiers.ts`), like the tier names in FAQ Q1.

---

## Section 6 — The four places

**Renders in:** `_components/ProductOverview.tsx`, `#system`

**Label:** one system, four places

**Title:** Your customers get a reply. You get a text.

**Body:**

> Maya messages you on Instagram. You get one text on iMessage. Shopify gets the
> update. You never have to open the dashboard to do it.

**The four cards:**

| # | Title | Body |
|---|---|---|
| 01 | Where customers write | Instagram, email, and chat on your store |
| 02 | Shopkeeper | Reads the order and gets the work ready |
| 03 | Where you decide | iMessage, or the dashboard if you'd rather |
| 04 | Shopify | Does the work and reports back |

**Strip:**

> The dashboard is still there for setup, for reviewing what happened, and for taking
> over by hand.

**Link:** See what each connection does → `/product/integrations`

**Notes.** The body is four short sentences walking the four cards in order — the
paragraph *is* the diagram, so a merchant who reads the sentence has understood the
picture before their eyes reach it.

"Four surfaces" was the section's own name and could not survive rule 2. The planning
docs can keep saying surfaces; the page cannot.

Card 02 quietly drops a claim on purpose. "Understands context and prepares the right
action" asserts the action is correct. "Reads the order and gets the work ready" does
not. A card that has already announced it is right argues against the section that
follows it.

Card 01 gains website chat per decision 1. The body still opens on Instagram because
the page is telling one story and Maya messages on Instagram; the card is the complete
list, the sentence is the instance.

---

## Section 7 — Grounding

**Renders in:** `_components/ProductOverview.tsx`, `#context`

**Label:** answers grounded in the store

**Title:** It reads the order before it answers.

**Body:**

> Order #3102 is paid and hasn't shipped. There are 12 Small in stock. Shopkeeper knew
> all of that before it wrote to Maya. When it can't find the answer, it asks you
> instead of inventing one.

**Left card — What it reads:** The order · This customer's past messages · Products ·
Stock · Your policies · About your store · Your approved voice

**Left card footer:** A first-time customer has no history. It says so rather than
guessing.

**Right card — What it knew before replying to Maya:**
- Order #3102 / Paid · Unfulfilled
- Small / Sand / 12 in stock
- Store policy / Same-price swap allowed

**Link:** See how a reply gets grounded → `/product/customer-support`

**Notes.** The body narrates the exact three tiles beside it, so the card becomes the
receipt rather than a decoration. It then closes on the thing this section exists to
settle: not "will it look things up" but "what happens when it doesn't know."

"Unfulfilled" stays in the right-hand tile deliberately, even though Section 3 says
"hasn't shipped." That tile renders Shopify's own status badge — it is data, and it
should read the way it reads in Shopify. A consistency pass should not merge them.

"The response comes from context, not vibes" is gone, and it was the only joke on the
page. The line is built on a banned word and cannot be saved. Restoring it is a
deliberate exception to rule 2, not something to slip back in.

The old "available history" hedge covered a real limit: a first-time customer has no
history. "This customer's past messages" does not promise there are any, but it does
not state the limit plainly either, so the limit is now printed on the card. It goes
under the chips rather than into the body so the body still closes on the question this
section exists to settle — not "will it look things up" but "what happens when it
doesn't know."

"About your store" replaces "Your instructions" for the same reason Section 9 changed:
that chip stands for `aiContext`, and *About your store* is what the settings screen
labels it. Both chips must move together or the two sections name one field two ways.

---

## Section 8 — The morning briefing

**Renders in:** `_components/ProductOverview.tsx`, `ProactiveOperations`, `#proactive`

**This section changes shape, not just wording.** It currently renders one `PaperCard`
with an *Optional* badge and no handoff, between two much larger sections. The
positioning calls the briefing the magic moment; the page files it as a footnote. It
gets a real slot, built like Section 3: a message on the left, the opt-ins on the
right.

**Label:** while you were asleep

**Title:** You wake up already caught up.

**Body:**

> At 7am, one text. It tells you what it handled while you were asleep, and what still
> needs you.

**The message card** — a text bubble, not a feature card:

**Card header:** Morning briefing · iMessage · 7:00 AM

> Since your last briefing I handled three things, including one refund and one reply:
> - Swapped #3102 from Medium to Small for Maya Chen
> - Refunded #3098, damaged in transit
>
> Two of those ran without needing you.
>
> One action is waiting for your approval.
>
> Priya wants to change the address on #3107 before it ships.
>
> Should I go ahead?

**Card footer:** Fictional store and customer. Real briefing wording.

**The two tiles beside it:**

| Heading | Badge | Body |
|---|---|---|
| Morning briefing | *Optional* | Off until you turn it on. One text, once a day. |
| Sales and stock | *Optional* | Add yesterday's sales and a low-stock line on top of it. |

**No handoff link.** Every other section hands off to a `/product/*` page; there is no
briefing page to hand off to. Do not invent a link target, and do not borrow
`/product/customer-support` — Section 7 already owns it.

**Notes.** This is a product whose best feature is a text message, and the page has
never shown one. The card is not a paraphrase: every line is the shape the gateway
actually emits. The lead sentence is `handled-section.ts` composing its rollup, down to
"Since your last briefing" — which is the wording that scopes the report to the digest
cursor rather than to current-state counts. "Two of those ran without needing you." is
the same file's auto-count line. "One action is waiting for your approval." and "Should
I go ahead?" are `needs-you.ts`, the second being the exact string the approval-only
branch returns. Copy-editing these into something smoother replaces the product's voice
with a marketing impression of it, which is the whole reason the section was weak
before.

**The card's arithmetic has to hold, because the real composer's does.** Three things,
of which the detail names one refund and one reply — the third is Maya's swap, which is
neither, and the bulleted lines are capped at two. One of the three needed you (the
swap, approved in the hero), so two ran without you. Change any number here and change
the others with it; a briefing whose counts do not add up is worse than a generic one,
because a merchant checks a report.

**The briefing is where Maya's story pays off.** She appears here as *handled* — the
swap you approved in the hero comes back as a line in the morning report the following
day, and the counts agree with it: three things, one of which needed you, so two ran
without you. The page's clock now reads straight through — Maya writes at 2:14 AM, you
get to your DMs at 11pm and say yes, and the 7am briefing reports it done.
That is the same request seen a fifth time, and it is why the second name in the card
is not a violation of the one-customer rule. Priya is a second *item*, not a second
telling; a briefing with one line in it is not a briefing.

**Do not add a fourth kind of line.** The card reports support work, a refund, and an
approval — all things the briefing genuinely carries. Nothing like "two orders look
risky": order monitoring is flag-gated and notify-only, and a demo briefing that
reports it would restore a claim the rest of the page does not make.

"Surface follow-up work" was legal under rule 2 (the ban is on the noun) and was
changed anyway, being the same register the ban exists to remove.

## Section 9 — Onboarding

**Renders in:** `_components/Onboarding.tsx`

**Label:** day one

**H2:** From install to live *in minutes.*

**Step 1 — Connect Shopify:** It reads your store on its own — every product, your
refund policy, every past order.

**Step 2 — Pick your channels:** Instagram, email, and chat on your store so customers
reach it. iMessage so it can reach you.

**Sync tiles:** Products · Policies · Orders · FAQ · About your store

**Channel tiles:** Instagram · Email · Website chat · iMessage

**Notes.** Step 2's parallel — *so customers reach it / so it can reach you* — is the
distinction Section 6 spends a whole diagram establishing, compressed into eleven words
at the moment the merchant is deciding whether setup will be confusing. It also answers
the question the channel tiles raise on their own: no, your customer does not text you
on iMessage.

Step 1 names the refund policy specifically. A merchant who has written one knows
exactly how much work they are not redoing.

"About your store" replaces "Custom instructions." The app has no control by that
name — the configure screen's fields are Business name, About your store, Brand voice,
and Merchant preferences — so the old tile named something that does not exist and the
drafted "Your own rules" would have invented a second name for it. Section 7's chip
carries the same change.

The website chat tile stays, per decision 1. Step 2's sentence now names three
customer-side channels, which is one more than it can comfortably carry; if it reads
long at 390px, drop "on your store" rather than a channel.

**The screen-reader text is copy too.** Both `aria-label` strings enumerate the tiles by
name. If the tile labels change, those strings change with them, or a screen-reader user
gets the old vocabulary. Easy to miss because it is not visible.

---

## Section 10 — Trust

**Renders in:** `_components/ProductOverview.tsx`, `TrustSection`, `#trust`

**Label:** trust and data handling

**Title:** Your data stays yours. Even if you leave.

**Body:**

> Your Shopify login is encrypted before it's stored. Your customers' addresses never
> touch another merchant's account. You can download all of it.

**The four facts:**

| Heading | Body |
|---|---|
| Nobody else sees it | Another store using Shopkeeper can't see your customers or your orders. |
| Your logins are encrypted | Your Shopify and Instagram logins are encrypted before they're stored. |
| Every action is on the record | What it proposed, what you approved, and what happened. All still readable. |
| Download it all | Store and customer data downloads as JSON. Action history downloads as CSV. |

**Footer:** The full details are in the Privacy Policy.

**Link:** See the security model → `/product/security`

**Notes.** The old title was a sentence about the page's own layout. The new one tells
the merchant something about their own position, and "even if you leave" answers the
question a solo merchant will not ask out loud before handing over their customer list.

Fact 1 is deliberately more falsifiable than "access is scoped to the organization."
Same claim, but now a flat promise a person will hold you to and a security researcher
will test. That is the right trade for this audience — as long as it is a promise you
are comfortable seeing quoted back.

"Public" is dropped from the Privacy Policy line. "Read the public Privacy Policy"
implies there is a private one.

"Store" replaces "workspace" throughout, per decision 3. This is the one place the site
deliberately does not match the app: there is a `/create-workspace` route, a Workspace
settings tab, and a "Switching workspace…" state, and all of them keep that word until
the app is renamed. A merchant thinks in stores, and the mismatch is a signed-in
problem rather than a first-visit one.

---

## Section 11 — Pricing

**Renders in:** `_components/Pricing.tsx`

**This section is rewritten, not edited.** Decision 2 removed its premise. Every
earlier draft sorted merchants by capability — drafts versus actions, press-send
versus delegate — and there is no capability difference to sell. `plan-limits.ts`:
the ladder sells volume and seats, and "nothing here gates a tool or a capability."

**Label:** what it costs

**H2:** Costs less than *a part-time hire.*

**Sub:**

> Two weeks free on either plan. Check the plan and total in checkout before you
> subscribe.

**Shared line, above both cards:**

> Both plans are the same product. Refunds, swaps, address fixes, approvals from your
> phone, your voice, your limits. The price is about how much you use it.

### Starter — $19/mo

**Description:** For one person answering their own messages.

- 500 customer conversations a month
- One seat

**CTA:** Start free trial

### Pro — $49/mo

**Badge:** Recommended

**Description:** For a store past 500 a month, or a second person on the inbox.

- No conversation limit
- Two seats

**CTA:** Try Pro free →

**Under both cards:**

> A conversation is one customer thread in a month, however long it runs. Your own
> messages to Shopkeeper don't count.

**Notes.** The shared line is the section. It is the sentence that stops this page
selling a gate that does not exist, and it is doing the work the two descriptions used
to do badly. Everything above Section 11 promises support that changes the order; the
shared line confirms that promise is included at $19 rather than quietly withdrawing
it. **The structural problem the previous draft could only soften is gone** — a
merchant who reads the hero, believes it, and picks the $19 plan now gets exactly what
they were shown.

The two bullets per card are deliberately thin. There is nothing else true to put
there, and padding them is how the page got here: `c558c788` removed exactly this
framing on 2026-08-19 and a later redesign restored it, so the live card today reads
"Everything in Starter / Shopify order actions and action history / Approvals through
iMessage." Restore that list and the page is lying again. `Pricing.tsx` carried a
comment saying so; the redesign dropped it. **Put it back with the rewrite.**

**Layout consequence.** Equal-height cards with two bullets each will leave a visible
gap below the shorter list — the same defect `c558c788`'s author noted at 1440. The
shared line above and the conversation definition below are what fill the section; do
not fill it by inventing bullets.

**The numbers are real but not yet enforced.** `PLAN_LIMITS` is `starter: 500
conversations, 1 seat` and `pro: unlimited, 2 seats`, and the definition under the
cards is `countConversationsThisMonth` in plain English: threads opened in the UTC
month, with `sms_agent` and `dashboard_agent` excluded because operator surfaces are
the merchant talking to their own agent. But `PRICE_ID_STARTER` and `PRICE_ID_PRO` are
unprovisioned, so `resolvePlanTier` returns `unknown` for every org and both limits
fail open on purpose. The page will understate what a merchant gets, which is the safe
direction — but the numbers are not true *as limits* until those price IDs exist. That
is the first item under Follow-on work.

**Still open at the product level, not the copy level:** whether Starter belongs on
this page at all. It is now an honest volume tier rather than a mis-sold one, so the
question is commercial, not a correctness bug.

## Section 12 — FAQ

**Renders in:** `_components/FAQ.tsx`

**Label:** before you hire

**H2:** Things people ask *before they trust an AI.*

There is no FAQ structured data anywhere in the app, so the questions were free to
change. If JSON-LD is added later, generate it from these strings rather than
hand-writing a second copy that drifts.

**Q. Will it email a customer without me seeing it?**

> That's yours to set. On Draft only, never — it can't send anything at all. On Ask
> first, the default, routine replies can go out on their own. Order changes, money,
> and anything unusual wait for you. Trusted is opt-in, and only for simple replies.

**Q. Will it sound like me, or like a robot?**

> It learns from the edits you make to its drafts. After enough of them it proposes a
> new voice brief. Nothing changes until you read it and say yes.

**Q. If I leave, do I get my data?**

> Yes. Store and customer data downloads as JSON. Your action history downloads as CSV.

**Q. I don't use Shopify. What do I get?**

> It can still read your channels and reply using the rules you give it. But refunds,
> address changes, and exchanges need Shopify. Without it, there's no order to fix.

**Q. Where do my customers actually reach it?**

> On Instagram, Gmail, forwarded support email, or the chat on your store. You review
> and approve on iMessage, or in the dashboard.

**Q. What if it doesn't know the answer?**

> It asks you for the missing policy or the judgment call. If the action changes an
> order or moves money, it pauses for your approval. If it's outside your rules, it
> stops and hands you the thread. It never improvises.

**Q. Can another store see my customers?**

> No. Your customers and your orders are yours alone. Your Shopify and Instagram
> logins are encrypted before they're stored. You can download your data yourself.

**Notes.** The heading promises *things people ask before they trust an AI*. The old
questions were things a product marketer asks — "Which channels are supported today?"
is a spec heading, not a question. Every question here contains *me*, *my*, or *I*, so a
merchant skimming the left edge of the accordion hits their own anxiety four times
before deciding whether to open anything. FAQ questions are scanned, not read.

The answers barely changed. They were mostly fine once the banned words came out and
the 25- and 28-word sentences were broken up.

"I don't use Shopify. What do I get?" is the softened version, and it stays softened.
The first draft asked "Is this useless?", which sounds like a real person and is better
copy — and also puts the word *useless* on your own page in a font someone will
screenshot. Still available if you change your mind.

Q5 gained website chat per decision 1, and it is the third of the three places that had
to move together: this answer, Section 6's card 01, and Section 9's channel tiles. If
one of them ships without the others the page contradicts itself, which is the exact
state this document found it in.

FAQ Q1's three mode names — Draft only, Ask first, Trusted — are the app's own labels
from `autonomy-tiers.ts`, verified. So is "Ask first, the default". Leave them alone.

---

## Section 13 — The final CTA

**Renders in:** `_components/CTA.tsx`

**H2:** Hire it for two weeks and see.

**Sub:**

> Connect Shopify. Set your rules. Then go to bed — it'll have the reply ready when you
> wake up.

**Button:** Hire Shopkeeper — free for 14 days (`HIRE_CTA_LABEL` in `lib/brand.ts`)

**Notes.** "It'll have the reply ready when you wake up" is deliberately true in both
directions: routine replies have already gone out, and the ones needing a yes are
waiting with the facts attached. That is the honest description of both modes in one
clause, and it closes the page on the image the hero opened with.

The old sub's hedge — "keep *routine* support moving" — is covered rather than dropped,
because this line does not promise anything was sent.

**The alternative close, still not chosen:** "Give it two weeks. Fire it if it's bad."
It is the most distinctive line written across all thirteen sections and it completes
the metaphor the button starts. It was not chosen because it is the last sentence
before the only button that matters, and it works by planting the possibility that the
product is bad. Everything above it spends the page earning trust. Moving it to the
pricing card was considered and rejected too: Section 11 now has to explain a volume
ladder and a conversation count, and it does not need a second job. The line stays
written down and unused.
