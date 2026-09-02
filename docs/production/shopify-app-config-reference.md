# Shopify app configuration — rollback reference

> ## Rollback target — read this before rolling anything back
>
> **This file no longer records which version is active or which is the one-step
> rollback target.** It used to, and it was wrong for eleven days: seventeen
> versions shipped between `-9` and `-26` with nothing written down, so the
> rollback target here pointed eighteen versions back. Releasing is a CLI call and
> recording was a manual edit — that asymmetry guarantees drift, so the
> bookkeeping is gone rather than repaired. Ask the CLI instead; it is the only
> source of truth:
>
> ```sh
> npx shopify app versions list --json
> ```
>
> (`versions list` without `--json` paginates and blocks on input.) The active
> release is the one with `"status": "active"`. **The one-step rollback target is
> the next one below it by `createdAt` — not the oldest, and not `-8`.** Then:
>
> ```sh
> npx shopify app release --version <tag>
> ```
>
> What the CLI *cannot* tell you is what a given rollback costs you, so that is
> all this table keeps. The boundaries are historical and do not move; only the
> question "how far back am I going" changes.
>
> | Reverting past… | Costs you |
> | --- | --- |
> | `-26` (2026-08-18) | the `compliance_topics` declarations |
> | `-15`…`-25` (2026-08-15) | the chat widget UI work — eleven releases in one night |
> | `-13`, `-14` (2026-08-12) | the M1.5 verification widget card |
> | `-9`…`-12` (2026-08-08/10) | the `write_app_proxy` scope and the `[app_proxy]` block (M0a/M0b) |
> | `-8` (2026-08-03) | the app proxy entirely — pre-storefront-chat |
>
> So `-8` is re-releasable and always was, but reaching for it reverts the whole
> storefront chat surface.

**Webhooks, since 2026-08-09.** The five order and uninstall subscriptions are
declared in the root `shopify.app.toml`, and OAuth no longer creates per-shop
subscriptions. Use
[shopify-webhook-migration.md](shopify-webhook-migration.md) to audit, remove, or
restore the legacy per-shop subscriptions without touching unrelated webhooks.

## Two settings that look wrong and are not

The M0a export is authoritative for both, and both survived the migration on
purpose. They are here because each reads as an obvious cleanup to anyone who
meets it fresh.

**`embedded = true`.** The code predicted `false` — the dashboard is a standalone
Next.js app with no App Bridge anywhere in the tree. Production says otherwise,
and M0a carried it across unchanged, because parity means carrying a setting
across even when it looks wrong. Flipping it changes how Shopify frames the app
in admin, so it is a product decision, never a tidy-up.

**Two OAuth redirect URLs.** The app allows both the canonical
`https://app.useshopkeeper.com/api/integrations/shopify/callback` and
`https://dashboard-shopkeeper.vercel.app/api/integrations/shopify/callback` — the
raw Vercel alias, which is a live alias on the production deployment. Dropping one
is a behaviour change, not a cleanup. Per `.claude/CLAUDE.md` the `*_oauth_*`
handshake cookies are host-only and `src/proxy/canonical-host.ts` 307s
`/api/integrations` onto the `APP_URL` host, so a connect begun on the alias is
rescued by that redirect rather than by this entry. Removing the alias is
plausibly correct eventually; it has never been the safe half of a config change.

## What this file used to hold

M0a and M0b — the 2026-08-07 migration from Dev-Dashboard-configured app settings
to a CLI-authoritative `shopify.app.toml`, shipped as `shopkeeper-production-9` —
closed with every box ticked. Its code-derived expected configuration, the export
divergence table, the four findings, the M0a file listing, and the 2026-08-07
rehearsal evidence were deleted on 2026-09-01. Read them at
`git show c06be3b4:docs/production/shopify-app-config-reference.md`.

The two follow-ups that were skipped rather than completed are open in
[to-do-list.md](../to-do-list.md): reading the release grant back from Shopify's
side, and writing the merchant-facing explanation of the re-authorization prompt.

The current configuration is `shopify.app.toml` in the repo root, and its git
history is the durable record. The 2026-08-07 verbatim export is at
`git show dab6aa1b:docs/production/shopify-app-config-export-2026-08-07.toml`.

This file contains sanitized configuration only. `SHOPIFY_CLIENT_ID` and
`SHOPIFY_CLIENT_SECRET` live in Vercel; `SHOPIFY_APP_SECRET` lives in both.
