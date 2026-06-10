import Link from "next/link";
import { CONTACT_EMAIL } from "@/lib/brand";
import { Reveal } from "./Reveal";
import { cn } from "@/lib/ui/cn";

const tiers = [
  {
    name: "Starter",
    badge: null,
    price: "$19",
    per: "/mo",
    desc: "For solo founders just getting their DMs under control.",
    features: ["Unified inbox — IG, email, SMS", "AI drafts every reply", "Up to 500 conversations/mo"],
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
      "Telegram agent — approve from your phone",
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
    <section id="pricing" className="mx-auto max-w-6xl border-t border-stone-900/10 px-6 py-24 text-center">
      <Reveal>
        <h2 className="mx-auto mb-5 max-w-[20ch] text-[clamp(36px,5vw,68px)] font-normal leading-[1] tracking-[-0.01em] [font-family:var(--m-serif)]">
          Costs less than <em className="italic text-[#9c9285]">a part-time hire.</em>
        </h2>
        <p className="mx-auto mb-14 max-w-[48ch] text-[16px] leading-relaxed text-stone-700">
          Every plan starts with 14 days free. No credit card, no &ldquo;talk to sales&rdquo; maze.
        </p>
      </Reveal>

      <div className="grid gap-5 text-left md:grid-cols-3">
        {tiers.map((tier, i) => (
          <Reveal key={tier.name} delay={i * 100} className="h-full">
          <div
            className={`flex h-full flex-col rounded-3xl border p-8 transition-transform duration-300 hover:-translate-y-1 ${
              tier.featured
                ? "border-[#2b2118] bg-[#2b2118] text-[#f6f2eb]"
                : "border-stone-900/10 bg-[#fdfbf7] text-stone-900"
            }`}
          >
            <div className="mb-5 flex items-center gap-2.5">
              <span className="text-[24px] font-normal tracking-tight [font-family:var(--m-serif)]">{tier.name}</span>
              {tier.badge && (
                <span className="rounded-full bg-[#f6f2eb]/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#f6f2eb]">
                  {tier.badge}
                </span>
              )}
            </div>
            <div className="mb-2 flex items-baseline gap-1.5 text-[56px] leading-none tracking-[-0.02em] [font-family:var(--m-serif)]">
              {tier.price}
              <small className={`text-sm font-medium ${tier.featured ? "text-[#f6f2eb]/60" : "text-stone-500"}`}>
                {tier.per}
              </small>
            </div>
            <p className={`mb-7 min-h-10 text-[13px] leading-relaxed ${tier.featured ? "text-[#f6f2eb]/70" : "text-stone-600"}`}>
              {tier.desc}
            </p>
            <ul className="m-0 mb-8 flex list-none flex-col gap-2.5 p-0 text-[13.5px] leading-snug">
              {tier.features.map((f) => (
                <li key={f} className="flex items-start gap-2.5">
                  <span
                    className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full text-[9px] ${
                      tier.featured ? "bg-[#f6f2eb]/15 text-[#f6f2eb]" : "bg-[#2b2118]/10 text-[#2b2118]"
                    }`}
                  >
                    ✓
                  </span>
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
