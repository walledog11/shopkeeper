---
name: Codebase Anti-Patterns
description: Recurring issues found during code reviews in the dashboard app
type: project
---

## DashboardSidebar.tsx (reviewed 2026-04-16)

- Duplicate Clerk hook calls: `useUser`, `useOrganization`, `useOrganizationList` called independently in both `SidebarNavContent` and `MobileNavSheet`. Clerk caches these so no double network calls, but the `mounted` guard + useEffect are duplicated verbatim.
- `mounted` guard pattern (useState + useEffect for hydration) is duplicated in both sub-components; only needed because `userMemberships.data` may be undefined on SSR. Could be extracted to a hook.
- `mobileTabs` array accesses `navGroups` by numeric index (fragile to reordering of nav-items.ts).
- MobileNavSheet nav groups loop uses `group.label` as key; the first desktop group has label "Support" but the mobile loop would break if any group had no label (desktop loop uses `group.label || "home"` as defensive fallback — mobile does not).
- `MobileBottomBar` `Link` onClick fires `nav-progress-start` but does not call `e.preventDefault()` when already active (minor — active links still navigate which is a no-op, but slightly inconsistent with `handleNavClick` in other components).
- No `aria-label` on the X close button in MobileNavSheet (has only visual icon).
- `Bot` toggle button in mobile top bar has `title` but no `aria-label` (title is not reliable on touch devices).
