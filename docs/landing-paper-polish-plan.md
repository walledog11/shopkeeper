# Landing page paper-polish plan

Extend the crumpled-paper / desk-stationery language across the marketing landing page. Several sections still speak generic-SaaS (flat pills, glyph checkmarks, straight rule lines, frosted-glass buttons) while sitting on the paper backdrop.

**Status:** not started.

**Last reviewed:** 2026-07-04

## Ground rules

- One change at a time, screenshot-judged before moving to the next (both breakpoints; check signed-in navbar state where relevant).
- Restraint over scrapbook clutter — the reference aesthetic (poke.com) is warm and quiet. Any single motif appears at most once or twice on the page.
- All work is in `apps/dashboard/src/app/(marketing)/` and `apps/dashboard/src/app/styles/marketing.css`. Reuse existing tokens (`--m-ink`, `--m-quill`, `--m-caveat`) and existing techniques (the `stroke-dashoffset` draw-on already used for the Channels timeline path).

## Phase 1 — ink, not chrome (highest payoff)

1. **Hand-drawn underlines/circles on headline italics.** Every section headline has an `em` phrase in quill color ("while you sleep.", "a part-time hire."). Add a rough SVG pen-stroke underline (or circled word), drawn on with `stroke-dashoffset` when scrolled into view — same technique as the timeline path in `Channels.tsx`. Start with one headline, judge, then roll out.
2. **Handwritten checkmarks.** Feature bullets (`Features.tsx`) and pricing rows (`Pricing.tsx`) use a dark circle + `✓` glyph. Replace with a small inline-SVG scribbled ink check.
3. **Section dividers.** Replace the flat `border-t border-stone-900/10` between sections with either a wobbly hand-ruled SVG line (the "— how it works —" divider is the existing good example) or no line at all.

## Phase 2 — stationery objects

4. **"Most picked" as a rubber stamp.** The Pro-card badge (`Pricing.tsx`) becomes an angled, slightly distressed ink-stamp oval (~-8°, overlapping the card edge) instead of a pill.
5. **Pricing cards as index cards.** Alternate ±0.5–1° rotation (matching the Channels note cards) plus a washi-tape strip pseudo-element on one corner. Optional: torn-receipt treatment for the price block to play into "costs less than a part-time hire."
6. **Hero "New · Apple Messages" badge as a paper tag/sticker** — small tilt, hard shadow — instead of the current pill (`Hero.tsx`).
7. **One sticky note.** A single handwritten Post-it near the CTA or hero (e.g. "gone to bed — Shopkeeper's got it 🌙"). One, not several.
8. **Footer signature.** A Caveat "— your shopkeeper" sign-off near the giant footer wordmark.

## Phase 3 — texture & motion

9. **Postage-stamp perforated edges** on the channel logo chips in `Channels.tsx` — they're already dashed-border "stamps"; real perforation (radial-gradient punched holes) finishes the thought.
10. **Papers "settling" on reveal.** For tilted cards, animate from flat to final ±1° tilt in the `Reveal` motion so notes read as being laid on the desk. Respect `prefers-reduced-motion` like the existing animations.
11. **Coffee-ring stain or pencil margin doodle**, extremely faint, `aria-hidden`, in one section corner. Highest kitsch risk — one instance max, cut it if it doesn't survive the screenshot check.

## Flagged, not scheduled

- **Liquid-glass buttons** (`m-glass-btn*` in `marketing.css`) are the one element from a different material world — frosted iOS glass on paper. The navbar already converted to a cardstock pill; buttons could follow (near-opaque warm paper, letterpress inset shadow on press). The dark primary mostly reads as ink already; it's the frost/backdrop-blur on secondary/outline variants that reads glassy. Decide after Phases 1–2 land.
- **Briefing-section leaves wash** (`/atmosphere/integrations-leaves.jpg`, marked placeholder in `Integrations.tsx`): at 1440px it reads as a murky grey smear rather than leaf shadows. Fix belongs to the final-photography swap — pick dappled light with more contrast or lighten the overlay.
