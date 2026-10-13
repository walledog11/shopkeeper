# SocialAPI S0 diligence

Status: open. Public-document review is complete; the DPA, written vendor
answers, and authenticated checks are not. No external merchant data may be
connected through SocialAPI until the gate below passes.
Owner: founder for vendor/commercial evidence; engineering for authenticated
technical evidence.

This record supports S0 in the [SocialAPI transport plan](../socialapi-transport-plan.md).
It contains no credentials or merchant data. Public documentation is the
vendor's stated contract, not proof of production behavior.

## Open gates

Each blocks external merchant data. What closes it is in the last column.

| Gate | What the public documents say | Closes when |
| --- | --- | --- |
| **Retention contradiction** | The privacy policy and inbox guide say DMs are stored for the account lifetime, webhook audit logs for the account lifetime, media for 60 days, with deletion within 30 days of disconnect or account deletion. Terms §11.4 says message content is never persistently stored and is cached at most five minutes. The inbox guide has also said both that DMs are stored for threading and that it proxies live data and never stores content. | The DPA and a written answer reconcile inbox, interaction/event, delivery-log payload, backup, and identifier storage, each with an exact retention and deletion window (vendor question 2). Do not infer the answer from either guide. |
| **DPA and security** | Not received. | DPA, subprocessor schedule, hosting region, backup deletion, breach history, pen-test summary, and incident path received and reviewed (question 1). The DPA lives in the private vendor record, never this repository. |
| **Message identity** | Webhooks expose an interaction ID, provider account ID, author ID, and message fields; stored rows expose `platform_id`. The webhook `platform_id` matches the stored row; the interaction ID does not. Neither the OAuth exchange nor the account read returns the native Instagram account ID. | The vendor exposes the native account ID and confirms which sender/message/conversation fields are native Meta IDs (question 5). |
| **Attachments** | `attachment_url` with image/video/audio/file types; platform URLs expire. A view-once image arrived `ephemeral` with no URL. | Real payloads for every required shape, with URL lifetime and deleted/unsent behavior (question 4), and the authenticated media check below. |
| **Recovery** | Account sync refreshes only the conversation list; per-thread refresh needs a conversation ID. Past-due webhook events are dropped while interactions stay discoverable through the events API. Failed deliveries retry five times and can be listed and replayed. | A written description of missed-event recovery (question 6) and the authenticated recovery check below. |
| **Isolation** | Keys can be restricted by scope and brand; empty restriction arrays mean unrestricted. Key/brand administration, webhook management, and event logs are account-wide and unavailable to brand-restricted keys. | Written confirmation of cross-brand isolation and of how account-wide delivery logs are isolated (question 3), plus the cross-brand authenticated check. Provision one least-privilege runtime key (`accounts:read`, `dms:read`, `dms:send`) per brand and reject an empty restriction set. |
| **Commercial terms** | Paid plans promise 99.9% monthly API uptime excluding platform outages and allow termination with 30 days' notice for any reason. | Written fair-use thresholds, rate limits, SLA coverage, support targets, incident timing, export on termination, and pricing along the 10/25/100-brand path (questions 7–9). Treat notice period and export as negotiating points. |
| **Consent screen** | SocialAPI supplies its own Meta app, shows its own brand on consent, and does not support bring-your-own Meta apps, so every SocialAPI merchant shares its Meta-app failure domain. | The live consent screen is captured, the "Powered by SocialAPI" disclosure approved, and scope reduction answered (question 10). |

Settled from the public documents and already implemented: webhooks use V2
HMAC-SHA256 over `<timestamp>.<raw body>` with a five-minute freshness window
and a delivery ID stable across retries; the initial `webhook.test` ping
arrives unsigned before the endpoint secret exists and omits a delivery ID;
normal delivery needs a `2xx` within ten seconds, so durable queue admission
precedes acknowledgement.

