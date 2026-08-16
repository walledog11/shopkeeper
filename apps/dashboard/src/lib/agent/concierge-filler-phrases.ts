const DEFAULT_PHRASES = [
  "Working on it…",
  "One moment…",
  "Thinking…",
] as const

function normalizeInstruction(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s#]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

const TICKET_WORDS = /\b(ticket|tickets|inbox|thread|threads|conversation|conversations)\b/
const OPEN_WORDS = /\b(open|pending|waiting|unresolved)\b/
const SUMMARY_WORDS = /\b(summarize|summarise|summary|recap|overview|tally|count|how many)\b/
const ORDER_WORDS = /\b(order|orders|shopify|shipment|shipping|tracking)\b/
const REFUND_WORDS = /\b(refunds?|cancel|cancellation)\b|\breturn (item|request|status)\b/
const DRAFT_WORDS = /\b(draft|reply|respond|response|write|message|email)\b/
const KNOWLEDGE_WORDS = /\b(knowledge|memory|policy|policies|kb|remember|faq)\b/
const CUSTOMER_WORDS = /\b(customer|customers|buyer|subscriber)\b/
const STATUS_WORDS = /\b(status|update|where is|what's going on)\b/
const QUESTION_START = /^(what|how|why|when|who|which|can|could|should|would|is|are|do|does|did|will|any)\b/
const QUESTION_ANYWHERE = /\b(what|how|why|when|who|which|can you|could you|should i|tell me|explain|help me)\b/
const REASONING_WORDS = /\b(explain|compare|recommend|suggest|advice|opinion|think|figure out|work out|should)\b/
const LOOKUP_WORDS = /\b(find|search|lookup|look up|show|pull|get)\b/

function isQuestion(normalized: string): boolean {
  return QUESTION_START.test(normalized) || QUESTION_ANYWHERE.test(normalized)
}

function questionFallbackPhrases(): readonly string[] {
  return [
    "Thinking through that…",
    "Piecing it together…",
    "Working on your question…",
    "Looking into it…",
  ]
}

function reasoningFallbackPhrases(): readonly string[] {
  return [
    "Thinking it through…",
    "Weighing the options…",
    "Putting it together…",
  ]
}

function lookupFallbackPhrases(): readonly string[] {
  return [
    "Looking that up…",
    "Pulling the details…",
    "Searching for it…",
  ]
}

export function getConciergeFillerPhrases(instruction: string): readonly string[] {
  const normalized = normalizeInstruction(instruction)

  if (!normalized) {
    return DEFAULT_PHRASES
  }

  if (SUMMARY_WORDS.test(normalized) && (TICKET_WORDS.test(normalized) || OPEN_WORDS.test(normalized))) {
    return [
      "Summarizing open tickets…",
      "Reading your inbox…",
      "Tallying conversations…",
      "Pulling ticket details…",
    ]
  }

  if (TICKET_WORDS.test(normalized)) {
    return [
      "Looking up tickets…",
      "Reading the thread…",
      "Checking conversations…",
      "Pulling ticket details…",
    ]
  }

  if (DRAFT_WORDS.test(normalized)) {
    return [
      "Drafting a reply…",
      "Thinking through tone…",
      "Writing a response…",
    ]
  }

  if (REFUND_WORDS.test(normalized) && ORDER_WORDS.test(normalized)) {
    return [
      "Checking refund status…",
      "Reviewing the order…",
      "Looking up payment details…",
    ]
  }

  if (ORDER_WORDS.test(normalized) || (STATUS_WORDS.test(normalized) && !TICKET_WORDS.test(normalized))) {
    return [
      "Looking up the order…",
      "Checking Shopify…",
      "Pulling order details…",
      "Checking shipment status…",
    ]
  }

  if (KNOWLEDGE_WORDS.test(normalized)) {
    return [
      "Searching knowledge base…",
      "Checking what we know…",
      "Looking up policies…",
    ]
  }

  if (REFUND_WORDS.test(normalized)) {
    return [
      "Checking refund status…",
      "Reviewing payment details…",
      "Looking into the return…",
    ]
  }

  if (REASONING_WORDS.test(normalized)) {
    return reasoningFallbackPhrases()
  }

  if (LOOKUP_WORDS.test(normalized)) {
    return lookupFallbackPhrases()
  }

  if (isQuestion(normalized)) {
    return questionFallbackPhrases()
  }

  if (CUSTOMER_WORDS.test(normalized)) {
    return [
      "Pulling customer history…",
      "Looking up the customer…",
      "Checking past orders…",
    ]
  }

  if (SUMMARY_WORDS.test(normalized)) {
    return [
      "Summarizing…",
      "Pulling the highlights…",
      "Tallying things up…",
    ]
  }

  return DEFAULT_PHRASES
}
