import type { Metadata } from 'next'
import Link from 'next/link'
import { CONTACT_EMAIL } from '@/lib/brand'
import { LegalPage } from '../_components/LegalPage'

export const metadata: Metadata = {
  title: 'Terms of Service | Shopkeeper',
  description: 'Terms that govern use of Shopkeeper.',
}

const termsIntro = (
  <p>
    These Terms govern access to and use of Shopkeeper. By creating an account or using the service, you agree to these
    Terms on behalf of yourself and the business or organization you represent.
  </p>
)

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      effectiveDate="November 11, 2026"
      intro={termsIntro}
      sections={[
        {
          title: 'The Service',
          body: (
            <p>
              Shopkeeper provides support workflow software for merchants, including shared inbox tools, customer context,
              AI-assisted summaries and draft replies, and integrations with commerce and messaging providers.
            </p>
          ),
        },
        {
          title: 'Accounts and Workspace Administration',
          body: (
            <p>
              You must provide accurate account information, keep credentials secure, and ensure that only authorized
              users access your workspace. You are responsible for activity under your account and for configuring
              connected services, forwarding rules, and team access appropriately.
            </p>
          ),
        },
        {
          title: 'Customer Communications and AI Assistance',
          body: (
            <p>
              You are responsible for the content and legality of messages sent through Shopkeeper. AI-assisted outputs may
              be incomplete or inaccurate and should be reviewed before use. You remain responsible for merchant
              policies, refunds, order decisions, and customer-facing commitments.
            </p>
          ),
        },
        {
          title: 'Connected Services',
          body: (
            <p>
              Your use of connected services such as Shopify, email providers, Stripe, and messaging platforms remains
              subject to their terms. You authorize Shopkeeper to access, process, and transmit data from connected services
              as needed to provide the product.
            </p>
          ),
        },
        {
          title: 'Billing',
          body: (
            <p>
              Paid plans, trials, renewal terms, and fees are shown at checkout or in the product. Unless stated
              otherwise, subscriptions renew automatically until canceled. Failure to pay may result in restricted
              access, write-gating, or suspension.
            </p>
          ),
        },
        {
          title: 'Acceptable Use',
          body: (
            <p>
              You may not use Shopkeeper to violate law, infringe rights, send spam or deceptive messages, interfere with
              service operation, bypass security controls, reverse engineer the service, or process data you are not
              authorized to use.
            </p>
          ),
        },
        {
          title: 'Data and Intellectual Property',
          body: (
            <p>
              You retain rights to your business data and customer content. You grant Shopkeeper the rights needed to host,
              process, transmit, and display that data to provide and secure the service. Shopkeeper retains rights to the
              service, software, design, documentation, and related technology.
            </p>
          ),
        },
        {
          title: 'Data Processing',
          body: (
            <>
              <p>
                When Shopkeeper handles personal data about your customers, such as names, contact details, addresses,
                order details and messages, it acts as your processor (service provider). It processes that data only on
                your instructions: these Terms, your settings, and what you ask Shopkeeper to do. You are responsible for
                having the right to share that data with Shopkeeper.
              </p>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  Shopkeeper uses that data only to provide, secure and support the service, as our{' '}
                  <Link href="/privacy" className="font-semibold text-stone-900 underline decoration-stone-400 underline-offset-4">
                    Privacy Policy
                  </Link>{' '}
                  describes. It does not sell it, use it for advertising, or use it to train general-purpose AI models.
                </li>
                <li>
                  Shopkeeper staff access that data only when needed to run or support the service. They are bound by
                  confidentiality, and their access is logged and reviewed.
                </li>
                <li>
                  Shopkeeper uses the service providers listed in the Privacy Policy, under obligations that protect the
                  data at least as well as these Terms, and updates that list before a new provider receives your data.
                </li>
                <li>
                  The data is protected with the measures the Privacy Policy describes, including encryption in transit
                  and at rest.
                </li>
                <li>
                  If a security incident affects your data, Shopkeeper tells you without undue delay, and within 72 hours
                  of confirming it, and helps you meet any duty you have to notify regulators or your customers.
                </li>
                <li>
                  Shopkeeper helps you answer your customers&apos; privacy requests: you can export a customer&apos;s data
                  in the product, and Shopkeeper deletes a customer&apos;s data when you ask or when Shopify sends a
                  request for your store.
                </li>
                <li>
                  When you delete your workspace, Shopkeeper deletes the personal data it holds for you, as the Privacy
                  Policy describes, unless the law requires it to keep it. When your store uninstalls Shopkeeper, the data
                  that came from that store is erased when Shopify asks for it.
                </li>
                <li>
                  On request, Shopkeeper gives you the information reasonably needed to show it meets these commitments.
                </li>
              </ul>
            </>
          ),
        },
        {
          title: 'Disclaimers and Liability',
          body: (
            <p>
              The service is provided as available and without warranties to the maximum extent permitted by law. To the
              maximum extent permitted by law, Shopkeeper will not be liable for indirect, incidental, special, consequential,
              or punitive damages, or for lost profits, revenues, goodwill, or data.
            </p>
          ),
        },
        {
          title: 'Termination',
          body: (
            <p>
              You may stop using Shopkeeper at any time. We may suspend or terminate access if you violate these Terms,
              create security or legal risk, or fail to pay applicable fees. Some provisions survive termination where
              their nature requires it.
            </p>
          ),
        },
        {
          title: 'Changes and Contact',
          body: (
            <p>
              We may update these Terms from time to time. Material changes will be posted in the product or on this
              page. Questions can be sent to {CONTACT_EMAIL}.
            </p>
          ),
        },
      ]}
    />
  )
}
