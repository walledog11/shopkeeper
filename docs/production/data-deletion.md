# Data Deletion Request Process

This process covers v1 launch operations for merchant workspace deletion and merchant customer deletion/export requests. It is intentionally manual until there is enough request volume to justify admin tooling.

## Scope

Shopkeeper stores merchant workspace data, connected integration metadata, customer records, support threads, messages, attachments, AI summaries, and local team-member metadata. Authentication records live in Clerk.com, billing records live in Stripe, inbound/outbound email records live in Postmark, and connected commerce records live in Shopify.

## Intake

1. Accept requests at the contact address configured in `NEXT_PUBLIC_CONTACT_EMAIL` (defaults to `hello@useclerk.co` until domain migration in Phase 6).
2. Confirm the request type: workspace deletion, customer export, customer deletion/redaction, or access correction.
3. Verify the requester:
   - Workspace deletion must come from a Clerk.com organization admin.
   - Customer export/deletion must come from the merchant that owns the customer relationship, or from the customer with merchant approval.
4. Record the request date, requester, organization, customer identifier if applicable, operator, and completion date.

Target completion window: 30 days unless a stricter legal obligation applies.

## Workspace Deletion

Preferred path:

1. Delete the organization in Clerk.com.
2. Confirm Clerk.com sends `organization.deleted` to `POST /api/webhooks/clerk`.
3. Confirm the local `Organization` row is gone. Prisma cascades delete related workspace records.
4. Revoke or delete connected provider credentials in the relevant provider consoles if they remain active.
5. Confirm Stripe subscription cancellation separately when applicable.

Manual fallback if the Clerk.com webhook did not arrive:

```sql
begin;
select id, clerk_org_id, name from organizations where clerk_org_id = '<clerk_org_id>';
delete from organizations where clerk_org_id = '<clerk_org_id>';
commit;
```

After either path, check for attachment objects in Vercel Blob that belong to the deleted organization and remove them from the storage console or a one-off operator script.

## Team Member Removal

Clerk.com lifecycle webhooks handle local team-member cleanup:

- `user.deleted` removes all matching `org_members` rows by `clerk_user_id`.
- `organizationMembership.deleted` removes the matching `org_members` row for that Clerk.com organization and user.

If a replay is needed, use the Clerk.com Dashboard webhook message replay feature for the signed event rather than editing rows manually.

## Customer Export

Merchants can export customer conversation data from the dashboard GDPR export endpoint:

```text
GET /api/reports/gdpr?email=<customer-email>
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

Do not hard-delete customer rows manually unless a legal requirement requires it and the data owner approves the resulting audit-trail impact.

## Provider-Side Data

Deletion in Shopkeeper does not delete the merchant's source records in Shopify, Postmark, Stripe, Meta, Twilio, or any other connected provider. Tell the merchant which provider-side actions remain their responsibility and record that handoff in the request log.

## Shopify App Store GDPR Webhooks

The mandatory Shopify App Store privacy webhooks are deferred for the v1 direct-merchant launch because the current launch path is not submitting the app to the Shopify App Store. Before any App Store submission, implement and test:

- `customers/data_request`
- `customers/redact`
- `shop/redact`

Until then, Shopify-related deletion requests are handled through the manual customer export/deletion and workspace deletion paths above.
