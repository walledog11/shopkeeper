# Trust, dashboard IA, and employee UX alignment

Addresses UX/product contradictions flagged against `.claude/CLAUDE.md` principles:

1. **Trust is binary** — bias toward escalation over confident wrong action.
2. **Dashboard is one surface, not *the* surface** — but when merchants are in the dashboard, it should feel like supervising an employee, not operating a helpdesk.
3. **Agent as employee, not chatbot** — judgment, honesty, and a single coherent voice.

Scope: three audit themes — **trust defaults and copy**, **dashboard information architecture**, and **employee-not-chatbot UX**. Out of scope here: marketing hero / Apple Messages mismatch (separate pass).

Last drafted: 2026-06-10.

---

## Problem summary

| Theme | Root issue |
|-------|------------|
| Trust defaults | App says "you stay in charge" but defaults to `trusted` (`requireApprovalForActions: false`), "Autopilot" language, and "Auto-resolved %" KPIs that reward unattended automation. |
| Dashboard IA | Nav, home, and inbox optimized for ops teams (Zendesk patterns, 8-step checklist, Analytics/Review/Orders/Team at top level). Telegram — the real mobile operator surface — is buried. |
| Employee UX | Three agent faces (ticket plan card, Concierge chat, Telegram), tool-registry plan UI, hidden `@mention` invoke, and campaign copy on Concierge that doesn't match V1 support focus. |

---

## 1. Trust defaults and copy [COMPLETED]

### 1.1 Change defaults, not just copy

| Setting | Today | Target |
|---------|--------|--------|
| `autonomyTier` default | `"trusted"` in `AGENT_SETTINGS_DEFAULTS` and onboarding `DEFAULT_DATA` | `"guarded"` |
| Onboarding recommended tier | Trusted ("PICK FOR ME") | Guarded |
| `requireApprovalForActions` at signup | Inherited `false` from trusted | Explicitly `true` until merchant opts up |
| `autoExecuteMode` | `"off"` (keep) | Stay `"off"`; treat `"live"` as advanced/hidden rollout |

**Migration:** Existing orgs on `trusted` stay as-is. New signups and orgs with no explicit tier get `guarded`. Optional one-time banner for existing merchants: review autonomy in Settings.

**Onboarding (`step-autonomy`, `step-plan`):** Default path copy = "I draft, you approve via Telegram or inbox." Do not promise overnight auto-refunds up to $100 at signup unless `autoExecuteMode: live` is explicitly enabled (it is not by default).

**Key files:**

- `packages/agent/src/settings.ts` — `AGENT_SETTINGS_DEFAULTS`, `TIER_DEFAULTS`
- `apps/dashboard/src/app/(onboarding)/onboarding/_components/model.ts` — `DEFAULT_DATA.autonomy`
- `apps/dashboard/src/app/(onboarding)/onboarding/_components/step-autonomy.tsx`
- `apps/dashboard/src/app/(onboarding)/onboarding/_components/step-plan.tsx`

### 1.2 Align language everywhere

| Current | Target |
|---------|--------|
| "Autopilot: Trusted" (`AutonomyPill`) | "Trust level: Guarded" or "Mode: Asks first" |
| "Auto-resolved %" (`StatCards`) | "Handled with your OK" — or hide until merchant has meaningful volume |
| "act without waiting for approval" (`ConciergeSummary`) | Earned-autonomy framing: e.g. "Can send simple replies after you've approved a few" |
| FAQ "drafts every reply by default" | Match guarded default literally |

**Key files:**

- `apps/dashboard/src/app/dashboard/_components/AutonomyPill.tsx`
- `apps/dashboard/src/app/dashboard/_components/home/StatCards.tsx`
- `apps/dashboard/src/app/dashboard/settings/_components/ConciergeSummary.tsx`
- `apps/dashboard/src/app/(marketing)/_components/FAQ.tsx`

### 1.3 Simplify Settings autonomy (merchant-facing)

