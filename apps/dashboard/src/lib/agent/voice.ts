// The Voice page's sample conversations and starting points. The customers,
// orders and details are made up, and the page says so.

export interface VoiceScenario {
  id: string
  label: string
  customerName: string
  message: string
  // What the agent would know from the store when it answers, written as facts.
  facts: string
}

export const VOICE_SCENARIOS: readonly VoiceScenario[] = [
  {
    id: "where-is-my-order",
    label: "Where's my order?",
    customerName: "Maya",
    message: "Hi! I ordered a week ago and still haven't got anything. Where is it?",
    facts: "Order #1042 shipped Tuesday with USPS, tracking 9400 1112 0000 1234 5678. USPS expects to deliver it Friday.",
  },
  {
    id: "refund",
    label: "Refund request",
    customerName: "Jordan",
    message: "The sweater I got doesn't fit. Can I get my money back?",
    facts: "Order #1051 was delivered six days ago. The store takes back unworn items within 30 days and refunds once the item arrives back. A prepaid return label can be emailed today.",
  },
  {
    id: "damaged",
    label: "Arrived damaged",
    customerName: "Priya",
    message: "My mug arrived cracked 😞",
    facts: "Order #1060 was delivered yesterday. For a damaged item the store sends a free replacement or a full refund once the customer sends a photo of the damage.",
  },
  {
    id: "upset",
    label: "Upset customer",
    customerName: "Alex",
    message: "This is the third time I'm asking. Nobody answers. Where is my order??",
    facts: "Order #1033 is held at the carrier's regional depot after a weather delay, and the carrier expects to move it within two days. The customer's two earlier messages went unanswered.",
  },
]

export function findVoiceScenario(id: unknown): VoiceScenario | null {
  return VOICE_SCENARIOS.find((scenario) => scenario.id === id) ?? null
}

// One click from a blank brief to a voice the merchant can react to.
export const VOICE_PRESETS: readonly { label: string; brief: string }[] = [
  { label: "Warm & friendly", brief: "Warm and friendly. Plain words, short sentences. Thank them first, then help." },
  { label: "Professional", brief: "Polite and professional. Clear, complete sentences. No slang or emoji." },
  { label: "Playful", brief: "Upbeat and playful, like a friend who works at the shop. A little humor, never at the customer's expense." },
  { label: "Short & direct", brief: "Short and direct. Two or three sentences. Answer first and skip the pleasantries." },
]
