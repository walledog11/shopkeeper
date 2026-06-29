import { Reveal } from "./Reveal";
import { GlassLink } from "./GlassLink";

export function CTA() {
  return (
    <div className="px-6 pb-20 pt-6">
      <Reveal className="mx-auto max-w-6xl">
        <div className="m-grain rounded-[40px] bg-[#2b2118] px-8 py-20 text-center text-[#f6f2eb] sm:py-24">
          <h2 className="mx-auto mb-6 max-w-[16ch] text-[clamp(40px,6.5vw,88px)] font-black leading-[0.98] tracking-[-0.02em] [font-family:var(--m-caveat)]">
            Your next hire <em className="italic text-[#cdbfa3]">doesn&apos;t need a desk.</em>
          </h2>
          <p className="mx-auto mb-9 max-w-[44ch] text-base leading-relaxed text-[#f6f2eb]/70">
            Set up in five minutes. Your customers will never know you slept.
          </p>
          <GlassLink href="/signup" variant="light" className="px-7 py-3.5">
            Hire Shopkeeper — start free
          </GlassLink>
          <p className="mt-5 text-[12px] text-[#f6f2eb]/50 [font-family:var(--m-mono)]">
            14 days free · no credit card
          </p>
        </div>
      </Reveal>
    </div>
  );
}
