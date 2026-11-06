import { Check } from "lucide-react";
import { PLANS } from "@/lib/billing/plans";
import { CONTACT_EMAIL, PRIMARY_CTA_LABEL } from "@/lib/brand";
import { ButtonLink } from "./ButtonLink";

// Every plan runs the whole product: `PLANS` sells conversations and seats only.
// Do not add a feature bullet here (decision 2026-08-19, `c558c788`).
export function Pricing() {
  return (
    <section id="pricing" aria-labelledby="pricing-heading" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-20 sm:px-8 sm:py-28">
      <div className="max-w-2xl">
        <h2 id="pricing-heading" className="m-display m-h2">Every plan includes everything.</h2>
        <p className="m-lede mt-5 text-[1.125rem]">You pay for conversations and seats, and nothing else.</p>
      </div>

      <div className="mt-14 grid gap-4 md:grid-cols-3">
        {PLANS.map((plan) => (
          <div key={plan.tier} className="m-plan">
            <p className="text-[15px] font-medium text-[color:var(--m-ink)]">{plan.name}</p>
            <p className="mt-6 flex items-baseline gap-1.5">
              <span className="m-display text-[3.25rem] leading-none">{plan.price}</span>
              <span className="text-[14px] text-[color:var(--m-ink-3)]">/month</span>
            </p>
            <ul className="mt-8 flex flex-col gap-3 text-[15px] text-[color:var(--m-ink)]">
              {plan.limits.map((limit) => (
                <li key={limit} className="flex items-center gap-2.5">
                  <Check aria-hidden className="size-4 shrink-0 text-[color:var(--m-good)]" strokeWidth={2.25} />
                  {limit}
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-10">
              <ButtonLink href="/#waitlist" variant={plan.tier === "pro" ? "primary" : "outline"} className="w-full">
                {PRIMARY_CTA_LABEL}
              </ButtonLink>
            </div>
          </div>
        ))}

        <div className="m-plan">
          <p className="text-[15px] font-medium text-[color:var(--m-ink)]">Custom</p>
          <p className="m-display mt-6 text-[3.25rem] leading-none">Let’s talk</p>
          <p className="mt-8 text-[15px] leading-relaxed text-[color:var(--m-ink-2)]">
            For larger teams, or more than one store.
          </p>
          <div className="mt-auto pt-10">
            <ButtonLink href={`mailto:${CONTACT_EMAIL}`} variant="outline" className="w-full">
              Contact sales
            </ButtonLink>
          </div>
        </div>
      </div>
    </section>
  );
}
