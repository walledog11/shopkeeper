import Stripe from "stripe"

// Lazily initialized so importing this module at build time doesn't throw
// when STRIPE_SECRET_KEY is absent from the build environment.
let _stripe: Stripe | null = null

const stripe = new Proxy({} as Stripe, {
  get(_, prop: string | symbol) {
    if (!_stripe) {
      _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
        apiVersion: "2026-03-25.dahlia",
      })
    }
    return (_stripe as any)[prop]
  },
})

export default stripe
