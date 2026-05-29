import Link from "next/link";

const tiers = [
  {
    name: "Starter",
    price: "$19",
    per: "/mo",
    desc: "For solo founders just getting their DMs under control.",
    features: ["Unified inbox , IG, email, SMS", "AI drafts every reply", "Up to 500 conversations/mo"],
    cta: "Start free trial",
    href: "/signup",
    featured: false,
  },
  {
    name: "Pro · most picked",
    price: "$49",
    per: "/mo",
    desc: "For brands ready to delegate work, not just drafts.",
    features: ["Everything in Starter", "Shopify actions (refund, address, track)", "SMS agent workflows", "Custom voice training", "2 team seats included"],
    cta: "Try Pro free →",
    href: "/signup",
    featured: true,
  },
  {
    name: "Scale",
    price: "$129",
    per: "/mo",
    desc: "For teams running 100+ tickets a day.",
    features: ["Everything in Pro", "Unlimited conversations", "Custom AI instructions per channel", "SLA + audit log", "Dedicated onboarding"],
    cta: "Talk to us",
    href: "mailto:hello@useclerk.co",
    featured: false,
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="mx-auto max-w-7xl border-t border-solid border-stone-900/10 px-7 py-20">
      <div className="mb-4 flex items-center gap-2.5 text-xs uppercase tracking-[0.15em] text-stone-700 [font-family:var(--m-mono)]">
        <span className="inline-block h-px w-6 bg-stone-700" />
        03 · Pricing
      </div>
      <h2 className="mb-12 max-w-[18ch] text-[clamp(40px,5vw,72px)] leading-[0.95] tracking-[-0.02em] [font-family:var(--m-serif)]">
        Costs less than{" "}
        <em className="italic text-green-600">a part-time CX hire.</em>
      </h2>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] overflow-hidden rounded-xl border border-solid border-stone-900/10 bg-stone-200">
        {tiers.map((tier, i) => (
          <div
            key={tier.name}
            className={`relative px-7 py-9 ${i < tiers.length - 1 ? "border-r border-solid border-stone-900/10" : ""} ${tier.featured ? "bg-stone-900 text-stone-100" : "text-stone-900"}`}
          >
            <div className={`mb-4 text-xs uppercase tracking-[0.15em] [font-family:var(--m-mono)] ${tier.featured ? "text-green-600" : "text-stone-700"}`}>
              {tier.name}
            </div>
            <div className="mb-2 flex items-baseline gap-1.5 text-[64px] leading-none tracking-[-0.03em] [font-family:var(--m-serif)]">
              {tier.price}
              <small className={`text-sm font-medium ${tier.featured ? "text-white/60" : "text-stone-700"}`}>{tier.per}</small>
            </div>
            <div className={`mb-6 min-h-10 text-[13px] ${tier.featured ? "text-white/70" : "text-stone-700"}`}>{tier.desc}</div>
            <ul className="mb-7 list-none p-0 text-[13px] leading-[1.7]">
              {tier.features.map(f => (
                <li key={f} className="relative pl-5">
                  <span className="absolute left-0 font-bold text-green-600">→</span>
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href={tier.href}
              className={`block w-full rounded-lg p-3 text-center text-[13px] font-semibold no-underline ${tier.featured ? "bg-green-600 text-white" : "border border-solid border-stone-900 text-stone-900"}`}
            >
              {tier.cta}
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
