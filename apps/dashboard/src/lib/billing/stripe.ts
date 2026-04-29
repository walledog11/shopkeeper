import { createRequire } from "node:module"
import type Stripe from "stripe"

const require = createRequire(import.meta.url)
const StripeClient = require("stripe") as typeof import("stripe").default

// Lazily initialized so importing this module at build time doesn't throw
// when STRIPE_SECRET_KEY is absent from the build environment.
let _stripe: Stripe | null = null

const stripe = new Proxy({} as Stripe, {
  get(_, prop: string | symbol) {
    if (!_stripe) {
      _stripe = new StripeClient(process.env.STRIPE_SECRET_KEY!, {
        apiVersion: "2026-03-25.dahlia",
      })
    }
    return (_stripe as any)[prop]
  },
})

export default stripe
