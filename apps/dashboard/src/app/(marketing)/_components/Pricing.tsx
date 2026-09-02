import type { CSSProperties } from "react";
import Link from "next/link";
import { InkCheck } from "./InkCheck";
import { InkDoodle } from "./Marginalia";
import { Reveal } from "./Reveal";
import { SectionLabel } from "./SectionLabel";
import { cn } from "@/lib/ui/cn";

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
    cta: "Try Pro free →",
    href: "/signup",
    featured: true,
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-12 text-center">
      <Reveal>
        <SectionLabel>what it costs</SectionLabel>
        <h2 className="mx-auto mb-5 max-w-[20ch] text-[clamp(36px,5vw,68px)] font-bold leading-[1] tracking-[0.03em] [font-family:var(--m-hand)]">
          Costs less than <em className="italic text-[var(--m-quill)]">a part-time hire.</em>
        </h2>
        <p className="mx-auto mb-8 max-w-[48ch] text-[16px] leading-relaxed text-stone-700">
          <span className="relative inline-block whitespace-nowrap">
            Two weeks free
            <InkDoodle
              kind="ellipse"
              delay={500}
              className="pointer-events-none absolute -inset-x-2 -inset-y-1 h-[calc(100%+8px)] w-[calc(100%+16px)] opacity-70 [color:var(--m-pen)]"
            />
          </span>{" "}
          on either plan. Check the plan and total in checkout before you subscribe.
        </p>

        <p className="mx-auto mb-12 max-w-[62ch] rounded-xl border border-stone-900/10 bg-[#fdfbf7]/80 px-5 py-4 text-[15px] leading-relaxed text-stone-700">
          Both plans are the same product. Refunds, swaps, address fixes, approvals from
          your phone, your voice, your limits. The price is about how much you use it.
        </p>
      </Reveal>

      <div className="mx-auto grid max-w-4xl gap-5 text-left md:grid-cols-2">
        {tiers.map((tier, i) => (
          <Reveal key={tier.name} delay={i * 100} className="h-full">
          <div
            style={{ "--m-tilt": i === 1 ? "0.5deg" : "-0.7deg", animationDelay: `${i * 100}ms` } as CSSProperties}
            className={`relative flex h-full flex-col rounded-3xl border p-8 transition-transform duration-300 animate-[m-settle_0.7s_ease-out_backwards] motion-reduce:animate-none hover:-translate-y-1 ${
              i === 1 ? "rotate-[0.5deg]" : "-rotate-[0.7deg]"
            } ${
              tier.featured
                ? "border-[#2b2118] bg-[#2b2118] text-[#f6f2eb]"
                : "border-stone-900/10 bg-[#fdfbf7] text-stone-900"
            }`}
          >
            {!tier.featured && (
              <span
                aria-hidden
                className={`absolute -top-2 h-[18px] w-20 rounded-[2px] bg-[#cdb896]/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] mix-blend-multiply ${
                  i === 0 ? "left-7 -rotate-[5deg]" : "right-7 rotate-[5deg]"
                }`}
              />
            )}
            {tier.badge && (
              <span
                aria-label={tier.badge}
                className="m-stamp absolute -right-3 -top-4 grid -rotate-[8deg] place-items-center rounded-[50%] border-2 border-[#b0472f]/85 px-4 py-2 text-[11px] font-extrabold uppercase leading-none tracking-[0.14em] text-[#b0472f]"
              >
                {tier.badge}
              </span>
            )}
            <div className="mb-5 flex items-center gap-2.5">
              <span className="text-[24px] font-bold tracking-[0.03em] [font-family:var(--m-hand)]">{tier.name}</span>
            </div>
            <div className="mb-2 flex items-baseline gap-1.5 text-[56px] font-bold leading-none tracking-[0.03em] [font-family:var(--m-hand)]">
              {tier.price}
              <small className={`text-sm font-bold ${tier.featured ? "text-[#f6f2eb]/60" : "text-stone-500"}`}>
                {tier.per}
              </small>
            </div>
            <p className={`mb-7 min-h-10 text-[13px] leading-relaxed ${tier.featured ? "text-[#f6f2eb]/70" : "text-stone-600"}`}>
              {tier.desc}
            </p>
            <ul className="m-0 mb-8 flex list-none flex-col gap-2.5 p-0 text-[13.5px] leading-snug">
              {tier.features.map((f) => (
                <li key={f} className="flex items-start gap-2.5">
                  <InkCheck
                    className={`mt-[3px] size-[15px] shrink-0 ${
                      tier.featured ? "text-[#f6f2eb]/85" : "text-[#2b2118]"
                    }`}
                  />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href={tier.href}
              className={cn(
                "mt-auto w-full p-3 text-center",
                tier.featured ? "m-glass-btn m-glass-btn-light" : "m-glass-btn m-glass-btn-outline",
              )}
            >
              {tier.cta}
            </Link>
          </div>
          </Reveal>
        ))}
      </div>

      <p className="mx-auto mt-8 max-w-[58ch] text-[14px] leading-relaxed text-stone-600">
        A conversation is one customer thread in a month, however long it runs. Your own
        messages to Shopkeeper don’t count.
      </p>
    </section>
  );
}
