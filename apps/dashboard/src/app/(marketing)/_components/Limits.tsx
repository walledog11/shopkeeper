import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AUTONOMY_TIERS } from "@/lib/agent/autonomy-tiers";
import { cn } from "@/lib/ui/cn";

// The labels and the blurb are the app's own settings, so the page shows what a
// merchant will find there.
const shown = AUTONOMY_TIERS.find((tier) => tier.recommended) ?? AUTONOMY_TIERS[0];

function Toggle() {
  return (
    <span className="relative inline-flex h-6 w-10 shrink-0 rounded-full bg-[color:var(--m-dark)]">
      <span className="absolute right-0.5 top-0.5 size-5 rounded-full bg-white shadow-sm" />
    </span>
  );
}

function SettingsPreview() {
  return (
    <div
      role="img"
      aria-label={`Settings with the trust level on ${shown.label}, refunds limited to $100 each and $250 a day, cancellations blocked, and a photo required for damage claims.`}
      className="m-settings"
    >
      <div className="p-5 sm:p-6">
        <p className="text-[14px] font-medium text-[color:var(--m-ink)]">Trust level</p>
        <div className="mt-3 grid grid-cols-3 gap-1 rounded-full bg-[color:var(--m-bg-alt)] p-1">
          {AUTONOMY_TIERS.map((tier) => (
            <span
              key={tier.id}
              className={cn(
                "rounded-full px-2 py-2 text-center text-[13px] sm:text-[14px]",
                tier.id === shown.id
                  ? "bg-white font-medium text-[color:var(--m-ink)] shadow-[0_1px_3px_rgba(27,26,25,0.12)]"
                  : "text-[color:var(--m-ink-3)]",
              )}
            >
              {tier.label}
            </span>
          ))}
        </div>
        <p className="mt-3 text-[14px] text-[color:var(--m-ink-2)]">{shown.blurb}</p>
      </div>

      <div className="border-t border-[color:var(--m-line)] p-5 sm:p-6">
        <p className="text-[14px] font-medium text-[color:var(--m-ink)]">Compensation limits</p>
        <p className="mt-1 text-[13px] text-[color:var(--m-ink-3)]">Never exceeded, even with your approval.</p>
        <dl className="mt-4 grid grid-cols-2 gap-3">
          {[
            ["Largest single", "$100"],
            ["Daily total", "$250"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-[color:var(--m-line)] px-4 py-3">
              <dt className="text-[13px] text-[color:var(--m-ink-3)]">{label}</dt>
              <dd className="mt-1 text-[15px] font-medium tabular-nums text-[color:var(--m-ink)]">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {["Block order cancellations", "Require a photo for damage claims"].map((label) => (
        <div
          key={label}
          className="flex items-center justify-between gap-4 border-t border-[color:var(--m-line)] px-5 py-4 sm:px-6"
        >
          <span className="text-[14px] text-[color:var(--m-ink)]">{label}</span>
          <Toggle />
        </div>
      ))}
    </div>
  );
}

export function Limits() {
  return (
    <section
      aria-labelledby="limits-heading"
      className="mx-auto grid max-w-6xl items-center gap-14 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-2 lg:gap-20"
    >
      <div className="max-w-xl">
        <h2 id="limits-heading" className="m-display m-h2">You decide how much it does alone.</h2>
        <p className="m-lede mt-5 text-[1.125rem]">
          Start with every reply as a draft and give it more room as it earns your trust. Every action
          it takes is logged, along with who approved it.
        </p>
        <Link
          href="/product/security"
          className="mt-8 inline-flex items-center gap-1.5 text-[15px] font-medium text-[color:var(--m-ink)] underline decoration-[color:var(--m-line-strong)] underline-offset-4 transition-colors hover:decoration-[color:var(--m-ink)]"
        >
          How we keep your store safe
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
      <SettingsPreview />
    </section>
  );
}
