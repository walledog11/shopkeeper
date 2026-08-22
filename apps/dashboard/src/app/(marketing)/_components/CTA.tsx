import { GlassLink } from "./GlassLink";
import { NAV_CTA_LABEL } from "@/lib/brand";

export function CTA() {
  return (
    <section className="px-5 pb-20 pt-8 sm:px-6 md:pb-28 md:pt-16">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-[#2b2118] px-6 py-12 text-[#f6f2eb] shadow-[0_38px_90px_-56px_rgba(22,20,19,0.9)] sm:px-10 sm:py-16 lg:px-14">
        <div aria-hidden className="absolute inset-0 opacity-20 [background:radial-gradient(circle_at_80%_20%,rgba(255,255,255,0.28),transparent_34%)]" />
        <div className="relative grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#f6f2eb]/45">Ready when the next message arrives</p>
            <h2 className="m-display mt-5 max-w-[13ch] text-[clamp(2.2rem,5vw,4.6rem)] text-[#f6f2eb]">
              Hand off the next support message.
            </h2>
            <p className="mt-5 max-w-[52ch] text-[15px] leading-relaxed text-[#f6f2eb]/60">
              Connect Shopify, choose where customers reach you, and keep approval exactly where you want it.
            </p>
          </div>
          <div className="lg:text-right">
            <GlassLink href="/signup" variant="light" className="min-h-12 justify-center px-6 py-3">
              {NAV_CTA_LABEL}
            </GlassLink>
            <p className="mt-3 text-[12px] text-[#f6f2eb]/40">14 days free · card at plan checkout</p>
          </div>
        </div>
      </div>
    </section>
  );
}
