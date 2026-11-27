import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ROUTINE_REPLY_CHOICES } from "@/lib/agent/autonomy-tiers";
import { cn } from "@/lib/ui/cn";

// The labels are the app's own settings, so the page shows what a merchant will
// find there.
const shown = ROUTINE_REPLY_CHOICES.find((choice) => choice.recommended) ?? ROUTINE_REPLY_CHOICES[0];

function Toggle() {
  return (
    <span className="relative inline-flex h-6 w-10 shrink-0 rounded-full bg-[color:var(--m-dark)]">
      <span className="absolute right-0.5 top-0.5 size-5 rounded-full bg-white shadow-sm" />
    </span>
  );
}

export function SettingsPreview() {
  return (
    <div
      role="img"
      aria-label={`Settings set to answer routine questions on its own, refunds limited to $100, cancellations blocked, and a photo required before any damage refund.`}
      className="m-settings"
    >
      <div className="p-5 sm:p-6">
        <p className="text-[14px] font-medium text-[color:var(--m-ink)]">Answer routine questions on its own?</p>
        <div className="mt-3 grid grid-cols-2 gap-1 rounded-full bg-[color:var(--m-bg-alt)] p-1">
          {ROUTINE_REPLY_CHOICES.map((choice) => (
            <span
              key={choice.tier}
              className={cn(
                "rounded-full px-2 py-2 text-center text-[13px] sm:text-[14px]",
                choice === shown
                  ? "bg-white font-medium text-[color:var(--m-ink)] shadow-[0_1px_3px_rgba(27,26,25,0.12)]"
                  : "text-[color:var(--m-ink-3)]",
              )}
            >
              {choice.label}
            </span>
          ))}
        </div>
        <p className="mt-3 text-[14px] text-[color:var(--m-ink-2)]">Refunds, cancellations and order changes always wait for your OK.</p>
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-[color:var(--m-line)] px-5 py-4 sm:px-6">
        <span className="text-[14px] text-[color:var(--m-ink)]">Never refund more than</span>
        <span className="rounded-xl border border-[color:var(--m-line)] px-4 py-2 text-[15px] font-medium tabular-nums text-[color:var(--m-ink)]">$100</span>
      </div>

      {["Never cancel orders", "Ask for a photo before any damage refund"].map((label) => (
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
          Choose whether it answers routine questions on its own or shows you every reply first.
          Every action it takes is logged, along with who approved it.
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
