# Landing Page Overhaul

**Status:** Defect 2 is closed. Defect 1 is fixed except for the film republish,
which needs the Blob token — see the checklist at the end of that section.
Defect 3 is open. Everything below the defects is proposed, not decided.
**Decision date:** 2026-08-20, from a side-by-side audit of
[zipchat.ai](https://www.zipchat.ai/) against the live `useshopkeeper.com`.
**Scope:** `apps/dashboard/src/app/(marketing)/` only. The dashboard paper theme
is a separate system and is not in scope.
**Delete this file when the ship-now defects are closed and the remaining items
have moved into [to-do-list.md](to-do-list.md) or been dropped.**

## Objective

The landing page does not currently show the product working. That is the whole
finding. Everything below either fixes something measurably broken or replaces
decoration with evidence.

The comparison was against zipchat.ai because it is the closest functional
competitor with a mature site — agentic AI sales/support for ecommerce, Shopify
app, overlapping channel list. The goal was never to copy its look. Its look is
generic SaaS: blue gradient, geometric sans, rounded cards. What it does better
is **information per screen**: every section shows the product doing a concrete,
nameable thing. Ours shows paper texture.

## Verified defects — ship these first

These are not opinions. Evidence is recorded so a future session does not
re-derive it.

### 1. The hero renders an empty box in production

Loaded `useshopkeeper.com` and waited 8+ seconds. The `<video>` element state,
read off the live page:

```
readyState: 0        videoWidth: 0      duration: null
paused: true         networkState: 2    rect height: 660px
```

The video never decoded a frame. It is not a network failure — the blob serves
`206` in 0.165s for a 200KB range request. It is **5,201,167 bytes** (from
`content-range: bytes 0-1/5201167`) with `preload="metadata"` and `autoPlay`.

The fallback is worse than the failure. `public/atmosphere/demo-poster.webp` is
3,336 bytes and is **a completely blank cream image** — opened and confirmed. So
there is no degraded state: the hero's centerpiece is a 660px empty rectangle
until a 5.2MB file finishes buffering.

Consequence, at 1512×804: the headline and subhead are visible on load, then the
empty box, and the primary CTA is **below the fold**. Reaching "Hire Shopkeeper
— free for 14 days" took four scroll ticks. Zipchat's CTA sits at y≈418 with a
trust row beneath it at y≈541, both visible on load.

The poster is also served `cache-control: public, max-age=0, must-revalidate`
— a static asset with caching disabled.

**Fixed 2026-08-20** (`Hero.tsx`, `next.config.js`, `demo-poster.webp`):

- The poster is now a real frame — t=13.7 of the film, the beat where the agent
  says what happened overnight and offers four options for approval. It is the
  one still that carries the whole product thesis. 41KB at q85, against the
  3KB blank it replaced.
- The CTA pair and the status line moved above the film, so both clear the fold
  at 1512×804 and at 390×844. The film now opens the section below them.
- `/atmosphere/:file*` gets `max-age=3600, stale-while-revalidate=86400`.

Verified in real Chrome against the local dev server: with the video still in
its exact failure state (`readyState: 0`, `videoWidth: 0`) the hero now shows
the product rather than an empty box. That is the proof — the symptom is gone
even when the video never loads.

**Still open, needs the Blob token.** Once the film *does* play it restarts from
its own opening, which is a near-blank cream title card for roughly the first
two seconds — so the hero briefly empties out again at the start of every
38.5-second loop. Confirmed in real Chrome by seeking to `t=0.3`. The poster
cannot fix this; only re-cutting the film can. Two changes, one publish:

1. **Trim the dead lead-in** so frame 0 is already meaningful. This is an edit
   decision on a designed artifact, so it is deliberately left to the author.
2. **Re-encode smaller.** 1440×1080 is oversized for an 880px-wide box.
   `scale=1200:900:flags=lanczos` at `-crf 26 -preset slow` gives **1.17MB from
   5.2MB — 78% off** with no visible loss (checked at t=13.7, text still crisp).

Then publish per [the demo-film recipe](../.claude/CLAUDE.md): upload with
`LANDING_BLOB_TOKEN`, and bump `?v=` on the `<video src>` in `Hero.tsx` so
returning browsers refetch — the blob is served `max-age=31536000` and
overwriting purges only Vercel's edge, not already-cached clients.

Longer term the strongest version is to delete the video entirely and make the
hero the live demo (item 5 below) — a film of the product is a weaker artifact
than the product.

### 2. The pricing page and FAQ claim things the code does not do

There is **no plan-limit enforcement anywhere in the repo**. Grepped
`apps/dashboard/src` and `packages` for `conversationLimit`,
`conversationsPerMonth`, `seatLimit`, `maxSeats` — zero matches. So:

| Surface | Claim | Reality |
| --- | --- | --- |
| `Pricing.tsx` Starter | "Up to 500 conversations/mo" | Not enforced |
| `Pricing.tsx` Pro | "2 team seats included" | Not enforced |
| `Pricing.tsx` Scale | "Unlimited conversations", "SLA + audit log", "Dedicated onboarding" | Unverified |
| `FAQ.tsx` | "full conversation history, customer notes, and tags export to CSV" | Only the agent action log has CSV export |
| `FAQ.tsx` | "reads your last 100 outgoing replies on connect" | Unverified |

CSV appears only in `api/agent/actions/route.ts` and
`lib/agent/api/action-log.ts` — the `AgentAction` audit trail, not conversations.

This matters more here than it would on most products. Product principle 3 is
"trust is binary — one bad refund undoes months of goodwill." A pricing page
that promises unbuilt limits is the same failure mode wearing a different hat.
Either build them or change the copy; do not ship the page as-is.

**Fixed 2026-08-20** (`46eb2db5` FAQ, `c558c788` Pricing). The suspicion above
was right: the full sweep found **eight** false claims, not five.

Beyond the table, and worse than it:

- **`FAQ.tsx` "refunds and cancellations still need your OK" was false in
  exactly the configuration the sentence describes.** At `trusted`/`broad`/
  `full` a `create_refund` under `maxRefundAmount` passes
  `checkStaticToolPolicy` and classifies as `auto_execute` with no human in the
  loop (`packages/agent/src/plan-preview.ts:290-317`), and `blockCancellations`
  defaults to `false`. This was a *safety* claim inverted against product
  principle 3 — the most serious thing on the page.
- **"reads your last 100 outgoing replies on connect" has no implementation.**
  Voice learning is `VoiceEdit`-driven and capped at `VOICE_SYNTHESIS_MAX_EDITS
  = 30` (`packages/db/voice.ts:22`); there is no on-connect backfill.
- **"No credit card" is false.** Checkout runs subscription mode without
  `payment_method_collection: 'if_required'`
  (`api/billing/checkout/route.ts`), so a card is collected. `14 days free` is
  real — `trial_period_days: 14`.
- **"Custom AI instructions per channel" does not exist.** `aiContext` and
  `defaultInstruction` are org-wide.
- **"SLA"** has no defined terms anywhere.

The root cause under most of them: **there is no plan-based feature gating in
the repo at all.** Every feature the page reserved for $49 and $129 already
ships to $19. Decision 2026-08-20 was to say what is true now and build
enforcement later, so the tier lists were rewritten around the one thing that
actually differs — support level — with volume as guidance in the tier
descriptions rather than an enforced cap. The enforcement build is filed under
Build in [to-do-list.md](to-do-list.md); when it lands the numbers can return.

Verified: typecheck and lint clean, screenshots at 1440 and 390 against a
worktree dev server. One cosmetic residue, deliberately not papered over —
desktop cards are equal-height, so the now-shorter Pro and Scale lists leave a
gap above their CTAs. Mobile stacks fine. Filling it means writing new support
promises, which is the author's call, not a copy fix.

### 3. Placeholder photography is live

Three atmosphere images are marked placeholder in source comments and are
serving in production: `hero-light.jpg` (Hero), `integrations-leaves.jpg`
(Integrations), `footer-dawn.jpg` (Footer). Each carries a "swap … for the final
shot" comment.

## The aesthetic decision: keep the paper, invert the ratio

The question asked was whether to move past the paper aesthetic. The answer is
no — but it has to stop being the entire page.

The aesthetic is genuinely distinctive and does real work for the "employee, not
chatbot" positioning. The problem is proportion. Scrolling the live site at
1512×804, **multiple consecutive full viewports were entirely blank cream.** The
texture is not competing with a competitor's design; it is competing with our
own evidence.

Target ratio is roughly 20% texture / 80% product, from about 90/10 today. Keep
the warm ground as the *desk*; put sharp, high-contrast product surfaces *on*
it. That contrast is what reads as distinctive **and** professional. Paper all
the way down reads as neither.

Specific calls:

- **Move display type off the marker face.** `--m-hand` resolves to
  `var(--font-just-another-hand)` — a condensed marker face — and it is
  currently set on every H1 and H2 at up to 68px, plus the pricing figures and
  the footer wordmark. At display sizes it reads craft-fair, not
  software-I-trust-with-refunds. The Poke reference in memory is *cream/serif*;
  the implementation is cream/marker, a much more casual register. Add a real
  display serif token (`--m-serif` is currently just Georgia, a fallback, not a
  chosen face) and move H1/H2 onto it. Keep `--m-hand` and `--m-caveat` for
  annotations, margin notes, and the timeline stamps — where they are charming.
- **Kill `opacity-30` on inactive feature copy** (`Features.tsx`). Grey-on-grey
  over crumpled texture is unreadable; step 02 was illegible while 01 was active.
- **Stop putting texture behind everything.** Reserve it for section grounds,
  not behind product surfaces.
- **Raise the section labels.** "everywhere you are" / "every morning" are tiny
  handwriting and effectively invisible at real viewing distance.
- **Keep:** the cream/ink palette, the desk metaphor, the wax seal on the final
  CTA, the tape and margin-thread details, the annotation voice.

## Work items

Grouped by kind of action, not by filing order — matching the to-do-list
convention.

### Ship now

1. **Hero fix** — poster, CTA placement, and caching are done. What remains is
   the film trim + re-encode + republish, which needs the Blob token. Defect 1.
2. ~~**Claims audit**~~ — done 2026-08-20, `46eb2db5` + `c558c788`. Eight false
   claims found and fixed; plan-limit enforcement filed under Build in
   [to-do-list.md](to-do-list.md). Defect 2.
3. **Replace or accept the placeholder photography.** Defect 3.
4. **Nav** — **mostly a false alarm; verified 2026-08-20.** Pricing *is*
   reachable, at `NavLinks.tsx:29` under the Resources dropdown, and signed-out
   visitors *do* get a persistent "Sign up free" CTA
   (`AuthNavLinks.tsx:88`) — the auth avatar only replaces it once you are
   signed in, which is the right behavior. The only real residue is that
   Pricing sits one hover deep rather than top-level. That is a judgment call
   about nav weight, not a defect.

### Build — new surfaces

5. **A live, drivable demo.** The single biggest gap. Zipchat has a chat widget
   you can talk to on the homepage; we should go further, because we have
   something they structurally cannot copy: **let visitors text the real agent.**
   A Telegram deep link or a number on the page, seeded against a sandbox store.
   They text from their own phone and get a real reply in seconds. That is the
   flagship experience, unfakeable, and unavailable to any website-widget
   competitor. The three chat demos we ship today are pre-scripted — canned
   demos read as marketing, a live one reads as product.
   Needs: rate limiting, a sandbox org, and a spend ceiling. The daily LLM spend
   cap already exists in Postgres (`llm_daily_spend`) and is shared across both
   apps, so the cost tail is bounded by something that already works.

6. **A capability grid generated from the real tool registry.** Zipchat's
   strongest functional section is a capability grid — Order Tracking, Refund
   Processing, Size & Fit, Discount Codes — each tagged pre-sale/post-sale with
   a "See in action" link, plus "Check our 80+ library." We ship three abstract
   features. We already have `TOOL_LABELS` and `TOOL_CATEGORIES` in
   `packages/agent/src/tools/registry/`. Generate the grid from it and the list
   is provably complete and permanently current — that is a differentiator, not
   parity.
   Watch the client-boundary landmine: the registry is in the client bundle, so
   a `@shopkeeper/db` import in that path breaks `next build`.

7. **An interactive autonomy configurator.** Our most differentiated feature,
   currently buried in one static panel. Make it live: a slider across
   watch → guarded → trusted → broad → full plus a refund-cap input, and as the
   visitor drags, show exactly which actions the agent takes alone versus asks
   about — driven by the real policy rules. It sells "bias toward escalation" by
   letting a merchant *feel* the control. Zipchat has no equivalent because it
   has no tiers.

8. **An ROI calculator.** Zipchat has one. `Pricing.tsx` already makes the claim
   — "Costs less than a part-time hire" — without ever showing the arithmetic.
   DMs/day → hours/week → versus an $18/hr VA → versus $49.

9. **A proof layer.** Our biggest credibility gap. Zipchat's hero carries GDPR
   and AI Act compliance plus 4.8 across Shopify, G2, Capterra, and Software
   Advice, and a full "in numbers" section with named customers (€100k+
   Tropicfeel, $1m+ Burger Motorsport, 10x Shelly). We have **zero proof of any
   kind** — no logos, no numbers, no badges, no security statement.
   Honest options that need no customers: a Shopify App Store listing and badge
   (see item 11), and a security strip — "Encrypted at rest · Isolated per
   store · You approve every action · Export anytime" — every clause of which
   the codebase actually backs. If there are no customers yet, the honest
   version is a founder's note, not invented statistics.

### Content and acquisition

10. **Comparison pages.** Zipchat runs alternative pages for Zendesk, Gorgias,
    Intercom, Tidio, Freshdesk, Shopify Inbox, and ManyChat. That is an
    intent-driven organic engine and we have none of it. Our angle is sharp:
    Gorgias is a helpdesk you staff, Shopkeeper is an employee you supervise
    from your phone. Start with Gorgias and Shopify Inbox.

11. **Shopify App Store listing and badge.** Zipchat's footer carries one. This
    is a primary acquisition channel for Shopify merchants and we appear to be
    missing it entirely. Confirm whether a listing exists before treating this
    as new work.

12. **A public changelog.** Zipchat puts three dated entries on the homepage
    with "See all updates." For a solo-founder product this punches above its
    weight — it proves the thing is alive and shipping. The real changelog is
    already in git history.

13. **A footer sitemap.** Ours is three links (Privacy, Terms, Contact) and a
    giant wordmark. Zipchat's is five columns and carries most of its internal
    linking. Items 10–12 need somewhere to live.

### Structure

14. **Restructure around the merchant's day.** Current order is Hero →
    Integrations (briefing) → Channels (timeline) → Features → Pricing → FAQ →
    CTA. The briefing, the channels timeline, and feature 01 are three tellings
    of the same "day in the life" story. Collapse to one spine:
    night (it works) → morning (briefing) → the judgment call (it asks you) →
    your control (item 7) → what it can do (item 6) → proof (item 9) → price.

15. **Fix the scroll economics.** `Features.tsx` is three steps at
    `min-h-[74vh]` with a sticky phone stage — that is what produced the blank
    viewports. Halve the section height, or replace the scroll-driven stage with
    the live demo from item 5.

## Guardrails

**Do not copy zipchat's channel grid.** It lists Website chat, WhatsApp, Email,
Instagram, Messenger, and agentic search. WhatsApp is deliberately not built
(decision 2026-08-07, `.claude/CLAUDE.md` and `product-truth.md` §2): it is a
merchant-control channel, not a customer-origin one, so it adds a third way for
the merchant to reach the agent and no new way for customers to reach the
merchant — and it is weak in the US market. Messenger is not built either. Any
channel section must reflect what we actually run: email (Postmark + Gmail),
Instagram DM, storefront chat, Shopify, with Telegram and iMessage as the
operator side.

**Do not present order-ops as shipped.** It is code-complete but
monitoring-only behind `ORDER_RISK_MONITOR_ENABLED`, flag-and-notify with no
autonomy tiers. The hero's current subline — "Live today for support — order
ops, inventory & suppliers on the way" — is correctly hedged. Keep it that way.

**None of this touches the agent path**, so the eval gate is not implicated by
any item here. If an item later reaches into `packages/agent/`, it inherits the
normal gate rules.

## Open questions

- **Is there a Shopify App Store listing?** Item 11 is either a badge or a
  months-long submission, and the difference decides its position in the order.
- **Are there any real customers or design partners yet?** Item 9's honest form
  depends entirely on the answer.
- **Mobile is unaudited.** Everything above was evaluated at 1512×804 desktop
  only. The target user is a solo merchant and the product is phone-first, so
  this is not a footnote — it needs its own pass before any of the structural
  work is called done.
