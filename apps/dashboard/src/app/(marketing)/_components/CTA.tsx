import Link from "next/link";
import { Reveal } from "./Reveal";

export function CTA() {
  return (
    <div className="px-6 pb-20 pt-6">
      <Reveal className="mx-auto max-w-6xl">
        <div className="m-grain rounded-[40px] bg-[#2b2118] px-8 py-20 text-center text-[#f6f2eb] sm:py-24">
          <h2 className="mx-auto mb-6 max-w-[16ch] text-[clamp(40px,6.5vw,88px)] font-normal leading-[0.98] tracking-[-0.02em] [font-family:var(--m-serif)]">
            Your next hire <em className="italic text-[#cdbfa3]">doesn&apos;t need a desk.</em>
          </h2>
          <p className="mx-auto mb-9 max-w-[44ch] text-base leading-relaxed text-[#f6f2eb]/70">
            Set up in five minutes. Your customers will never know you slept.
          </p>
          <Link
            href="/signup"
            className="inline-flex items-center rounded-full bg-[#f6f2eb] px-7 py-3.5 text-sm font-semibold text-stone-900 no-underline transition-[background-color,transform] duration-200 hover:-translate-y-0.5 hover:bg-white"
          >
            Hire Shopkeeper — start free
          </Link>
          <p className="mt-5 text-[12px] text-[#f6f2eb]/50 [font-family:var(--m-mono)]">
            14 days free · no credit card
          </p>
        </div>
      </Reveal>
    </div>
  );
}