Collapse five tiers × per-field overrides into three merchant-facing modes for day-one setup:

1. **Draft only** (`watch`) — never sends, never acts on Shopify.
2. **Ask first** (`guarded`) — default; plan + approval for customer-facing and Shopify write actions.
3. **Trusted** — explicit opt-in; still require approval for refunds/cancellations unless separately enabled.

Keep `broad` / `full` hidden or "coming soon" (partially done). Move `toolsEnabled.*` overrides and tier override hints behind an **Advanced** disclosure.

**Key files:**

- `apps/dashboard/src/lib/agent/autonomy-tiers.ts`
- `apps/dashboard/src/app/dashboard/settings/_components/AgentAutonomySection.tsx`
- `apps/dashboard/src/app/dashboard/settings/_components/agent-tab-helpers.ts`

### 1.4 Tighten high-risk UI

- **Home "Approve & send"** (`NeedsYou`): Prefer "View thread" as primary for early tenure; "Send as-is" secondary until merchant has N successful approvals.
- **Plan step toggles** (`ActionPlanCard`): Do not allow unchecking `send_reply` or refund steps without explicit acknowledgment — toggles are trust foot-guns for solo merchants.
- **Quick approve** (`/api/agent/quick-approve`): Keep restricted to `quick_reply` only; never auto-approve mutative action plans.

**Key files:**

- `apps/dashboard/src/app/dashboard/_components/home/NeedsYou.tsx`
- `apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/ActionPlanCard.tsx`
- `apps/dashboard/src/app/api/agent/quick-approve/route.ts`

### 1.5 Earn autonomy (later phase)

Product loop aligned with principle 3:

```
Guarded → merchant approves N clean WISMO replies
       → prompt: "Want me to send these on my own?"
       → only then offer trusted auto-send for WISMO-only
       → refunds/cancels always ask until separate explicit toggle
```

Infrastructure hook: `AutonomyShadowDecision` + existing shadow/live `autoExecuteMode` path. Start with copy + Settings nudge before flipping live auto-execute.

---

## 2. Dashboard information architecture

### 2.1 Restructure nav around one job: "What needs me?"

**Target top-level nav (desktop + mobile):**

```
Home          → needs-you queue + overnight summary + Telegram status
Inbox         → tickets (simplified)
Memory        → knowledge base
Integrations  → channels + Telegram bind
Settings
```

**Demote or nest (not primary for solo v1):**

- Analytics, Review → nested under Home ("Activity") or Settings; or show only after ~30 days of usage
- Orders, Customers → ticket context panel + Home widget; remove from main nav
- Team → Settings → Workspace; surface invite UI when `members > 1` or user opens Team
- Concierge → demoted (see §3); not mobile bottom-bar primary

**Key files:**

- `apps/dashboard/src/app/dashboard/_components/nav-items.ts`
- `apps/dashboard/src/app/dashboard/_components/sidebar/sidebar-helpers.ts` (`mobileTabs`)

**Mobile bottom bar:**

| Today | Target |
|-------|--------|
| Inbox · Concierge · Orders · Settings | Home · Inbox · Telegram · Settings |

"Telegram" → Integrations `#telegram` if unconnected; if connected, surface last digest / "reply on Telegram to approve."

### 2.2 Simplify Home

**Target layout (`DashboardHomeClient`):**

1. Telegram-not-connected banner (prominent CTA) when applicable
2. **Needs you** — primary, above the fold
3. **Overnight briefing** (`ConciergeBriefing`) — honest tense (drafts ready, not unsupervised "cleared")
4. Optional fold: today's orders, collapsed setup

**Workflow setup:** Reduce from 8 steps to 3 essentials in `useHomeData`:

1. Connect a customer channel (email or IG)
2. Connect Shopify
3. Link Telegram on your phone

Move invite team, KB content, "send first reply", "add more channels" to collapsible **Optional setup** or contextual nudges.

