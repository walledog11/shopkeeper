# Shopkeeper waitlist

The original landing page collects addresses in its hero and closing section.
Early-access email is the default; an unchecked checkbox offers optional product
updates. Joining does not create an app account or connect a store.

## How a signup works

1. `POST /api/waitlist` saves a normalized, unique email in `waitlist_entries`,
   together with first-signup attribution, consent wording version, and newsletter
   preference. Repeated submissions preserve that original consent.
2. After returning success, the server submits to the Loops **form endpoint**.
   With double opt-in enabled in Loops, the visitor receives a confirmation email.
   The contact stays pending until they confirm. The integration never uses the
   contact-create API to bypass confirmation.
3. Confirmed visitors join **Early access**. Those who checked the optional box
   also join **Product updates**. The welcome workflow runs once on joining the
   Early access list, after that workflow has been activated in Loops.
4. The gateway checks for work every minute. Failed requests retry with increasing
   delays, from one minute up to six hours. Pending contacts are checked every
   15 minutes; confirmed contacts are reconciled daily. Per-entry leases prevent
   simultaneous web requests and workers from submitting twice.
5. Signed Loops webhooks reconcile preferences promptly. Unsubscribes are honored;
   routine sync updates metadata only and never sets `subscribed` or mailing-list
   subscriptions. Deleted and suppressed contacts are not recreated.
6. A launch campaign delivery marks a visitor `invited`. A signed Clerk
   `user.created` or `user.updated` event with a verified primary email marks them
   `signed_up`, removing them from the waiting-for-access segment.

Loops controls permission to send. The database is the durable signup record and
holds a cached copy of subscription status. `newsletterOptIn` records the original
choice; `updatesSubscribed` records the latest known Loops preference. Do not use
the original choice alone as permission to send after an unsubscribe.

The form has a honeypot, same-origin check, 4 KB body limit, and IP rate limiting.
There is no public endpoint for reading or exporting addresses. The webhook uses
signature verification, a five-minute timestamp window, and duplicate receipts.
Routine logs contain error codes, not addresses or API keys.

## Loops resources

The authenticated CLI workspace is `shopkeeper` (local credential name `my-team`).
Resource IDs are recorded in [loops-resources.json](waitlist/loops-resources.json).
Both lists have been created and attached to the drafts below. The welcome
trigger is configured to run once when a contact joins Early Access.

