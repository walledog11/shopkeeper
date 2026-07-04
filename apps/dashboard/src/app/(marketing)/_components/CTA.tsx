import { Reveal } from "./Reveal";

export function CTA() {
  return (
    <div className="px-6 pb-20 pt-6">
      <Reveal className="mx-auto max-w-5xl">
        <div className="m-torn-paper bg-[length:100%_100%] px-8 py-20 text-center sm:flex sm:aspect-[3842/2724] sm:flex-col sm:items-center sm:justify-center sm:bg-contain sm:py-0">
          <h2 className="mx-auto mb-3 max-w-[15ch] -rotate-[2deg] text-[clamp(56px,9vw,116px)] font-normal leading-[0.9] text-stone-900 [font-family:var(--m-hand)]">
            Your next hire doesn&apos;t need a desk.
          </h2>
          <p className="mx-auto mb-8 max-w-[46ch] text-[clamp(22px,3vw,32px)] leading-[1.05] text-stone-600 [font-family:var(--m-hand)]">
            Set up in five minutes. Your customers will never know you slept.
          </p>
          <a
            href="/signup"
            className="inline-flex rounded-full bg-white px-8 py-3 text-[clamp(22px,2.6vw,28px)] leading-none text-stone-900 shadow-[0_10px_24px_-10px_rgba(43,33,24,0.4)] transition-transform duration-200 hover:-translate-y-0.5 [font-family:var(--m-hand)]"
          >
            Hire Shopkeeper — start free
          </a>
        </div>
      </Reveal>
    </div>
  );
}
