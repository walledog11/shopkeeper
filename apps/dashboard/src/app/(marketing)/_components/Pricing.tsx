import type { CSSProperties } from "react";
import Link from "next/link";
import { CONTACT_EMAIL } from "@/lib/brand";
import { InkCheck } from "./InkCheck";
import { Reveal } from "./Reveal";
import { SectionLabel } from "./SectionLabel";
import { cn } from "@/lib/ui/cn";

const tiers = [
  {
    name: "Starter",
    badge: null,
    price: "$19",
    per: "/mo",
    desc: "For solo founders just getting their DMs under control.",
    features: ["Unified inbox — IG & email", "AI drafts every reply", "Up to 500 conversations/mo"],
    cta: "Start free trial",
    href: "/signup",
    featured: false,
  },
  {
    name: "Pro",
    badge: "Most picked",
    price: "$49",
    per: "/mo",
    desc: "For brands ready to delegate work, not just drafts.",
    features: [
      "Everything in Starter",
      "Shopify actions (refund, address, track)",
      "Approve from your phone — iMessage or Telegram",
      "Custom voice training",
      "2 team seats included",
    ],
    cta: "Try Pro free →",
    href: "/signup",
    featured: true,
  },
  {
    name: "Scale",
    badge: null,
    price: "$129",
    per: "/mo",
    desc: "For teams running 100+ tickets a day.",
    features: [
      "Everything in Pro",
      "Unlimited conversations",
      "Custom AI instructions per channel",
      "SLA + audit log",
      "Dedicated onboarding",
    ],
    cta: "Talk to us",
    href: `mailto:${CONTACT_EMAIL}`,
    featured: false,
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
        <p className="mx-auto mb-14 max-w-[48ch] text-[16px] leading-relaxed text-stone-700">
          Every plan starts with 14 days free. No credit card, no &ldquo;talk to sales&rdquo; maze.
        </p>
      </Reveal>

      <div className="grid gap-5 text-left md:grid-cols-3">
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
    </section>
  );
}