| Draft | Audience | Link |
| --- | --- | --- |
| Welcome | Newly confirmed Early access subscribers | [Review workflow](https://app.loops.so/workflows/cmv9w8wlt01s70j1mewmfe8ed) |
| Development update | Product updates list AND newsletter opt-in segment | [Review campaign](https://app.loops.so/campaigns/cmv9w8v2001tt0jzqlcewncl7) |
| Launch | Early access list AND waiting-for-access segment | [Review campaign](https://app.loops.so/campaigns/cmv9w8vqz01t20j3d5gkp167e) |

These resources are drafts. Provisioning does not publish, activate, or send them.
Existing onboarding drafts in the Loops workspace are preserved. The launch copy
is written for launch day; review it before sending. Sender: Rajbir at Shopkeeper,
`hello@updates.useshopkeeper.com`; replies: `hello@useshopkeeper.com`.

The public form endpoint is
`https://app.loops.so/api/newsletter-form/cmv9vchbm018p0j31nh5ilute`.
The special double-opt-in email is already published in Loops. SPF, DMARC, and
return-path MX records were checked for `updates.useshopkeeper.com`; the CLI does
not expose the dashboard's complete domain-verification status or DKIM selectors.

## Finish local setup

Both lists have been verified public, and email sync is enabled in the local
dashboard and gateway environment files. The remaining local checks are real-inbox
confirmation and activating the welcome workflow. Steps 1–2 below document how to
reconfigure the connection if needed.

1. In Loops **Settings → Lists**, ensure the existing **Early Access** and
   **Product Updates** lists both have **Public** enabled, then save each list.
   Their capitalization is handled automatically. The CLI can read these settings
   but cannot change them.
   Keep **Settings → Sending → Double opt-in** enabled.
2. After both lists are public, run the local configuration command. It reads the
   key from the CLI credential store without displaying it:

   ```sh
   npm run waitlist:configure-local -- --form-url=https://app.loops.so/api/newsletter-form/cmv9vchbm018p0j31nh5ilute
   ```

   The configuration command writes only `apps/dashboard/.env.local` and
   `apps/gateway/.env`, both ignored by Git and owner-readable. It enables sync
   only when both public lists exist. Restart the local dashboard and gateway
   after changing configuration.
   `npm run waitlist:provision` can restore the supplied draft templates and
   audience configuration if needed; it overwrites our draft email content.
3. Submit an address you control through the local landing page, confirm using
   the email, and check the list memberships in Loops. Test once without product
   updates and once with them using separate addresses. Then test unsubscribing.
4. Review and activate only the welcome workflow when ready. CLI 0.12 cannot
   activate workflows. Leave both campaigns as drafts until their intended send.

Both waitlist migrations have been applied to `shopkeeper_dev` and the isolated
`shopkeeper_waitlist_local` test database. Unrelated pending development migrations
were left untouched. Real inbox delivery still needs the confirmation test above.

## When publishing is authorized

Pushing `master` deploys the Vercel dashboard and both Railway gateway services.
Prepare the database and deployment secrets before that push or merge.
The two waitlist migrations have been applied to production, and the matching
Loops configuration is installed on Vercel and both Railway services. The steps
below document the deployment process; the Loops webhook secret still needs the
dashboard-only webhook setup.

1. Apply the additive migrations `20261014120000_add_waitlist` and
   `20261015190000_waitlist_loops` through the normal production migration process.
   Generate Prisma and build `@shopkeeper/email` before the consuming apps.
2. Add the server-only `LOOPS_*` variables from the example environment files to
   the dashboard and gateway deployment secrets. Keep their key, form, list IDs,
   and launch campaign ID aligned. Enable the existing gateway maintenance workers
   so provider failures are retried after the web request finishes.
3. Add a Loops webhook in **Settings → Webhooks** pointing to
   `https://app.useshopkeeper.com/api/webhooks/loops`. Subscribe to:
   `contact.created`, `contact.unsubscribed`, `contact.deleted`,
   `contact.mailingList.subscribed`, `contact.mailingList.unsubscribed`,
   `email.unsubscribed`, `email.resubscribed`, `email.hardBounced`,
   `email.spamReported`, and `campaign.email.sent`. Store its signing secret as
   `LOOPS_SIGNING_SECRET` in the dashboard environment. The CLI cannot create this
   webhook. Without it, scheduled reconciliation still catches subscription
   changes, but launch invitation tracking requires the campaign event.
4. Ensure the existing Clerk webhook subscribes to `user.created` and
   `user.updated`, in addition to its existing deletion events.
5. Repeat the real-inbox confirmation and unsubscribe check on the published page.
   Review the sender, reply inbox, and Loops footer before activating the welcome.

Before sending a newsletter, use the Product updates list with the newsletter
segment. Before launch, review the launch draft, verify the signup URL, and target
Early access with the waiting-for-access segment. Loops supplies the unsubscribe
footer and excludes contacts who cannot receive marketing. If you duplicate the
launch campaign, update `LOOPS_LAUNCH_CAMPAIGN_ID` to the campaign actually sent.

## Export and operations

```sh
npm run waitlist:export -- --out=/private/path/waitlist.csv
```

Set `DATABASE_URL` to the intended database first. Exports have owner-only
permissions, escape spreadsheet formulas, and never overwrite an existing file.
They include consent, stage, and last-known subscription status. Use Loops for
campaign sends; an old CSV may contain someone who has since unsubscribed.

Inspect `sync_after`, `sync_attempts`, and `last_sync_error` if a contact is not
appearing. A missing configuration leaves the saved signup queued. A provider
failure never removes it. To fulfill a deletion request, remove the contact from
Loops first (which suppresses further syncing), then remove the local waitlist
record. Webhook receipt IDs contain no email addresses and expire after 30 days.

Provider contracts: [custom forms](https://loops.so/docs/forms/custom-form),
[double opt-in](https://loops.so/docs/contacts/double-opt-in), and
[signed webhooks](https://loops.so/docs/webhooks).
