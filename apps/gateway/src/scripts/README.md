# Gateway operational scripts

Production-adjacent utilities for the Railway gateway service. They are **not**
imported by the running server. Repo-wide audit gates live under `scripts/` at the
repository root — see [docs/audit-commands.md](../../../../docs/audit-commands.md).

Run with production credentials only when the script header or runbook says so.
Prefer `railway run` (or the env file noted in each file) over copying secrets locally.

## npm wrappers (preferred entry points)

| npm script | Script |
| --- | --- |
| `npm run audit:shopify-webhooks` | `inspect-shopify-webhooks.ts` |
| `npm run canary:outbound-gmail -w apps/gateway` | `canary-outbound-gmail.ts` |

## Scripts and what uses them

| Script | Used by |
| --- | --- |
| `canary-dashboard-send-reply-hop.ts` | `e2e/internal-send-hop.spec.ts` (`test:e2e:smoke`) |
| `canary-outbound-gmail.ts` | Runbook *Outbound email delivery mode* |
| `inspect-failed-queue-jobs.ts`, `remove-failed-queue-job.ts` | Runbook *BullMQ Failed Jobs* |
| `set-telegram-webhook.ts` | Runbook *Telegram operator channel* |
| `inspect-shopify-webhooks.ts` | Runbook *Webhook Routing* and *Channel Smoke Tests and Recovery* |
| `inspect-turn-usage.ts` | [docs/audit-commands.md](../../../../docs/audit-commands.md) |
| `measure-agent-prompt.ts` | Per-section prompt token counts (`count_tokens`, no spend) before changing tool schemas |
| `inspect-flash-sales.ts` | The only live-store check of the `end_flash_sale` discount query |
| `backdate-episode-clock.ts`, `inspect-escalation-routing.ts` | [Storefront chat verification](../../../../docs/production/storefront-chat-verification-2026-08.md) |

## Adding a script

Document required env vars in the file header. If operators will run it repeatedly,
add an `npm run` alias in the root `package.json` and a row in
[docs/audit-commands.md](../../../../docs/audit-commands.md) when it is a retirement
or rollout gate. List it in the table above.
