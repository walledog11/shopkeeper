import { NextResponse } from 'next/server'
import { getOrCreateOrg } from '@/lib/server/org'
import { handleApiError } from '@/lib/api/errors'
import { rateLimit, tooManyRequests } from '@/lib/server/rate-limit'
import stripe from '@/lib/billing/stripe'
import { getOrCreateStripeCustomer } from '@/lib/billing/stripe-customer'

export async function GET() {
  try {
    const org = await getOrCreateOrg()

    const rl = await rateLimit(`billing:get:${org.id}`, 10, 60)
    if (!rl.success) return tooManyRequests(rl.reset)

    const customerId = await getOrCreateStripeCustomer(org)

    // Fetch subscription , expand payment method only (product fetched separately below)
    let subscription: import('stripe').Stripe.Subscription | null = null
    if (org.stripeSubscriptionId) {
      subscription = await stripe.subscriptions.retrieve(org.stripeSubscriptionId, {
        expand: ['default_payment_method'],
      })
    } else {
      const subs = await stripe.subscriptions.list({
        customer: customerId,
        limit: 1,
        expand: ['data.default_payment_method'],
      })
      if (subs.data.length > 0) {
        subscription = subs.data[0]
      }
    }

    // Fetch product name separately to avoid expand depth limit
    const priceItem = subscription?.items.data[0]
    let planName: string | null = null
    if (priceItem?.price.product) {
      const productId = typeof priceItem.price.product === 'string'
        ? priceItem.price.product
        : priceItem.price.product.id
      const product = await stripe.products.retrieve(productId)
      planName = product.name
    }

    // Payment method
    let paymentMethod: { brand: string; last4: string } | null = null
    if (subscription) {
      const pm = subscription.default_payment_method
      if (pm && typeof pm !== 'string' && pm.card) {
        paymentMethod = { brand: pm.card.brand, last4: pm.card.last4 }
      }
    }
    if (!paymentMethod) {
      const methods = await stripe.paymentMethods.list({ customer: customerId, type: 'card', limit: 1 })
      const card = methods.data[0]?.card
      if (card) paymentMethod = { brand: card.brand, last4: card.last4 }
    }

    // Upcoming invoice
    let nextInvoice: { date: number; amount: number } | null = null
    if (subscription && subscription.status !== 'canceled') {
      try {
        const upcoming = await stripe.invoices.createPreview({ customer: customerId })
        nextInvoice = { date: upcoming.next_payment_attempt ?? upcoming.period_end, amount: upcoming.amount_due }
      } catch {
        // No upcoming invoice (e.g. canceled)
      }
    }

    // Invoice history
    const invoices = await stripe.invoices.list({ customer: customerId, limit: 10 })
    const invoiceHistory = invoices.data.map(inv => ({
      id: inv.id,
      date: inv.created,
      amount: inv.amount_paid,
      status: inv.status,
      pdfUrl: inv.invoice_pdf,
    }))

    return NextResponse.json({
      status: subscription?.status ?? 'none',
      planName,
      priceId: priceItem?.price.id ?? null,
      amount: priceItem?.price.unit_amount ?? null,
      interval: priceItem?.price.recurring?.interval ?? null,
      trialEnd: subscription?.trial_end ?? null,
      nextInvoice,
      paymentMethod,
      invoices: invoiceHistory,
    })
  } catch (error) {
    return handleApiError(error, 'Billing GET', 'Failed to fetch billing info')
  }
}
