import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/ui/cn";

const sharedFeatures = [
  "Instagram, Gmail, and forwarded email",
  "Supported Shopify actions",
  "iMessage, Telegram, or dashboard approvals",
  "Action history and control modes",
] as const;

const tiers = [
  {
    name: "Starter",
    price: "$19",
    description: "For a founder with a smaller support volume.",
    allowance: "500 customer conversations / month",
    seats: "1 seat",
    cta: "Start with Starter",
    featured: false,
  },
  {
    name: "Pro",
    price: "$49",
    description: "For a growing store or a two-person team.",
    allowance: "Unlimited customer conversations",
    seats: "2 seats",
    cta: "Start with Pro",
    featured: true,
  },
] as const;

export function Pricing() {
  return (
    <section id="pricing" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-16 sm:px-6 md:py-24">
      <div className="grid gap-8 lg:grid-cols-[1fr_0.9fr] lg:items-end lg:gap-16">
        <div>
          <p className="m-kicker">Simple pricing</p>
          <h2 className="m-display mt-5 max-w-[14ch] text-[clamp(2.1rem,4.6vw,4.15rem)]">
            Start small. Keep the whole operator.
          </h2>
        </div>
        <p className="max-w-[52ch] text-[16px] leading-[1.7] text-stone-600">
          Both plans include supported channels, Shopify order work, approval
          controls, and action history. Choose based on volume and team size.
        </p>
      </div>

      <div className="mt-12 grid max-w-5xl gap-5 md:grid-cols-2">
        {tiers.map((tier) => (
          <article
            key={tier.name}
            className={cn(
              "relative flex flex-col overflow-hidden rounded-[2rem] border p-6 sm:p-8",
              tier.featured
                ? "border-[#2b2118] bg-[#2b2118] text-[#f6f2eb] shadow-[0_32px_72px_-52px_rgba(22,20,19,0.9)]"
                : "border-stone-900/10 bg-[#fdfbf7]/80 text-stone-900",
            )}
          >
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-[15px] font-semibold tracking-tight">{tier.name}</h3>
              {tier.featured ? (
                <span className="rounded-full border border-white/15 bg-white/[0.07] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.09em] text-[#f6f2eb]/75">
                  Recommended
                </span>
              ) : null}
            </div>

            <div className="mt-5 flex items-baseline gap-1.5 text-[clamp(2.75rem,6vw,4rem)] font-semibold leading-none tracking-[-0.055em]">
              {tier.price}
              <small className={cn("text-sm font-semibold tracking-normal", tier.featured ? "text-[#f6f2eb]/45" : "text-stone-400")}>
                / month
              </small>
            </div>
            <p className={cn("mt-4 text-[14px] leading-relaxed", tier.featured ? "text-[#f6f2eb]/65" : "text-stone-600")}>
              {tier.description}
            </p>

            <div className={cn("mt-7 grid gap-3 border-y py-5 sm:grid-cols-2", tier.featured ? "border-white/10" : "border-stone-900/10")}>
              <PlanFact label="Usage" value={tier.allowance} featured={tier.featured} />
              <PlanFact label="Team" value={tier.seats} featured={tier.featured} />
            </div>

            <ul className="mt-6 flex list-none flex-col gap-3 p-0 text-[13px] leading-relaxed">
              {sharedFeatures.map((feature) => (
                <li key={feature} className="flex items-start gap-2.5">
                  <Check className={cn("mt-0.5 size-4 shrink-0", tier.featured ? "text-emerald-200" : "text-[#2f7a4a]")} strokeWidth={2.2} aria-hidden />
                  <span className={tier.featured ? "text-[#f6f2eb]/72" : "text-stone-700"}>{feature}</span>
                </li>
              ))}
            </ul>

            <Link
              href="/signup"
              className={cn(
                "mt-8 min-h-12 w-full justify-center p-3 text-center",
                tier.featured ? "m-glass-btn m-glass-btn-light" : "m-glass-btn m-glass-btn-outline",
              )}
            >
              {tier.cta}
            </Link>
          </article>
        ))}
      </div>

      <p className="mt-6 max-w-3xl text-[12px] leading-relaxed text-stone-500">
        14-day trial. A payment method is collected when you choose a plan. A customer
        conversation is a customer support thread opened during the month; messages to
        your own Shopkeeper operator do not count.
      </p>
    </section>
  );
}

function PlanFact({ label, value, featured }: { label: string; value: string; featured: boolean }) {
  return (
    <div>
      <p className={cn("text-[10px] font-bold uppercase tracking-[0.09em]", featured ? "text-[#f6f2eb]/35" : "text-stone-400")}>
        {label}
      </p>
      <p className={cn("mt-1.5 text-[12px] font-semibold leading-snug", featured ? "text-[#f6f2eb]/80" : "text-stone-700")}>
        {value}
      </p>
    </div>
  );
}
