import { MarketingFaq } from "./MarketingFaq";
import { MarketingSection } from "./MarketingSection";
import { Reveal } from "./Reveal";

const faqs = [
  {
    q: "Can I ask it to do things, or does it only answer customers?",
    a: "You can give it work directly through iMessage or the dashboard: look up a customer, check stock, edit an eligible order, run a timed sale, change a variant’s price, or email a customer. Answering customer messages is part of the same product.",
  },
  {
    q: "Will it email a customer without me seeing it?",
    a: "Only if you allow it. In Draft only, every reply waits for your review. In Ask first, the default, routine information replies can go out on their own, while order changes, money, and exceptions wait for you.",
  },
  {
    q: "Do I need to use iMessage?",
    a: "No. Everything works from the dashboard: give it work, review proposed actions, and answer its questions. Linking iMessage lets you do the same from your phone, and get the daily briefing there.",
  },
  {
    q: "I don’t use Shopify. What do I get?",
    a: "It can still read your channels and reply using the rules you give it. But refunds, address changes, and exchanges need Shopify. Without it, there’s no order to fix.",
  },
  {
    q: "If I leave, do I get my data?",
    a: "Yes. Store and customer data downloads as JSON, and your action history as CSV. Other stores can’t see your customers or orders. The Privacy Policy and Security page explain how logins and isolation work.",
  },
];

export function FAQ() {
  return (
    <MarketingSection id="faq" className="text-center">
      <Reveal delay={120} className="mx-auto max-w-[780px] text-left">
        <MarketingFaq items={faqs} variant="accordion" />
      </Reveal>
    </MarketingSection>
  );
}
