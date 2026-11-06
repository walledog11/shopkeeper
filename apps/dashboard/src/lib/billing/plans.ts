// Plan names and prices, for the pricing page and Billing. The limits mirror
// `PLAN_LIMITS` in `packages/db/plan-limits.ts`: plans sell conversations and
// seats, and every plan runs the whole product.
export const PLANS = [
  { tier: "starter", name: "Starter", price: "$49", limits: ["500 conversations a month", "1 seat"] },
  { tier: "pro", name: "Pro", price: "$99", limits: ["Unlimited conversations", "2 seats"] },
] as const;