**StatCards:** For new accounts, show open count + needs-you only. Drop or defer the 4-KPI analytics grid.

**Key files:**

- `apps/dashboard/src/app/dashboard/_components/home/DashboardHomeClient.tsx`
- `apps/dashboard/src/app/dashboard/_components/home/useHomeData.ts`
- `apps/dashboard/src/app/dashboard/_components/home/WorkflowSetupBanner.tsx`
- `apps/dashboard/src/app/dashboard/_components/home/StatCards.tsx`
- `apps/dashboard/src/app/dashboard/_components/home/ConciergeBriefing.tsx`

### 2.3 Simplify Inbox

Keep power features; hide by default.

| Always visible | Behind "More" / desktop-only |
|----------------|------------------------------|
| Thread list + conversation | Full context panel (drawer on small screens) |
| Agent plan card on open (expanded) | Channel filter, needs-reply filter |
| Approve / edit / I'll handle this | Presence banner (solo shops) |
| Simple close / tag | Internal notes tab → overflow "Add note" |

**Default ticket open flow:**

1. Customer message visible
2. Agent plan card expanded
3. Primary: **Approve & send** / **Edit reply** / **I'll handle this**
4. Manual composer secondary ("Write yourself")

Stop treating `@shopkeeper` as the primary discovery path.

**Key files:**

- `apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx`
- `apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/ConversationComposerArea.tsx`
- `apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/composer-utils.ts`

### 2.4 Integrations priority

Reorder setup and cards:

1. **Telegram** (operator — approve from phone)
2. Shopify
3. Email / Instagram

Change `showSetup` on Integrations: banner until **Telegram + one customer channel** connected (not only Shopify + email).

**Key files:**

- `apps/dashboard/src/app/dashboard/integrations/_components/IntegrationsPageClient.tsx`
- `apps/dashboard/src/components/integrations/TelegramCard.tsx`

---

## 3. Employee, not chatbot [COMPLETED]

### 3.1 One employee, multiple doors

| Surface | Role after alignment |
|---------|----------------------|
| **Telegram** | Primary operator interface: approve, ask about orders, digest |
| **Inbox plan card** | Same employee, work on a specific customer thread |
| **Concierge** | Desk fallback — not a separate product |

**Concierge demotion:**

- Remove from mobile bottom nav
- Home "Ask Shopkeeper" → if Telegram connected: "Message on Telegram"; else "Connect Telegram" with secondary "Open desk chat"
- `/dashboard/agent` subtitle: drop "draft campaigns"; use "Same Shopkeeper — ask about your store when you're at your desk"

Longer term: shared session continuity between Telegram and dashboard (not a parallel session model). Demotion + copy is sufficient for first pass.

**Key files:**

- `apps/dashboard/src/app/dashboard/agent/_components/AgentPageClient.tsx`
- `apps/dashboard/src/app/dashboard/_components/home/ConciergeBriefing.tsx`

### 3.2 Rewrite plan UI as employee narrative

Replace tool-registry chrome in `ActionPlanCard`:

```
Shopkeeper wants to:
  1. Look up order #2961
  2. Reply to Morgan: "Your order is out for delivery…"
  3. Close the ticket

[Send reply]  [Edit first]  [I'll handle this]
```

| Today | Target |
|-------|--------|
| "Proposed plan" | "Shopkeeper wants to:" |
| Category badges (Shopify / Reply / Internal) | Plain-English step sentences |
| "Run plan" | "Send reply" (reply-only) or "Do this" (includes actions) |
| "Dismiss" | "I'll handle this" |
| Collapsed bubble with badge chips | First line of proposed reply |

Lead with `plan.warnings` when present — employee honesty ("I'm not sure about X").

**Key file:** `apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/ActionPlanCard.tsx`

### 3.3 Remove hidden chatbot patterns

