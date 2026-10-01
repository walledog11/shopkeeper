import { Check } from "lucide-react";
import { ButtonLink } from "./ButtonLink";
import { Reveal } from "./Reveal";
import { SectionLabel } from "./SectionLabel";

// Both plans run the whole product. `PLAN_LIMITS` in `packages/db/plan-limits.ts`
// sells volume and seats and gates no tool or capability, so a $19 subscriber
// already gets Shopify actions, phone approvals and voice training. Do not add a
// feature bullet that implies otherwise — "Everything in Starter", "Shopify order
// actions", "Approvals through iMessage" were exactly that, removed once in
// `c558c788` and restored by a later redesign. Two bullets per card is thin on
// purpose: there is nothing else true to put there, and the shared line above the
// cards plus the conversation definition below are what fill the section.
const tiers = [
  {
    name: "Starter",
    badge: null,
    price: "$19",
    per: "/mo",
    desc: "For one person answering their own messages.",
    features: [
      "500 customer conversations a month",
      "One seat",
    ],
    cta: "Start free trial",
    href: "/signup",
    featured: false,
  },
  {
    name: "Pro",
    badge: "Recommended",
    price: "$49",
    per: "/mo",
    desc: "For a store past 500 a month, or a second person on the inbox.",
    features: [
      "No conversation limit",
      "Two seats",
    ],
    cta: "Start free trial",
    href: "/signup",
    featured: true,
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-16 text-center sm:px-6 sm:py-24">
      <Reveal>
        <SectionLabel>What it costs</SectionLabel>
        <h2 className="m-display m-h2 mx-auto mb-5 max-w-[20ch]">
          The whole product, <span className="m-tail">on either plan.</span>
        </h2>
        <p className="m-lede mx-auto mb-8 max-w-[48ch]">
          Try it free for 14 days.
        </p>

        <p className="mx-auto mb-12 max-w-[62ch] rounded-2xl border border-[color:var(--m-line)] bg-[color:var(--m-bg-alt)] px-5 py-4 text-[15px] leading-relaxed text-[color:var(--m-ink-2)]">
          Both plans include everything: the customer inbox, texting your shopkeeper
          over iMessage, Shopify actions, store memory, and briefings. They differ
          only in conversations and seats.
        </p>
      </Reveal>

      <div className="mx-auto grid max-w-4xl gap-5 text-left md:grid-cols-2">
        {tiers.map((tier, i) => (
          <Reveal key={tier.name} delay={i * 100} className="h-full">
            <div
              className={`relative flex h-full flex-col rounded-3xl border p-8 ${
                tier.featured ? "m-chapter--dark border-transparent" : "m-card"
              }`}
            >
              {tier.badge && (
                <span className="m-eyebrow absolute right-7 top-8 rounded-full border border-[color:var(--m-line-strong)] px-3 py-1 text-[11px]">
                  {tier.badge}
                </span>
              )}
              <p className="mb-5 text-[15px] font-medium text-[color:var(--m-ink-2)]">{tier.name}</p>
              <div className="m-display mb-3 flex items-baseline gap-1.5 text-[3.5rem] leading-none">
                {tier.price}
                <small className="text-sm font-normal text-[color:var(--m-ink-3)] [font-family:var(--m-font-sans)]">{tier.per}</small>
              </div>
              <p className="mb-7 min-h-10 text-[14px] leading-relaxed text-[color:var(--m-ink-2)]">{tier.desc}</p>
              <ul className="m-0 mb-8 flex list-none flex-col gap-3 p-0 text-[14px] leading-snug">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <Check aria-hidden className="mt-[2px] size-4 shrink-0 text-[color:var(--m-good)]" strokeWidth={2.25} />
                    {f}
                  </li>
                ))}
              </ul>
              <ButtonLink
                href={tier.href}
                size="lg"
                variant={tier.featured ? "light" : "outline"}
                className="mt-auto w-full"
              >
                {tier.cta}
              </ButtonLink>
            </div>
          </Reveal>
        ))}
      </div>

      <p className="mx-auto mt-8 max-w-[58ch] text-[14px] leading-relaxed text-[color:var(--m-ink-3)]">
        A conversation is a new customer thread opened in the calendar month, however long it runs. Your own
        messages to Shopkeeper don’t count.
      </p>
    </section>
  );
}
