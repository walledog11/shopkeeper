const faqs = [
  {
    q: "Do I need Gorgias or another helpdesk?",
    a: "No. Shopkeeper has its own conversation, configuration, and review surfaces. You can connect the customer channels you already use without adding another helpdesk underneath it.",
  },
  {
    q: "Do I have to replace Gmail?",
    a: "No. Connect Gmail or Google Workspace and keep replying from that address, or forward another support inbox into Shopkeeper.",
  },
  {
    q: "Which channels does Shopkeeper support?",
    a: "Customers can reach Shopkeeper through an Instagram Professional account, Gmail, or forwarded support email. Shopify storefront chat is also supported with its Shopify setup. Merchants can use iMessage, Telegram, or the dashboard for direction and approval.",
  },
  {
    q: "What can it do in Shopify?",
    a: "Shopkeeper can look up orders, customers, products, inventory, fulfillment, and tracking. Supported work includes eligible address changes, order-item edits, cancellations, exact full refunds within configured limits, returns, exchanges, gift cards, return labels, customer updates, notes, and fulfillment with tracking. The order state and your settings still determine what can run.",
  },
  {
    q: "Can I require approval before it changes an order?",
    a: "Yes. Draft only prepares work without sending or changing anything. Ask first—the default—lets routine answers move while money, changes, and exceptions can wait for you. You can also control action permissions and financial limits.",
  },
  {
    q: "What happens when Shopkeeper is not sure?",
    a: "It can ask you for missing store guidance, stop an ineligible action, or escalate the conversation. It should not invent a policy or force a Shopify change past a failed check.",
  },
  {
    q: "What if an action fails?",
    a: "The action history keeps the proposal, approval, execution status, result, and customer-facing output together. Failed or uncertain outcomes remain visible for review instead of being presented as completed work.",
  },
  {
    q: "Is customer message content used to train AI models?",
    a: "No. Shopkeeper does not use merchant customer message content to train general-purpose AI models. The Privacy Policy explains how connected-channel and customer data is used to provide the service.",
  },
  {
    q: "How long does setup take?",
    a: "Setup is a short guided flow: connect Shopify, let Shopkeeper read available store policies and pages, connect a customer inbox, and choose how approvals reach you. Additional channels can be added afterward.",
  },
  {
    q: "Is a credit card required for the trial?",
    a: "You can create an account before checkout. A payment method is collected when you choose a Starter or Pro plan and begin its 14-day Stripe trial.",
  },
  {
    q: "What usage is included?",
    a: "Starter includes 500 new customer conversations per month and 1 seat. Pro has no customer-conversation cap and includes 2 seats. Chats between you and your Shopkeeper operator do not count. If Starter goes over its allowance, new customer messages still arrive but Shopkeeper pauses planning until the allowance resets or the plan changes.",
  },
  {
    q: "How do I cancel or change my plan?",
    a: "Workspace admins can manage the subscription and payment method through the billing portal in Shopkeeper. Exact cancellation timing follows the options configured in that portal.",
  },
] as const;

export function FAQ() {
  return (
    <section id="faq" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-16 sm:px-6 md:py-24">
      <div className="grid gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:gap-20">
        <div>
          <p className="m-kicker">Questions before you connect</p>
          <h2 className="m-display mt-5 max-w-[10ch] text-[clamp(2.1rem,4.6vw,4.15rem)]">
            The practical details.
          </h2>
        </div>
        <div className="border-b border-stone-900/10">
          {faqs.map((item) => (
            <details key={item.q} className="group border-t border-stone-900/10">
              <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-5 py-5 text-[clamp(1rem,2vw,1.15rem)] font-semibold tracking-[-0.02em] text-stone-800 outline-none marker:hidden focus-visible:ring-2 focus-visible:ring-stone-700/30 [&::-webkit-details-marker]:hidden">
                <span>{item.q}</span>
                <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full border border-stone-900/10 text-[18px] font-normal text-stone-500 transition-transform duration-200 group-open:rotate-45 motion-reduce:transition-none">+</span>
              </summary>
              <p className="max-w-[70ch] pb-6 pr-10 text-[14px] leading-[1.7] text-stone-600">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
