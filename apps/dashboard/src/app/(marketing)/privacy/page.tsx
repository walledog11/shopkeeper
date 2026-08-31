import type { Metadata } from 'next'
import Link from 'next/link'
import { CONTACT_EMAIL } from '@/lib/brand'
import { LegalPage } from '../_components/LegalPage'

export const metadata: Metadata = {
  title: 'Privacy Policy | Shopkeeper',
  description: 'How Shopkeeper collects, uses, and protects personal information.',
}

const privacyIntro = (
  <p>
    Shopkeeper helps merchants manage support conversations and customer context. This policy explains what
    information we collect, how we use it, and the choices available to customers and merchants.
  </p>
)

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      effectiveDate="August 30, 2026"
      intro={privacyIntro}
      sections={[
        {
          title: 'Information We Collect',
          body: (
            <>
              <p>
                We collect account and workspace information, including names, email addresses, organization names,
                team membership, authentication identifiers, billing status, and settings chosen by a merchant.
              </p>
              <p>
                Merchants may connect email, Shopify, Instagram, and other support channels. Those integrations can
                send us customer names, email addresses, social account identifiers, order context, message content,
                attachments, and conversation metadata needed to provide support workflows.
              </p>
              <p>
                We also collect product usage, device, log, and diagnostic data such as request metadata, error reports,
                webhook delivery status, and security events. Payments are processed by Stripe; we store payment status
                and identifiers, not full payment card numbers.
              </p>
              <p>
                We use PostHog for limited product analytics. Shopkeeper sends server-side events tied to a pseudonymous
                internal workspace identifier, such as onboarding progress, integration connection status, and whether
                key support workflows succeeded. We do not send names, email addresses, message content, prompts,
                integration credentials, or connected-platform payloads to PostHog, and we do not use PostHog browser
                tracking, cookies, session replay, or person profiles.
              </p>
            </>
          ),
        },
        {
          title: 'How We Use Information',
          body: (
            <>
              <p>
                We use information to provide the service, authenticate users, route and display support messages,
                generate AI-assisted drafts and summaries, send merchant-approved replies, process billing, prevent
                abuse, troubleshoot issues, and improve reliability.
              </p>
              <p>
                We do not sell personal information. We do not use merchant customer message content to train general
                purpose AI models.
              </p>
            </>
          ),
        },
        {
          title: 'Google Workspace API Data',
          body: (
            <>
              <p>
                When a merchant connects Gmail, Shopkeeper uses Google Workspace APIs to identify the connected account,
                read inbox messages and attachments addressed to the merchant&apos;s configured support address, create
                and continue visible support tickets, and send merchant-approved replies from the connected account.
                Shopkeeper stores the normalized message content, attachments, delivery metadata, and Gmail identifiers
                needed to provide those support features, prevent duplicate tickets, preserve conversation threading,
                and recover delayed synchronization.
              </p>
              <p>
                Google Workspace API data is shared only with infrastructure and AI service providers as necessary to
                provide and secure these user-facing support features, and with authorized members of the merchant&apos;s
                workspace. It is not sold, used for advertising, or used to create, train, or improve a general-purpose
                AI model. Shopkeeper&apos;s use and transfer of information received from Google APIs adheres to the
                Google API Services User Data Policy, including the Limited Use requirements.
              </p>
            </>
          ),
        },
        {
          title: 'Meta Platform Data (Instagram)',
          body: (
            <>
              <p>
                When a merchant connects an Instagram professional account, Shopkeeper requests two permissions.
                Instagram Business Basic (instagram_business_basic) identifies the connected account so the merchant can
                confirm which account is linked and so incoming messages route to the correct workspace. Instagram
                Business Manage Messages (instagram_business_manage_messages) receives the direct messages people send
                to that account and delivers merchant-approved replies back to the sender. Shopkeeper does not request
                access to a merchant&apos;s posts, comments, insights, followers, or advertising data.
              </p>
              <p>
                From those permissions Shopkeeper stores the message text, accepted media attachments, the
                Instagram-scoped sender identifier, the sender&apos;s Instagram name, username, and profile picture, and
                the provider timestamps and message identifiers returned by Meta. That data creates the visible support
                ticket, prevents duplicate tickets, preserves conversation threading, and records that a reply was
                delivered. Attachments are stored privately and can be opened only by authenticated members of the
                merchant&apos;s workspace.
              </p>
              <p>
                Meta Platform Data is shared only with the infrastructure and AI service providers needed to provide and
                secure these user-facing support features, and with authorized members of the merchant&apos;s workspace.
                It is not sold, not used for advertising or ad targeting, not used to build profiles of people
                independently of the merchant relationship, and not used to create, train, or improve a general-purpose
                AI model. Shopkeeper&apos;s use of Meta Platform Data follows the Meta Platform Terms and Developer
                Policies.
              </p>
              <p>
                A merchant can disconnect Instagram at any time from Settings, then Integrations, which revokes
                Shopkeeper&apos;s access and unsubscribes the account so no further messages are delivered. Deleting
                data Shopkeeper has already received is covered by our{' '}
                <Link href="/data-deletion" className="font-semibold text-stone-900 underline decoration-stone-400 underline-offset-4">
                  data deletion instructions
                </Link>
                .
              </p>
            </>
          ),
        },
        {
          title: 'How We Share Information',
          body: (
            <>
              <p>
                We share information with service providers that help operate Shopkeeper, including hosting, database,
                email, product analytics, observability, billing, authentication, and AI infrastructure providers. These
                providers may only use information to deliver services to us.
              </p>
              <p>
                We may share information with connected platforms as directed by a merchant, to comply with law, to
                protect rights and safety, or as part of a merger, financing, or sale of business assets.
              </p>
            </>
          ),
        },
        {
          title: 'Retention and Deletion',
          body: (
            <p>
              We retain account, workspace, support, and integration data while the merchant account is active or as
              needed for legitimate business, legal, security, and compliance purposes. Merchants can request export or
              deletion by contacting {CONTACT_EMAIL}. Our{' '}
              <Link href="/data-deletion" className="font-semibold text-stone-900 underline decoration-stone-400 underline-offset-4">
                data deletion instructions
              </Link>{' '}
              explain who may request deletion, what is removed, and how long it takes.
            </p>
          ),
        },
        {
          title: 'Security',
          body: (
            <p>
              We use administrative, technical, and organizational safeguards designed to protect personal information,
              including tenant-scoped access controls, signed webhooks, production secret separation, encryption in
              transit, and operational monitoring. No system is perfectly secure, and merchants should keep their own
              account credentials and connected platform access secure.
            </p>
          ),
        },
        {
          title: 'Your Choices',
          body: (
            <p>
              Depending on where you live, you may have rights to access, correct, export, delete, or object to certain
              processing of personal information. Merchants are responsible for responding to customer privacy requests,
              and Shopkeeper helps merchants complete those requests for data stored in the service.
            </p>
          ),
        },
        {
          title: 'Contact',
          body: <p>Questions or requests can be sent to {CONTACT_EMAIL}.</p>,
        },
      ]}
    />
  )
}
