import type { Metadata } from 'next'
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
      effectiveDate="May 10, 2026"
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
                Merchants may connect email, Shopify, and other support channels. Those integrations can send us
                customer names, email addresses, order context, message content, attachments, and conversation metadata
                needed to provide support workflows.
              </p>
              <p>
                We also collect product usage, device, log, and diagnostic data such as request metadata, error reports,
                webhook delivery status, and security events. Payments are processed by Stripe; we store payment status
                and identifiers, not full payment card numbers.
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
          title: 'How We Share Information',
          body: (
            <>
              <p>
                We share information with service providers that help operate Shopkeeper, including hosting, database,
                email, observability, billing, authentication, and AI infrastructure providers. These providers may only
                use information to deliver services to us.
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
              deletion by contacting {CONTACT_EMAIL}. We process verified deletion requests according to our
              documented data deletion procedure.
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
