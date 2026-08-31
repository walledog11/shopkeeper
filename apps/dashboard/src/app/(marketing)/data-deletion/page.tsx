import type { Metadata } from 'next'
import Link from 'next/link'
import { CONTACT_EMAIL } from '@/lib/brand'
import { LegalPage } from '../_components/LegalPage'

export const metadata: Metadata = {
  title: 'Data Deletion Instructions | Shopkeeper',
  description: 'How to request deletion of data held by Shopkeeper, including data received from Instagram.',
}

const deletionIntro = (
  <p>
    Shopkeeper holds support conversations on behalf of the merchants who use it. This page explains who can ask for
    that data to be deleted, how to ask, what gets removed, and how long it takes.
  </p>
)

export default function DataDeletionPage() {
  return (
    <LegalPage
      title="Data Deletion Instructions"
      effectiveDate="August 30, 2026"
      intro={deletionIntro}
      sections={[
        {
          title: 'How to Request Deletion',
          body: (
            <>
              <p>
                Email {CONTACT_EMAIL}{' '}with the subject line &ldquo;Data deletion request&rdquo;. Include the type of
                request, the workspace or store name, and the account it concerns &mdash; an email address for email
                support, or an Instagram handle for Instagram messages. We reply to confirm the request and again when
                it is complete.
              </p>
              <p>
                We verify every request before acting on it. A workspace deletion must come from an administrator of
                that workspace. A request to delete one person&apos;s conversation must come from the merchant who
                holds the conversation, or from that person with the merchant&apos;s confirmation, because the merchant
                controls the data and may have its own record-keeping obligations.
              </p>
            </>
          ),
        },
        {
          title: 'If You Messaged a Business on Instagram',
          body: (
            <>
              <p>
                When you send a direct message to a business that uses Shopkeeper, Shopkeeper receives that message on
                the business&apos;s behalf and stores it as a support ticket. That includes the message text, any media
                you attached, your Instagram name, username, profile picture, and the identifier Meta assigns you for
                messaging that business.
              </p>
              <p>
                To have it deleted, email {CONTACT_EMAIL}{' '}with the Instagram handle you messaged from and the business
                you messaged. You can also ask the business directly &mdash; it can delete the conversation from its
                own Shopkeeper workspace. Either route removes the same records.
              </p>
              <p>
                Deleting the copy Shopkeeper holds does not delete the conversation from Instagram itself. Messages
                still in the Instagram app are held by Meta and by the business, and are removed there.
              </p>
            </>
          ),
        },
        {
          title: 'Deleting a Merchant Workspace',
          body: (
            <>
              <p>
                Deleting a workspace removes the organization record and everything scoped to it: team membership,
                connected integration credentials, customers, support threads, messages, AI summaries, agent action
                history, and stored attachments. Authentication records held by our identity provider are deleted with
                the organization.
              </p>
              <p>
                Billing records retained by our payment processor, and any records we must keep to meet a legal,
                accounting, or fraud-prevention obligation, are kept for as long as that obligation requires and are
                not used for any other purpose.
              </p>
            </>
          ),
        },
        {
          title: "Deleting One Person's Conversation Data",
          body: (
            <p>
              We remove the customer record, its support threads, the messages in them, and any stored attachments.
              After deletion the person no longer appears in dashboard search and no longer appears in the
              merchant&apos;s data export. If a merchant or the person asked for a copy of the data before deletion, we
              provide the export first.
            </p>
          ),
        },
        {
          title: 'Disconnecting a Channel',
          body: (
            <p>
              A merchant can disconnect any connected channel at any time from Settings, then Integrations.
              Disconnecting Instagram revokes Shopkeeper&apos;s access token and unsubscribes the account so Meta stops
              delivering messages to us. Disconnecting stops new data arriving; it does not by itself delete data
              already received, which is what a deletion request covers.
            </p>
          ),
        },
        {
          title: 'Data Held by Connected Platforms',
          body: (
            <p>
              Deleting data in Shopkeeper does not delete the merchant&apos;s source records held by Instagram, Meta,
              Shopify, Google, our email provider, or any other connected platform. Those are requested from that
              platform directly, under its own policy. Shopify stores send automated privacy requests to us, and we
              action customer redaction and store redaction on the schedule Shopify sets.
            </p>
          ),
        },
        {
          title: 'How Long It Takes',
          body: (
            <p>
              We complete verified deletion requests within 30 days of verifying them, unless a stricter legal deadline
              applies, in which case we meet the shorter one. We confirm by email when the request is complete.
            </p>
          ),
        },
        {
          title: 'Contact',
          body: (
            <p>
              Send requests and questions to {CONTACT_EMAIL}. What we collect and why is described in our{' '}
              <Link
                href="/privacy"
                className="font-semibold text-stone-900 underline decoration-stone-400 underline-offset-4"
              >
                Privacy Policy
              </Link>
              .
            </p>
          ),
        },
      ]}
    />
  )
}
