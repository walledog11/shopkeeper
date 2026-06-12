import type { Category } from "./index"

export const tips: Category = {
  id: "tips",
  title: "Tips & Strategies",
  description: "Best practices for social commerce and customer support",
  icon: "💡",
  articles: [
    {
      id: "tiktok-dm-strategy",
      title: "TikTok DM strategy: turning comments into conversions",
      summary: "TikTok comments are buying signals. Learn how to move high-intent commenters into DMs and close the sale.",
      tag: "Strategy",
      readingTime: 4,
      body: [
        {
          text: "TikTok comments are one of the highest-intent signals a brand can get. When someone asks 'where can I buy this?' or 'does this come in blue?', that's a buying signal — and moving them into a DM conversation is where the sale happens.",
        },
        {
          callout: "TikTok's algorithm boosts videos with active comment threads. Responding fast doesn't just convert commenters — it pushes your video to more people.",
        },
        {
          heading: "Reply fast to high-intent comments",
          text: "Aim to respond to product questions within 30 minutes. The faster you engage, the higher the chance the commenter is still in a buying mindset.",
          steps: [
            "Pin a comment that says 'DM us for details' on product videos",
            "Use the TikTok comment reply feature to send a short video reply, then direct to DMs for specifics",
            "Set up your agent to handle common DM questions instantly (sizing, shipping, availability)",
          ],
        },
        {
          heading: "What to say in the first DM",
          tips: [
            "Reference the video they came from — it shows you're paying attention",
            "Ask one qualifying question (e.g., 'Which color were you interested in?') before pitching",
            "Keep it conversational — TikTok audiences expect casual, not corporate",
          ],
        },
        {
          heading: "When to escalate to a human",
          text: "Let your agent handle FAQs. Escalate to a human when: the customer mentions a problem with a past order, they ask for a discount or custom deal, or they've sent 3+ messages without converting.",
          warning: "Never let an upset customer wait more than 10 minutes without a human response. Sentiment can shift fast on social platforms.",
        },
      ],
    },
    {
      id: "instagram-dm-volume",
      title: "Managing high-volume Instagram DMs without burnout",
      summary: "When a post goes viral, DM volume can spike 10x overnight. Here's how to build a system that scales with you.",
      tag: "Strategy",
      readingTime: 5,
      body: [
        {
          text: "When a post goes viral or a campaign hits, DM volume can spike 10x overnight. Without a system, this overwhelms your team and tanks your response time — which Instagram's algorithm tracks and uses to rank your account.",
        },
        {
          heading: "Triage before you reply",
          steps: [
            "Use tags to separate order issues, product questions, collabs, and spam",
            "Prioritize DMs from verified accounts and existing customers first",
            "Set your agent to instantly acknowledge all new DMs so customers know they're in the queue",
          ],
        },
        {
          heading: "Build a response library",
          text: "Your team spends 80% of their time answering 20% of the same questions. Identify your top 10 most common DM topics and write templated replies for each. Store these in your agent's memory so it handles them automatically.",
          tips: [
            "Shipping timelines",
            "Return and refund policy",
            "Size guides and product availability",
            "Discount code requests",
            "Collab and PR inquiries",
          ],
        },
        {
          heading: "Set working hours expectations",
          text: "Add an auto-reply that tells customers your response hours. Keep it specific and friendly.",
          callout: "Example: 'We reply to all DMs Monday–Friday, 9am–6pm EST. For urgent order issues, email us at support@…'",
        },
        {
          warning: "Avoid the trap of responding to every DM manually during a spike — you'll burn out fast and still fall behind. Build the system first, then reply.",
        },
      ],
    },
    {
      id: "response-time-expectations",
      title: "Setting customer response time expectations that stick",
      summary: "The #1 driver of customer frustration isn't slow responses — it's not knowing how long to wait.",
      tag: "Customer Service",
      readingTime: 3,
      body: [
        {
          text: "The number one driver of customer frustration isn't slow response times — it's not knowing how long to wait. Setting clear expectations upfront prevents the follow-up 'hello??' message and buys your team breathing room.",
        },
        {
          heading: "The expectation-setting formula",
          steps: [
            "Acknowledge instantly: use an auto-reply to confirm their message was received",
            "Set a specific window: '1 business day' is better than 'as soon as possible'",
            "Deliver before the deadline: if you say 24 hours, aim for 12",
          ],
        },
        {
          callout: "Customers who get an instant acknowledgement report 40% higher satisfaction even when the actual resolution takes longer.",
        },
        {
          heading: "Where to set expectations",
          tips: [
            "DM auto-reply (Instagram, TikTok)",
            "Your bio or link-in-bio page",
            "Order confirmation emails",
            "Your website's Contact page",
          ],
        },
        {
          heading: "When you'll miss the window",
          text: "Send a proactive update before the deadline, not after. This resets the clock and builds trust instead of eroding it.",
          callout: "Template: 'Hey! Still working on your question — we'll have an answer by tomorrow morning. Thanks for your patience.'",
        },
      ],
    },
    {
      id: "support-phrases",
      title: "5 customer service phrases that build loyalty",
      summary: "The words you use in support conversations directly affect whether customers come back. These five phrases work.",
      tag: "Customer Service",
      readingTime: 3,
      body: [
        {
          text: "The words you use in support conversations directly affect whether customers come back. These five phrases are proven to de-escalate frustration, show empathy, and leave customers feeling heard.",
        },
        {
          heading: "1. 'I completely understand why that's frustrating.'",
          text: "Validates the customer's emotion without admitting fault. Use this before any explanation or solution — it's the difference between a customer feeling dismissed and a customer feeling heard.",
        },
        {
          heading: "2. 'Let me look into this personally for you.'",
          text: "Signals ownership. Even if you're handing off to a colleague, this phrase makes the customer feel like they have an advocate working on their side.",
        },
        {
          heading: "3. 'Here's exactly what's going to happen next.'",
          text: "Removes uncertainty. Customers hate not knowing what comes next — giving a clear next step, even a small one, dramatically reduces anxiety and follow-up messages.",
        },
        {
          heading: "4. 'Is there anything else I can help you with today?'",
          text: "Closes the loop professionally and catches secondary issues before they become new tickets.",
        },
        {
          heading: "5. 'Thank you for letting us know.'",
          text: "Reframes complaints as gifts. Customers who complain are telling you how to improve — those who don't just leave quietly.",
          callout: "Customers who have a complaint resolved well are actually more loyal than those who never had an issue at all.",
        },
      ],
    },
    {
      id: "ai-agent-templates",
      title: "How to respond faster with agent templates",
      summary: "Your agent is only as good as what you teach it. Here's how to build a template library that actually deflects tickets.",
      tag: "Agent Setup",
      readingTime: 5,
      body: [
        {
          text: "Your agent is only as good as what you teach it. The fastest way to increase deflection rate — the % of conversations your agent resolves without human help — is to build a strong library of response templates.",
        },
        {
          heading: "Start with your 10 most common tickets",
          steps: [
            "Export your last 30 days of closed tickets from the inbox",
            "Group them by topic — you'll likely find 5–10 categories cover 70%+ of volume",
            "Write a clear, friendly response for each and add it to your agent's memory",
          ],
        },
        {
          heading: "Template structure that works",
          tips: [
            "Acknowledge: reference what they asked about",
            "Answer: give the direct answer in plain language",
            "Offer more: 'Does that help? Let me know if you need anything else.'",
          ],
        },
        {
          callout: "A good template sounds like a person, not a policy document. Read it out loud — if it sounds robotic, rewrite it.",
        },
        {
          heading: "What to keep for humans",
          text: "Don't try to automate everything. Your agent should escalate to a human when the customer is upset, they've asked the same question twice, or the issue involves a specific order that needs investigation.",
          warning: "Never let the agent apologize for something that wasn't the company's fault — it can create liability. Train it to empathize without assigning blame.",
        },
        {
          heading: "Measure and improve",
          text: "Check your agent's resolution rate weekly. If a topic keeps escalating to humans, your template for it needs work. Refine the answer, add more detail, and re-test.",
        },
      ],
    },
    {
      id: "tags-routing",
      title: "Using tags to route tickets to the right team",
      summary: "As your team grows past 2–3 people, ad-hoc ticket assignment stops working. Tags give you lightweight routing without a complex setup.",
      tag: "Workflow",
      readingTime: 4,
      body: [
        {
          text: "As your team grows past 2–3 people, ad-hoc ticket assignment stops working. Tags give you a lightweight routing system without needing a complex helpdesk setup.",
        },
        {
          heading: "Set up a simple tag taxonomy",
          steps: [
            "Create channel tags: instagram, tiktok, sms, email",
            "Create topic tags: order-issue, returns, product-question, collab, billing",
            "Create priority tags: urgent, vip, escalated",
          ],
        },
        {
          callout: "Start with fewer tags than you think you need. You can always add more. Over-tagging leads to confusion and inconsistency.",
        },
        {
          heading: "Routing rules to start with",
          tips: [
            "All 'returns' tags → your fulfilment team member",
            "All 'collab' tags → your marketing lead",
            "All 'urgent' tags → the current on-call person",
            "Untagged tickets → general queue for first available agent",
          ],
        },
        {
          heading: "Let your agent tag automatically",
          text: "Train your agent to apply topic tags based on message content. When a customer says 'I want to return my order', the agent tags it 'returns' and routes it instantly — no human triage needed.",
          warning: "Review your agent's auto-tags weekly at first. Misrouted tickets are worse than untagged ones — they create confusion and delay.",
        },
      ],
    },
  ],
}
