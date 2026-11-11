# Security incident response policy

How Shopkeeper handles a security incident that could touch personal data. The commitments merchants
see are in the Terms (*Data Processing*) and the privacy policy; the operating steps are the runbook
(*Customer data protection*). Review this policy once a year and after every incident.

## What counts

- Unauthorized access to, or disclosure, change or loss of, personal data Shopkeeper holds: customers'
  names, contact details, addresses, order details, messages and attachments; merchants' account and
  team details; waitlist entries.
- Exposure of a credential that reaches that data: a stored store, mailbox or Instagram grant,
  `TOKEN_ENCRYPTION_KEY`, a database URL, an internal API secret, the Shopify app secret, or an admin
  account (GitHub, Vercel, Railway, Neon, Clerk, Shopify Partners, Anthropic, Photon, SocialAPI,
  Stripe).
- One workspace seeing another workspace's data.
- A provider's notice of a breach that affects Shopkeeper's data.

## Who leads

The account owner leads every incident and makes the notification decisions. Reports reach them at
hello@useshopkeeper.com (the contact address in the privacy policy) and through ops alerts.

## How incidents are found

- Ops alerts and error reports, such as a run of webhook signature failures.
- The weekly customer data access review (`npm run review:customer-data-access`).
- Notices from providers and platforms.
- Reports from merchants, their customers or security researchers.

## Severity

- **Critical:** personal data was, or likely was, exposed outside the workspace it belongs to, or a
  credential that reaches it is exposed.
- **High:** a weakness that could expose personal data, with no sign it was used.
- **Low:** a weakness with no path to personal data.

## Response

1. **Record.** Within an hour of noticing, open a private incident record: when it was noticed, by
   whom, the source and what is known. Timestamp every action after that in the same record.
2. **Contain.** Immediately for Critical, the same day for High.
   - Rotate the exposed secret at the provider and in Vercel and Railway (runbook *Rotating the
     Shopify app secret* for the Shopify one).
   - `TOKEN_ENCRYPTION_KEY` cannot be rotated in place: if it is exposed, treat every stored grant as
     exposed. Revoke the grants with each provider and have merchants reconnect.
   - Revoke the sessions and access of any compromised account, and confirm two-factor sign-in on
     every admin account.
   - Close the path: ship the fix, or turn off the affected feature or worker until it ships.
3. **Investigate.** Establish what data, which workspaces and customers, and the time window. Use the
   customer data access log, `AgentAction`, Vercel and Railway logs and provider logs. For data that
   changed, inspect a Neon point-in-time branch; never restore over production while investigating.
4. **Notify.** Without undue delay, and within 72 hours of confirming that an incident affected their
   data:
   - every affected merchant: what happened, what data, what has been done and what they should do;
   - Shopify, through Partner Support, when the data came from a Shopify store;
   - Google or Meta (through SocialAPI) when Gmail or Instagram data is involved, as their terms
     require.

   Merchants decide whether to notify regulators and their customers, as the controllers of that
   data; Shopkeeper gives them the facts they need. For data Shopkeeper controls itself (merchant
   accounts, the waitlist), Shopkeeper notifies regulators and the people affected where the law
   requires.
5. **Recover.** Restore lost or changed data from a separate Neon point-in-time branch (seven days of
   history) and copy rows back, confirm stored grants still decrypt, and turn affected features back
   on.
6. **Review.** Within two weeks, write down what happened, why, and what changes, and make the
   changes: code, runbook or this policy.

## Records

Keep each incident record, its notifications and its review for at least three years.