- Add explicit **"Ask about this ticket"** control in ticket header (composer-ask / read-only) instead of `@mention` as the only discoverable invoke.
- Keep `@agentName` for power users; de-emphasize in placeholder copy.
- Private agent Q&A: distinguish from team internal notes in the timeline (`NotesTimeline`).

**Key files:**

- `apps/dashboard/src/app/dashboard/tickets/_hooks/useConversationAgentFlow.ts`
- `apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/NotesTimeline.tsx`
- `apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationHeader.tsx` (new control)

### 3.4 Briefing voice

| Avoid | Prefer |
|-------|--------|
| "Overnight I cleared 4 tickets" (implies unsupervised send) | "4 tickets had replies ready — you approved 3, 1 waiting" (when metrics exist) |
| Interim without new metrics | "I drafted replies for 4 overnight" / "4 tickets are ready for you" |

Pairs with §1.2 metric rename on Home stat cards.

---

## 4. Settings simplification (cross-cutting) [COMPLETED]

Agent tab today: autonomy tiers, identity, sample replies, default behavior, guardrails, response, **WhatsApp digest**, business hours, spam filter.

**First pass:**

- Hide **WhatsApp Digest** until WhatsApp operator channel ships (or rename/repurpose for Telegram digest settings if applicable).
- Default Settings tab order: lead with simplified **Trust level** (§1.3); tuck business hours + spam under "When I'm on duty."
- Keep Settings tip accurate: "Most operators only touch Agent" — make Agent tab actually small for guarded default.

**Key files:**

- `apps/dashboard/src/app/dashboard/settings/_components/AgentTab.tsx`
- `apps/dashboard/src/app/dashboard/settings/_components/WhatsAppDigestSection.tsx`
- `apps/dashboard/src/app/dashboard/settings/_components/SettingsPageClient.tsx`

---

## 5. Implementation order

| Phase | Work | Rationale |
|-------|------|-----------|
| **1** | Defaults + copy (§1.1, §1.2, onboarding step-plan) | Low UI surface, high trust impact |
| **2** | Home + nav + 3-step setup (§2.1, §2.2, mobile bottom bar) | Where merchants land daily |
| **3** | Plan card + Concierge framing (§3.2, §3.1) | Inbox feels like an employee |
| **4** | Nav demotion (§2.1 continued) | Nest Analytics, Review, Orders, Customers |
| **5** | Settings simplification (§1.3, §4) | Reduce tuning anxiety |
| **6** | Earn-autonomy loop (§1.5) | Requires metrics / shadow decisions |

**Suggested first PR (Phase 1 + slice of Phase 2):**

- `guarded` defaults in `packages/agent/src/settings.ts` and onboarding `model.ts`
- Onboarding autonomy recommendation + step-plan copy
- `AutonomyPill` rename
- `useHomeData` workflow steps → 3 items
- Mobile bottom bar: Telegram CTA slot

---

## 6. Explicit non-goals (this plan)

- Do **not** remove Analytics, Team, or Concierge — demote, don't delete.
- Do **not** enable `autoExecuteMode: live` by default to make overnight marketing/onboarding copy "true" — that worsens trust alignment.
- Do **not** merge Telegram into the inbox UI — fix discovery and copy; Telegram stays the operator channel.
- Marketing hero / Apple Messages alignment is a **separate** doc/pass.

---

## 7. Success signals

| Metric | Target direction |
|--------|------------------|
| Telegram bind rate before first handled ticket | ↑ (e.g. >60%) |
| Time to first merchant-approved reply | ↓ |
| Merchant confusion ("did it already send?") | ↓ |
| Time on Settings → Agent tab | ↓ for new orgs |
| Home → Needs you → approve completion rate | ↑ |

---

## 8. Related docs

- Product principles: `.claude/CLAUDE.md`
- Telegram operator channel: `docs/telegram-operator-channel.md`
- Autonomy / generality (if present): `docs/autonomy-and-generality-plan.md`
- Core extraction roadmap: `docs/core-extraction-and-module-expansion-plan.md`
