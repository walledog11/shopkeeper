# PostHog Reports (product-instrumentation Phase 4)

The four saved reports required by
[`product-instrumentation-plan.md`](../product-instrumentation-plan.md) Phase 4,
specified against the **actual** event wire schema in `packages/analytics/src`
(`events.ts` + `sanitize.ts` `getEventProperties`), not the plan's prose. Property
keys below are the exact snake_case names PostHog receives.

Create these in the **production** PostHog project, and mirror them in staging (or
with an `environment = staging` filter) while validating events. Record each
report's URL/owner/last-verified in the table at the bottom after it is saved.

**Provisioning.** `npm run provision:posthog-reports` (`scripts/provision-posthog-reports.mjs`)
creates the dashboard, the eight insight tiles (funnel + time-to-value + five
agent-quality trends + retention), and the retention Action from these exact
definitions. It is idempotent (reuses anything already named the same) and prints
each saved URL — record the **dashboard** URL as the canonical entry (the five
agent-quality trends print as five separate URLs but collapse to one row below). Run it with a personal API key and
project id:

```bash
POSTHOG_PERSONAL_API_KEY=phx_... POSTHOG_PROJECT_ID=12345 npm run provision:posthog-reports
# preview the exact query payloads without any API call:
npm run provision:posthog-reports -- --dry-run
# staging copy:
POSTHOG_ENVIRONMENT=staging npm run provision:posthog-reports
```

The personal API key needs insight/dashboard/action **write** scopes and access to
the project. `POSTHOG_API_HOST` defaults to `https://us.posthog.com` (the management
API host — not the `https://us.i.posthog.com` ingest host).

## Shared facts

- **`distinct_id` = the internal `Organization.id` UUID.** Every report is
  therefore per-organization without PostHog group analytics (a paid add-on we do
  not use).
- **Global filter on every report:** `environment = production`. Use
  `environment = staging` for the mirrored staging copies. `environment` is set
  from `VERCEL_ENV` (dashboard) / `RAILWAY_ENVIRONMENT_NAME` (gateway) — see
  `resolveAnalyticsEnvironment` in `packages/analytics/src/config.ts`.
- **Common properties on all events:** `organization_id`, `schema_version` (=1),
  `environment`, `source` (`dashboard` | `gateway`), plus `$process_person_profile`
  (=false). `source` is useful as an occasional breakdown, not a filter.
- **API vs ingest host.** Events are ingested at `https://us.i.posthog.com`. The
  **management/query API** (creating insights, dashboards, actions) is a *different*
  host: `https://us.posthog.com`. Don't point management calls at the `i.` ingest
  host.

Group all four onto one dashboard, e.g. **"Merchant Activation"**.

## 1. Activation funnel

- **Insight type:** Funnel, ordered, **7-day conversion window**.
- **Date range:** last 90 days (rolling).
- **Steps** (in order):

  | # | Event | Step filter |
  | --- | --- | --- |
  | 1 | `workspace_created` | — |
  | 2 | `integration_connection_completed` | `platform = shopify` |
  | 3 | `integration_connection_completed` | `platform = email` |
  | 4 | `onboarding_completed` | — |
  | 5 | `inbound_message_processed` | — |
  | 6 | `agent_plan_decided` | `decision = approved` |
  | 7 | `outbound_reply_sent` | `reply_source` is one of `agent_approved`, `agent_automatic` |

- Break down by `environment` only while validating staging; the production
  report filters to `environment = production`.

## 2. Time to value

- **Insight type:** Trends over `workspace_activated`, aggregating the numeric
  event property `seconds_since_workspace_created` (which already encodes the
  `workspace_created → workspace_activated` duration).
- **Series:**
  - median (p50) of `seconds_since_workspace_created`
  - p90 of `seconds_since_workspace_created`
- **Optional breakdown:** `within_seven_days` (true / false) to split on-time from
  late activation.

## 3. Agent quality

One Trends tile per line (all filtered to `environment = production`):

| Trend | Event | Breakdown |
| --- | --- | --- |
| Approval / dismissal / regeneration rate | `agent_plan_decided` | `decision` (`approved` / `dismissed` / `regenerated`) |
| Changed vs unchanged approvals | `agent_plan_decided`, filter `decision = approved` | `changed` (true / false) |
| Action success / block / failure | `agent_action_completed` | `outcome` (`succeeded` / `blocked` / `failed` / `unknown`) |
| Manual vs agent-assisted replies | `outbound_reply_sent` | `reply_source` (`manual` / `agent_approved` / `agent_automatic`) |
| Cache-hit vs newly generated plans | `agent_plan_generated` | `cache_hit` (true / false) |

## 4. Weekly retention

- **Insight type:** Retention, **weekly**, "First time" cohorts, ~8 intervals.
- **Cohortizing (target) event:** `workspace_created`.
- **Returning event = "at least one meaningful event":**
  `agent_plan_decided` **OR** `agent_action_completed` **OR** `outbound_reply_sent`.
  PostHog retention takes a *single* returning entity, so first create a PostHog
  **Action** — e.g. **"Meaningful activity"** — that matches any of those three
  events, then select that Action as the returning entity.
- Per-organization retention needs no group analytics because `distinct_id` is the
  org UUID.

## Record (fill in after each report is saved)

| Report | Saved name | Production URL | Owner | Last verified |
| --- | --- | --- | --- | --- |
| Activation funnel | | | | |
| Time to value | | | | |
| Agent quality | | | | |
| Weekly retention | | | | |
| Dashboard ("Merchant Activation") | | | | |

## Verification

Reports are "verified" once a controlled activation journey (staging first, then
one production journey per the Phase 5 rollout) walks all seven funnel steps and
each report reflects the events. Until `PRODUCT_ANALYTICS_ENABLED=true` and real
traffic exists, saved reports render empty — that is expected; saving them is a
prerequisite for enabling production capture, not a consumer of live data.
