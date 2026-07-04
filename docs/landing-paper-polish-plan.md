# Landing page paper-polish plan

Extend the crumpled-paper / desk-stationery language across the marketing landing page. Several sections still speak generic-SaaS (flat pills, glyph checkmarks, straight rule lines, frosted-glass buttons) while sitting on the paper backdrop.

**Status:** Phases 1–2 shipped. Phase 3 not started.

**Last reviewed:** 2026-07-04

## Ground rules

- One change at a time, screenshot-judged before moving to the next (both breakpoints; check signed-in navbar state where relevant).
- Restraint over scrapbook clutter — the reference aesthetic (poke.com) is warm and quiet. Any single motif appears at most once or twice on the page.
- All work is in `apps/dashboard/src/app/(marketing)/` and `apps/dashboard/src/app/styles/marketing.css`. Reuse existing tokens (`--m-ink`, `--m-quill`, `--m-caveat`) and existing techniques (the `stroke-dashoffset` draw-on already used for the Channels timeline path).

## Phase 1 — ink, not chrome (highest payoff) — DONE

1. **Hand-drawn underlines/circles on headline italics.** ✅ `HandUnderline.tsx` — rough SVG pen-stroke, draws on via `stroke-dashoffset` on scroll-into-view, inherits the phrase color via `currentColor`. Applied to **one** headline (Channels "wherever you already are."). Kept to a single instance on purpose: the restraint rule caps this motif at once/twice, and it's the only major section headline whose `em` stays single-line at every breakpoint — the others (Pricing "a part-time hire.", FAQ "before they trust an AI.", Integrations "not a backlog.", Hero "doesn't need a desk.") wrap, and an `inline-block` underline can't break mid-phrase. Features' ems are single-line but are a set of three (underlining one looks arbitrary). If a second instance is ever wanted, the component supports it — pick a single-line phrase.
2. **Handwritten checkmarks.** ✅ `InkCheck.tsx` — two-stroke scribbled ink check, `currentColor` so it's ink on light cards and cream on the dark Pro card. Swapped into `Features.tsx` bullets and `Pricing.tsx` rows (dropped the circle backing).
3. **Section dividers.** ✅ `HandDivider.tsx` — short, faint, hand-ruled pen tick. Replaced the flat `border-t border-stone-900/10` at every section boundary (Integrations, Channels, Features, Pricing, FAQ, Footer); dividers are rendered in `page.tsx` between sections so the seam sits where the old hairline was. (FAQ's internal accordion rule was left as-is — it's not a section boundary.)

## Phase 2 — stationery objects — DONE

4. **"Most picked" as a rubber stamp.** ✅ `Pricing.tsx` — the Pro badge is now an angled ink-stamp oval (`-8°`), lifted out of the header row and absolutely positioned overlapping the card's top-right corner. Ink is a **muted oxblood red** (`#b0472f`), not cream: because the oval straddles the corner, ~half of it sits on the light crumpled-paper background where cream had no contrast and read as an invisible deboss — red reads on both the dark card and the light paper, and is the actual rubber-stamp convention. Distress via a new `.m-stamp` class in `marketing.css`: a tiled turbulence `mask-image` nibbles the ring/lettering with fine, sparse holes (kept light — an earlier heavier erosion destroyed legibility).
5. **Pricing cards as index cards.** ✅ `Pricing.tsx` — sub-degree alternating tilt on all three cards (`-0.7°` / `+0.5°` / `-0.7°`), plus a translucent washi-tape strip straddling the top edge of the two **light** outer cards (`mix-blend-multiply` tan, mirrored corners). The dark Pro card keeps the stamp as its object — `mix-blend-multiply` tape wouldn't register on it, and one object per card avoids clutter. Torn-receipt price block was skipped (restraint; the stamp + tape already carry the section).
6. **Hero badge as a paper tag/sticker.** ✅ `Hero.tsx` — the frosted "New · Apple Messages" pill is now a warm-paper sticker: `rounded-lg`, `-2.2°` tilt, hard offset shadow (`3px 3px 0`), un-tilts slightly on hover. Note the `rise()` entrance animates `transform`, so the tilt lives on an inner `<a>` and `rise()` stays on an outer wrapper (otherwise `m-rise`'s `to { transform: none }` flattens it).
7. **One sticky note.** ✅ `CTA.tsx` — a single butter-yellow Post-it ("gone to bed — Shopkeeper's got it 🌙", Caveat, `+5°`, soft shadow) stuck on the dark CTA card's top-right corner. Placed here (not the hero) because it pays off the card's "your customers will never know you slept" line.
8. **Footer signature.** ✅ `Footer.tsx` — a Caveat "— your shopkeeper" sign-off, quill color, right-aligned and slightly tilted, sits just above the giant wordmark so the logo reads as the signature's flourish.

All five were screenshot-judged at desktop (1440) and mobile (390); the sticky note and index cards were checked on both. The hero sticker must be judged from a **viewport** screenshot, not an element screenshot of the hero section — the `sticky` navbar overlaps a section-scoped shot and hides the badge (screenshot artifact, not a real overlap).

## Phase 3 — texture & motion

9. **Postage-stamp perforated edges** on the channel logo chips in `Channels.tsx` — they're already dashed-border "stamps"; real perforation (radial-gradient punched holes) finishes the thought.
10. **Papers "settling" on reveal.** For tilted cards, animate from flat to final ±1° tilt in the `Reveal` motion so notes read as being laid on the desk. Respect `prefers-reduced-motion` like the existing animations.
11. **Coffee-ring stain or pencil margin doodle**, extremely faint, `aria-hidden`, in one section corner. Highest kitsch risk — one instance max, cut it if it doesn't survive the screenshot check.

## Flagged, not scheduled

- **Liquid-glass buttons** (`m-glass-btn*` in `marketing.css`) are the one element from a different material world — frosted iOS glass on paper. The navbar already converted to a cardstock pill; buttons could follow (near-opaque warm paper, letterpress inset shadow on press). The dark primary mostly reads as ink already; it's the frost/backdrop-blur on secondary/outline variants that reads glassy. Decide after Phases 1–2 land.
- **Briefing-section leaves wash** (`/atmosphere/integrations-leaves.jpg`, marked placeholder in `Integrations.tsx`): at 1440px it reads as a murky grey smear rather than leaf shadows. Fix belongs to the final-photography swap — pick dappled light with more contrast or lighten the overlay.