Sources: [Scoped API keys](https://docs.social-api.ai/guides/scoped-keys),
[Platform credentials](https://docs.social-api.ai/guides/platform-credentials),
[Unified inbox](https://docs.social-api.ai/guides/inbox),
[Webhooks](https://docs.social-api.ai/guides/webhooks),
[Inbox sync](https://docs.social-api.ai/api-reference/inbox/start-an-inbox-sync),
[Privacy policy](https://social-api.ai/privacy),
[Terms of service](https://social-api.ai/terms).

## Vendor message

The founder chooses the sender/account. Send the questions as one thread and
attach the received DPA to the private vendor record, not this repository.

> We are evaluating SocialAPI as the Instagram DM transport for a Shopify support product. Our
> intended path is staged: two supervised canary merchants first, then a paid pilot of five to ten,
> then growth toward roughly 100 connected merchant brands as the product proves out. We are
> sizing terms for that path rather than for the first cohort, and we would rather understand the
> ceiling now than renegotiate under load. Before any external merchant data is connected, please
> provide or confirm the following:
>
> 1. Please provide your current DPA and security/subprocessor schedule, including hosting
>    region, backup retention/deletion, breach history, latest penetration-test summary, and
>    incident escalation path.
> 2. Your current privacy policy and inbox documentation say DM conversations/messages are stored
>    for the account lifetime, with media retained up to 60 days and deletion within 30 days.
>    Section 11.4 of the current terms says messages are never persistently stored and may be
>    cached for at most five minutes. Which contract controls? Please list each DM, media,
>    webhook-payload/log, backup, and identifier field stored, its location, and its exact
>    retention/deletion window after disconnect and account deletion.
> 3. Confirm that a brand-restricted key with only `accounts:read`, `dms:read`, and `dms:send`
>    cannot read or mutate another brand. Explain how account-wide webhook delivery payloads and
>    delivery logs are isolated operationally when webhook management cannot use a brand-restricted
>    key.
> 4. Provide real sanitized Instagram payloads for text, image, video, audio, story/post share,
>    deleted/unsent, referral, postback, echo, delivery/read status, and unsupported input. Include
>    original platform timestamps, native IDs, provider IDs, conversation IDs, attachment URL
>    lifetime, MIME type, size, and retry/delivery headers.
> 5. Identify which account, sender, message, and conversation fields are native Meta identifiers.
>    Are they stable and equal when the same account/message is observed through another Meta app?
>    Can the API return the native Instagram account ID for a connected account?
> 6. Describe missed-event recovery precisely. Does account-level inbox sync discover every
>    conversation changed since a checkpoint? How are archived threads, pagination, deletions,
>    unsends, out-of-order events, and gaps older than the staleness window handled?
> 7. Confirm whether disconnect revokes Meta authorization and when all associated content, media,
>    webhook payloads/logs, backups, and derived identifiers are deleted. Describe export and
>    reconnection behavior if SocialAPI or Shopkeeper terminates service.
> 8. State paid-plan fair-use thresholds, shared Meta-app rate limits, webhook/message-processing
>    SLA coverage, support response targets, RTO/RPO, incident notification timing, and the
>    escalation contact for a missing DM or cross-tenant incident.
> 9. Confirm that one merchant brand with one Instagram Professional account consumes one brand
>    slot, and that separate non-production and production workspaces/keys are supported. Then
>    describe the tiers and pricing along the path above — roughly 10, 25, and 100 connected
>    brands — including whether rate limits, webhook throughput, support response, and any shared
>    Meta-app limits change per tier, what notice an upgrade needs, and whether any of them
>    require dedicated infrastructure rather than a plan change.
> 10. Provide the exact merchant OAuth consent screen and confirm whether the requested Instagram
>     scopes can be reduced to the DM-only capabilities we use.

## Authenticated verification queue

These start once the founder creates the paid production account and a separate
test account/key. Never paste a key, token, payload containing customer content,
or DPA into a tracked file.

- [ ] Record production and non-production account ownership and billing owner in the private
  credential system.
- [ ] Create one test brand and verify a non-empty brand restriction plus the minimum DM scopes.
- [ ] Prove cross-brand reads and writes fail closed without revealing whether the foreign
  resource exists.
- [ ] Capture the real scope catalog and compare it with the documented vocabulary.
- [ ] Capture the live SocialAPI-branded Instagram consent screen and authorized scopes.
- [ ] Capture sanitized V2 headers, retry timing, delivery-log visibility, and replay behavior on
  a disposable webhook.
- [ ] Exercise every required inbound media/event shape, including URL expiry and provider
  deletion behavior.
- [ ] Disable webhook delivery, recover through stored reads and platform sync, and document the
  earliest unrecoverable gap without using poll time as message time.
- [ ] Disconnect and delete the test account; verify remote authorization and provider-held data
  removal against the promised windows.

## Go/no-go gate

External merchant data is allowed only when:

- the DPA and written retention answer are acceptable and mutually consistent;
- live identity fixtures support safe tenant ownership, deduplication, and an eventual
  direct-Meta handoff;
- supported message/media coverage and recovery meet Shopkeeper's existing Instagram contract;
- scoped runtime credentials contain a merchant compromise to one assigned brand; and
- the contracted tier, rate limits, and support commitments credibly extend toward roughly 100
  connected brands.

Any failure is a no-go for external merchant data and a reason to fix the plan or change
provider. Controlled-account code may remain behind its disabled flag.
