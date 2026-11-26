import type { VoiceTraits } from "@shopkeeper/agent/settings"

// The Voice page's practice conversations and onboarding's starting voices. The
// customers, orders and details are made up, and both pages say so.

export type VoiceCategory = "support" | "policies" | "sales"

export const VOICE_CATEGORIES: readonly { id: VoiceCategory; label: string }[] = [
  { id: "support", label: "Support" },
  { id: "policies", label: "Store policies" },
  { id: "sales", label: "Sales" },
]

export interface VoiceScenario {
  id: string
  category: VoiceCategory
  customerName: string
  message: string
  // What the agent would know from the store when it answers, written as facts.
  facts: string
}

export const VOICE_SCENARIOS: readonly VoiceScenario[] = [
  {
    id: "where-is-my-order",
    category: "support",
    customerName: "Maya",
    message: "Hi! I ordered a week ago and still haven't got anything. Where is it?",
    facts: "Order #1042 shipped Tuesday with USPS, tracking 9400 1112 0000 1234 5678. USPS expects to deliver it Friday.",
  },
  {
    id: "damaged",
    category: "support",
    customerName: "Priya",
    message: "My mug arrived cracked 😞",
    facts: "Order #1060 was delivered yesterday. For a damaged item the store sends a free replacement or a full refund once the customer sends a photo of the damage.",
  },
  {
    id: "upset",
    category: "support",
    customerName: "Alex",
    message: "This is the third time I'm asking. Nobody answers. Where is my order??",
    facts: "Order #1033 is held at the carrier's regional depot after a weather delay, and the carrier expects to move it within two days. The customer's two earlier messages went unanswered.",
  },
  {
    id: "refund",
    category: "policies",
    customerName: "Jordan",
    message: "The sweater I got doesn't fit. Can I get my money back?",
    facts: "Order #1051 was delivered six days ago. The store takes back unworn items within 30 days and refunds once the item arrives back. A prepaid return label can be emailed today.",
  },
  {
    id: "shipping-time",
    category: "policies",
    customerName: "Sam",
    message: "How long does shipping take to Canada?",
    facts: "The store ships to Canada. Orders leave the warehouse in 1 to 2 business days, and Canada Post delivers in 5 to 8 business days. Shipping is $12, free on orders over $100.",
  },
  {
    id: "exchange",
    category: "policies",
    customerName: "Lena",
    message: "Can I swap my medium for a large?",
    facts: "Order #1077 was delivered four days ago. The store exchanges unworn items for another size within 30 days at no cost: the customer gets a prepaid return label, and the new size ships once the return is scanned.",
  },
  {
    id: "sizing",
    category: "sales",
    customerName: "Chris",
    message: "Does the linen shirt run small? I'm usually a medium.",
    facts: "The Linen Shirt runs true to size with a relaxed fit. A medium fits a 38 to 40 inch chest. Most customers who usually wear a medium order a medium.",
  },
  {
    id: "discount",
    category: "sales",
    customerName: "Taylor",
    message: "Do you have any discount codes right now?",
    facts: "There is no discount code running. Orders over $75 ship free. Joining the newsletter gives 10% off a first order.",
  },
  {
    id: "restock",
    category: "sales",
    customerName: "Jamie",
    message: "When will the blue planter be back in stock?",
    facts: "The Blue Planter is sold out. The next batch is expected in about three weeks. The product page has a Notify me button that emails the customer when it's back.",
  },
]

export function findVoiceScenario(id: unknown): VoiceScenario | null {
  return VOICE_SCENARIOS.find((scenario) => scenario.id === id) ?? null
}

// Onboarding's starting voices, each a set of trait choices that can be heard
// side by side. The Voice page refines them one trait at a time.
export const VOICE_PRESETS: readonly { label: string; traits: VoiceTraits }[] = [
  { label: "Warm & friendly", traits: { warmth: "warm", formality: "casual", apology: "apologize", emoji: "none" } },
  { label: "Professional", traits: { warmth: "neutral", formality: "polished", length: "thorough", emoji: "none" } },
  { label: "Playful", traits: { warmth: "warm", formality: "casual", length: "short", emoji: "some" } },
  { label: "Short & direct", traits: { warmth: "neutral", length: "short", apology: "fix", emoji: "none" } },
]
