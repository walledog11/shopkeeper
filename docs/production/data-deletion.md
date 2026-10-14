# Data Deletion Request Process

This process covers merchant workspace deletion and merchant customer deletion/export requests. Workspace deletion runs on a durable ledger; customer export and deletion stay operator tasks until there is enough request volume to justify admin tooling.

## Scope

Shopkeeper stores merchant workspace data, connected integration metadata, customer records, support threads, messages, attachments, AI summaries, and local team-member metadata. Authentication records live in Clerk.com, billing records live in Stripe, email records live in Postmark or the merchant's Gmail, Instagram records live in Meta, and connected commerce records live in Shopify.

## Intake

1. Accept requests at the contact address configured in `NEXT_PUBLIC_CONTACT_EMAIL` (`hello@useshopkeeper.com`, published on `/privacy`, forwarding via ImprovMX to a monitored inbox).
2. Confirm the request type: workspace deletion, customer export, customer deletion/redaction, or access correction.
3. Verify the requester:
   - Workspace deletion must come from a Clerk.com organization admin.
   - Customer export/deletion must come from the merchant that owns the customer relationship, or from the customer with merchant approval.
4. Record the request date, requester, organization, customer identifier if applicable, operator, and completion date.

Target completion window: 30 days unless a stricter legal obligation applies.

## Workspace Deletion

Every path opens the same recovery ledger, one `workspace_deletions` row per
organization written by `beginWorkspaceDeletion` (`packages/db/workspace-deletion.ts`),
and a gateway sweep finishes it. Never delete an `organizations` row by hand: that
skips Stripe cancellation, provider cleanup and attachment removal, and leaves no
record that the deletion happened.

### Starting it

- **Merchant:** Settings → Delete workspace (`DELETE /api/org`). Org
  admins only; the typed workspace name must match. It answers `202` with the
  ledger `operationId`, and refuses with `409 last_workspace` when this is the
  caller's only workspace.
- **Operator, on a verified request:** delete the organization in the Clerk.com
  Dashboard. Clerk's `organization.deleted` reaches `POST /api/webhooks/clerk`,
  which opens the ledger with `clerk_deleted_at` already stamped.

Use the operator path when it is the merchant's only workspace. The Settings page
offers them account deletion instead, and Shopkeeper's `user.deleted` handler
removes only that user's `org_members` rows: unless the organization itself is
deleted, the workspace, its data and any Stripe subscription remain.

