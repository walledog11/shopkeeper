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
      effectiveDate="October 30, 2026"
      intro={privacyIntro}
      sections={[
        {
          title: 'Information We Collect',
          body: (
            <>
              <p>
                If you join our early-access waitlist, we collect your email address, signup time, and campaign tags
                to contact you about early access and understand how people find Shopkeeper. If you choose to receive
                product updates, we also record that preference. We use Loops to manage subscriptions, confirm your
                email address, and send these emails. You can unsubscribe using the link in an email. Joining does not
                create an account or connect your store. To request deletion, email{' '}
                <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-4">{CONTACT_EMAIL}</a>.
              </p>
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
                Drafts, summaries and plans are written by Anthropic&apos;s Claude models. To produce them, Shopkeeper
                sends Anthropic the relevant messages, order context and the merchant&apos;s store profile. Anthropic
                processes that content to return results to us and, under its commercial terms, does not use it to
                train its models.
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
          title: 'Instagram Messages',
          body: (
            <>
              <p>
                Merchants connect Instagram through SocialAPI, a messaging provider that relays direct messages between
                Instagram and Shopkeeper. Instagram&apos;s permission screen names SocialAPI as the app being
                authorized. SocialAPI receives the messages people send to the merchant&apos;s professional account,
                passes them to Shopkeeper, and delivers the replies the merchant approves. It handles this data for
                Shopkeeper as a service provider; its own practices are described in the{' '}
                <a href="https://social-api.ai/privacy" className="underline underline-offset-4">SocialAPI privacy policy</a>.
                Shopkeeper uses the connection only to receive and answer direct messages. It does not read the
                merchant&apos;s posts, comments, insights, followers or advertising data.
              </p>
              <p>
                Shopkeeper also operates its own Meta app, which is closed to new connections. An account connected
                through it grants two permissions: Instagram Business Basic (instagram_business_basic), which identifies
                the account so messages reach the right workspace, and Instagram Business Manage Messages
                (instagram_business_manage_messages), which receives direct messages and sends approved replies.
              </p>
              <p>
                Either way, Shopkeeper stores the message text, accepted media attachments, the identifier assigned to
                the sender for messaging that business, the sender&apos;s Instagram name or username (and, for a direct
                connection, profile picture), and the timestamps and message identifiers that come with each message.
                That data creates the support ticket, prevents duplicate tickets, keeps the conversation threaded, and
                records that a reply was delivered. Attachments are stored privately and can be opened only by
                authenticated members of the merchant&apos;s workspace.
              </p>
              <p>
                Meta Platform Data is shared only with the service providers listed below and with authorized members of
                the merchant&apos;s workspace. It is not sold, not used for advertising or ad targeting, not used to
                build profiles of people independently of the merchant relationship, and not used to create, train, or
                improve a general-purpose AI model. Shopkeeper&apos;s use of Meta Platform Data follows the Meta
                Platform Terms and Developer Policies.
              </p>
              <p>
                A merchant can disconnect Instagram at any time from Settings, then Channels. Disconnecting removes the
                account from SocialAPI (or, for a direct connection, revokes Shopkeeper&apos;s access) so no further
                messages arrive. Messages already received stay in the workspace until they are deleted, as described in
                our{' '}
                <Link href="/data-deletion" className="font-semibold text-stone-900 underline decoration-stone-400 underline-offset-4">
                  data deletion instructions
                </Link>
                .
              </p>
            </>
          ),
        },
        {
          title: 'Messages to the Merchant’s Phone',
          body: (
            <p>
              A merchant can link a phone number to receive approval requests, questions and briefings by iMessage, and
              to answer them. These messages are carried by Photon and can include a customer&apos;s name, order
              details, and the text of a customer message or a proposed reply. Shopkeeper stores the linked phone number
              and the merchant&apos;s replies.
            </p>
          ),
        },
        {
          title: 'Service Providers',
          body: (
            <>
              <p>
                These providers process personal information on our behalf, only to deliver their service to us:
              </p>
              <ul className="list-disc space-y-1 pl-5">
                <li><strong>Neon</strong> &mdash; our database, which holds workspace and support data.</li>
                <li><strong>Vercel</strong> &mdash; hosts the Shopkeeper dashboard and stores attachments.</li>
                <li><strong>Railway</strong> &mdash; runs background processing and the queue of messages waiting to be processed.</li>
                <li><strong>Upstash</strong> &mdash; short-lived counters and locks that keep the dashboard running.</li>
                <li><strong>Anthropic</strong> &mdash; AI models that read messages and write drafts, summaries and plans.</li>
                <li><strong>SocialAPI</strong> &mdash; relays Instagram direct messages and replies.</li>
                <li><strong>Postmark</strong> &mdash; receives forwarded support email and sends replies for stores that use email forwarding.</li>
                <li><strong>Photon</strong> &mdash; delivers iMessages between Shopkeeper and the merchant&apos;s phone.</li>
                <li><strong>Clerk</strong> &mdash; sign-in and team accounts.</li>
                <li><strong>Stripe</strong> &mdash; billing and payments.</li>
                <li><strong>Sentry</strong> &mdash; error reports from the dashboard.</li>
                <li><strong>PostHog</strong> &mdash; pseudonymous product analytics, as described above.</li>
                <li><strong>Loops</strong> &mdash; waitlist and product-update email.</li>
                <li><strong>ImprovMX</strong> &mdash; forwards email sent to our contact address.</li>
              </ul>
              <p>
                Shopify, Gmail and Instagram are platforms the merchant connects; data moves to and from them as the
                merchant directs. We may also share information to comply with law, to protect rights and safety, or as
                part of a merger, financing, or sale of business assets. We host our database and attachment storage in
                the United States, and our providers may process data in other countries.
              </p>
            </>
          ),
        },
        {
          title: 'Retention and Deletion',
          body: (
            <>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  Support data &mdash; customers, conversations, messages, attachments, AI summaries and the record of
                  what the agent did &mdash; is kept while the merchant&apos;s workspace exists. Older closed
                  conversations are archived out of the inbox, not deleted.
                </li>
                <li>
                  Messages the spam filter catches are permanently deleted, with their attachments, 7 days after they
                  are filtered, unless a merchant reviews them first.
                </li>
                <li>
                  When we delete one person&apos;s data at a verified request, it leaves the workspace at once and is
                  permanently erased, with its attachments, within 90 days.
                </li>
                <li>
                  Deleting a workspace deletes it and everything in it, including attachments and connected-account
                  credentials, and cancels its subscription. We keep a record that the deletion happened, without its
                  contents.
                </li>
                <li>
                  Disconnecting a channel stops new messages arriving; it does not delete messages already received.
                </li>
                <li>
                  Copies of messages in our processing queue expire within 7 days. Database backups, logs and error
                  reports are kept by our providers on their own rolling schedules.
                </li>
                <li>Waitlist details are kept until you unsubscribe or ask us to delete them.</li>
              </ul>
              <p>
                Merchants can request export or deletion by contacting {CONTACT_EMAIL}. Our{' '}
                <Link href="/data-deletion" className="font-semibold text-stone-900 underline decoration-stone-400 underline-offset-4">
                  data deletion instructions
                </Link>{' '}
                explain who may request deletion, what is removed, and how long it takes.
              </p>
            </>
          ),
        },
        {
          title: 'Security',
          body: (
            <p>
              We use administrative, technical, and organizational safeguards designed to protect personal information,
              including tenant-scoped access controls, signed webhooks, production secret separation, encryption in
              transit, encryption of connected-account credentials at rest, and operational monitoring. No system is perfectly secure, and merchants should keep their own
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
