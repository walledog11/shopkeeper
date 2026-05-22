import { createRequire } from "node:module"
import type Stripe from "stripe"

const require = createRequire(import.meta.url)
const StripeClient = require("stripe") as typeof import("stripe").default

// Lazily initialized so importing this module at build time doesn't throw
// when STRIPE_SECRET_KEY is absent from the build environment.
let _stripe: Stripe | null = null

function getStripeClient(): Stripe {
  if (!_stripe) {
    _stripe = new StripeClient(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2026-03-25.dahlia",
    })
  }

  return _stripe
}

const stripe = new Proxy({} as Stripe, {
  get(_, prop, receiver) {
    return Reflect.get(getStripeClient(), prop, receiver)
  },
})

export default stripe
