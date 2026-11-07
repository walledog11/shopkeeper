import { MarketingFaq } from "./MarketingFaq";

const faqs = [
  {
    q: "How is it different from a helpdesk?",
    a: "A helpdesk gives you a queue to work through. Shopkeeper works the queue: it answers what it can, prepares the rest and texts you when it needs a decision.",
  },
  {
    q: "What can it do in Shopify?",
    a: "Look up orders, tracking and stock, swap items or fix an address before an order ships, cancel and refund, open returns and exchanges, and send gift cards as store credit, all within the limits you set.",
  },
  {
    q: "What counts as a conversation?",
    a: "A new customer thread in a calendar month, however long it runs. Your own messages to Shopkeeper don’t count.",
  },
  {
    q: "Will it send anything without my OK?",
    a: "Only what you allow. In Draft only, every reply waits for you. In Ask first, the default, it answers routine questions on its own and waits for your yes on anything that changes an order or costs money.",
  },
  {
    q: "Do I need an iPhone?",
    a: "No. Everything works from the dashboard on any device. With iMessage you can also approve from your phone and get your morning text there.",
  },
  {
    q: "Which channels does it work with?",
    a: "Instagram direct messages and email. Shopify is where it looks up orders and makes changes.",
  },
  {
    q: "What if it doesn’t know the answer?",
    a: "It asks you instead of guessing. Save your answer, and it uses it the next time a customer asks.",
  },
  {
    q: "Can I take my data with me?",
    a: "Yes. Download your store and customer data as JSON and your action history as CSV, any time.",
  },
];

export function FAQ() {
  return (
    <section id="faq" aria-labelledby="faq-heading" className="mx-auto grid max-w-6xl scroll-mt-24 gap-10 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-20">
      <h2 id="faq-heading" className="m-display m-h2">Questions</h2>
      <MarketingFaq items={faqs} variant="accordion" />
    </section>
  );
}