Opening the ledger, in one transaction, sets the organization's `lifecycle_status`
to `deleting` (dashboard org routes then answer `409` "Workspace deletion is in
progress."), copies the Clerk org ID and Stripe subscription ID onto the ledger
row, and cancels the org's queued, running and waiting agent tasks. The ledger row
has no foreign key to `organizations`, so it survives as the deletion record. A
repeat request returns the existing row.

### What the sweep does

The gateway maintenance job `workspace-deletion-sweep` (repeatable job
`workspace-deletion-sweep-1min`) runs every minute. It claims up to 10 `pending`
rows, or `processing` rows whose claim is more than five minutes old, and posts
each to the dashboard's internal `/api/org/internal/delete`, which runs
`processWorkspaceDeletion` (`apps/dashboard/src/lib/server/workspace-deletion.ts`).
Each step stamps its column, so a retry resumes where the last attempt stopped:

1. Cancel the Stripe subscription (`stripe_canceled_at`). An already-missing
   subscription counts as done. Billing stops before identity or data can
   disappear.
2. Wait while the org has an agent task running on a live lease or a plan
   execution claimed in the last five minutes, so credentials and action records
   outlast in-flight work.
3. Disconnect every integration through the integration-disconnect ledger
   (`integration_disconnects`): provider cleanup stops the Gmail watch and
   unsubscribes Instagram webhooks, then the integration row and its credentials
   are deleted. Then delete every Vercel Blob object under
   `attachments/<organization_id>/`, 100 per pass, including uploads never
   attached to a message (`integrations_cleaned_at`).
4. Delete the Clerk organization; already gone counts as done (`clerk_deleted_at`).
5. Delete the `organizations` row, which cascades to the workspace's records, and
   mark the ledger `completed` (`local_data_deleted_at`, `completed_at`).

A step that is not finished yet (in-flight work, more blobs, an integration
claimed by another worker) releases the row with
`last_error = 'Cleanup will continue on the next sweep'`. An exception releases it
with the error text and logs `[WorkspaceDeletion] Cleanup needs retry` with
`opsAlert: true`, which reaches only the Railway log viewer until log drains
exist. Nothing moves a row to `failed`; it retries every minute until it
completes.

Provider cleanup covers only the Gmail watch and the Instagram webhook
subscription (`cleanupIntegrationProvider`). The Shopify app stays installed on the
merchant's store, and an email forwarding rule keeps forwarding, until the
merchant removes them. Hand those over with the provider-side items below.

### Checking progress

```sql
select id, organization_id, clerk_org_id, status, attempts, last_error,
       stripe_canceled_at, integrations_cleaned_at, clerk_deleted_at, completed_at
from workspace_deletions
where status <> 'completed'
order by created_at;
```

The request is complete when its row reads `completed`; record `completed_at` in
the request log.

### Recovery

**The Clerk org is gone, but no ledger row exists and the organization is still
`active`.** The webhook was missed. Replay the signed `organization.deleted`
message from the Clerk.com Dashboard webhook log. If it can no longer be replayed,
make the writes `beginWorkspaceDeletion` makes and let the sweep do the rest; it
deletes the Clerk org itself and treats an already-deleted one as done. Run it
statement by statement: the first update must report `UPDATE 1`, and anything else
means the org is already deleting or gone, so roll back and read
`workspace_deletions` instead.

```sql
begin;
update organizations
set lifecycle_status = 'deleting', updated_at = now()
where clerk_org_id = '<clerk_org_id>' and lifecycle_status = 'active'
returning id, stripe_subscription_id;

insert into workspace_deletions (id, organization_id, clerk_org_id, stripe_subscription_id)
select gen_random_uuid(), id, clerk_org_id, stripe_subscription_id
from organizations
where clerk_org_id = '<clerk_org_id>';

update agent_tasks
set cancelled_at = now(), updated_at = now()
where organization_id = (select id from organizations where clerk_org_id = '<clerk_org_id>')
  and cancelled_at is null
  and status in ('queued', 'running', 'waiting_input', 'waiting_approval');
commit;
```

**A row keeps retrying with the same `last_error`.** Fix the cause (Stripe, Clerk,
Blob or provider credentials) and the next sweep resumes. If the stuck step is
provider cleanup that cannot succeed because the merchant already revoked the
Gmail or Instagram grant, the matching `integration_disconnects` row repeats the
error. Once you have confirmed the provider will no longer deliver for that
account, mark its provider step done; the next sweep deletes the integration and
continues:

```sql
update integration_disconnects
set provider_cleaned_at = now(), updated_at = now()
where organization_id = '<organization_uuid>'
  and integration_id = '<integration_uuid>'
  and status in ('pending', 'failed')
  and provider_cleaned_at is null;
```

## Team Member Removal

Clerk.com lifecycle webhooks handle local team-member cleanup:

- `user.deleted` removes all matching `org_members` rows by `clerk_user_id`.
- `organizationMembership.deleted` removes the matching `org_members` row for that Clerk.com organization and user.

If a replay is needed, use the Clerk.com Dashboard webhook message replay feature for the signed event rather than editing rows manually.

## Customer Export

Merchants can export customer conversation data from Settings → Customer data export, which calls:

```text
GET /api/org/gdpr-export?email=<customer-email>
```

The export includes customer identity, thread metadata, summaries, and non-deleted message content visible to that merchant organization. Verify that the active Clerk.com organization is the merchant that owns the customer relationship before sending an export externally.

## Customer Deletion Or Redaction

For v1, customer deletion/redaction is an operator task:

1. Identify the organization and customer by `organization_id` and customer email/platform ID.
2. Export data first if the merchant or customer requested access before deletion.
3. Soft-delete the customer, related threads, and related messages with a single timestamp:

```sql
begin;
with target_customer as (
  select id
  from customers
  where organization_id = '<organization_uuid>'
    and lower(platform_id) = lower('<customer_email_or_platform_id>')
),
target_threads as (
  select id
  from threads
  where organization_id = '<organization_uuid>'
    and customer_id in (select id from target_customer)
)
update messages
set deleted_at = now()
where thread_id in (select id from target_threads);

update threads
set deleted_at = now(), archived_at = coalesce(archived_at, now())
where id in (select id from target_threads);

update customers
set deleted_at = now()
where id in (select id from target_customer);
commit;
```

4. Delete any matching message attachments from Vercel Blob.
5. Confirm the customer no longer appears in dashboard searches and the GDPR export route no longer returns active conversation data.

This soft delete hides the customer but leaves their agent records (`agent_actions` inputs, operator pending state, storefront chat sessions, return watches, request outcomes) in place. The complete erase is `redactCustomerData` in `apps/gateway/src/routes/shopify-compliance.ts`, and today only a signed Shopify `customers/redact` delivery reaches it.

Do not hard-delete customer rows manually unless a legal requirement requires it and the data owner approves the resulting audit-trail impact.

## Provider-Side Data

Deletion in Shopkeeper does not delete the merchant's source records in Shopify, Postmark, Google (Gmail), Meta (Instagram), Stripe, or any other connected provider. Tell the merchant which provider-side actions remain their responsibility and record that handoff in the request log.

## Shopify App Store Privacy Webhooks

All three mandatory topics are declared in `shopify.app.toml` and delivered to
`POST /webhooks/shopify`, where the normal Shopify HMAC check runs before any
compliance action:

- `customers/data_request` creates an idempotent, durable pending row in
  `shopify_privacy_requests` and emits an `opsAlert` containing only its local
  request ID and fulfillment path. An authenticated member of the matching
  workspace opens
  `/api/org/gdpr-export?privacyRequestId=<local-request-uuid>` to download the
  matching export; that successful download marks the request `exported`, not
  `completed`, because an internal download does not prove delivery. Deliver the
  file directly to the store owner within 30 days, then mark the row completed
  only after delivery is confirmed.
- `customers/redact` hard-deletes the matched local customer, conversations,
  messages, private attachment blobs, and related agent records. Unlike the
  normal manual path, this is deliberately a hard deletion because Shopify has
  already applied its required retention delay before delivering the topic.
- `shop/redact` removes every Shopify-linked customer (one with a `shopify` or
  `shopify_chat` thread, or a thread carrying a Shopify customer ID) with all of
  that customer's conversations, messages, attachments, agent records and return
  watches; then the Shopify integration, its uninstall tombstone, the shop's
  `shopify_privacy_requests` rows, and Shopify-sourced knowledge-base entries.
  Customers with no Shopify link are retained.

`app/uninstalled` removes credentials immediately but preserves a non-secret
integration-disconnect tombstone. Shopify sends `shop/redact` later, so that
tombstone is required to resolve the delivery to the correct workspace without
retaining an access token.

Operational check for requests that have not yet been fulfilled:

```sql
select id, organization_id, shop_domain, shopify_request_id, received_at
from shopify_privacy_requests
where status <> 'completed'
order by received_at asc;
```

After confirmed delivery, record completion without retaining another copy of
the export:

```sql
update shopify_privacy_requests
set status = 'completed', completed_at = now()
where id = '<local-request-uuid>'
  and status = 'exported';
```

### Proving `customers/redact`

`shopify app webhook trigger` cannot exercise a real erase: its sample payload
names a customer that matches nothing, so it proves only the empty path. The
canary seeds a matching fixture, signs a delivery for it, and checks every row:

```bash
SHOPKEEPER_DB_TARGET=prod npm run canary:customer-redact:seed -- \
  --shop=<shop>.myshopify.com --execute --out=redact-canary.json
SHOPIFY_APP_SECRET=<receiving gateway's secret> npm run canary:customer-redact:deliver -- \
  --state=redact-canary.json --url=https://<gateway-host>/webhooks/shopify
SHOPKEEPER_DB_TARGET=prod npm run canary:customer-redact:verify -- --state=redact-canary.json
```

The seed is inspect-only without `--execute`, and plants an attachment only when
`BLOB_READ_WRITE_TOKEN` is set. A `401` from the delivery means the secret differs
from the receiving gateway's. A `200` alone proves nothing: success is the verify
script's `PASS` plus non-zero `deleted*` counts on the gateway's
`[Webhook] Shopify customer data redacted` log line. Because the canary holds the
signing key, only Shopify admin's **Erase personal data** action proves Shopify
originated the call, and that delivery arrives about 10 days after the request.
