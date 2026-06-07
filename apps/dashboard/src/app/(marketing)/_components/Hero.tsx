import Link from "next/link";

export function Hero() {
  return (
    <section className="pt-20 px-10 pb-12 max-w-3xl mx-auto text-center" >
      
      {/* Headline */}
      <h1 className="mx-auto mb-6 mt-0 max-w-[14ch] [font-family:var(--m-serif)] font-normal text-[clamp(48px,7vw,108px)] leading-[0.92] tracking-[-0.03em]">
        Your DMs answered themselves{" "}
        <em className="font-italic text-green-700" >while you slept.</em>
      </h1>

      {/* Subtitle */}
      <p className="text-md text-stone-800 leading-relaxed max-w-[52ch] mx-auto mb-6" >
        Shopkeeper is an AI support agent for Shopify brands. It reads every Instagram DM, email, and SMS , drafts replies that actually sound like you, and only sends after you tap approve.
      </p>

      {/* CTAs */}
      <div className="flex flex-wrap gap-5 align-center mb-3 justify-center" >
        <Link href="/signup" className="inline-flex align-center gap-3 py-2 px-4 rounded-full text-white text-sm bg-slate-900 font-semibold border border-solid border-black " >
          Start free , 14 days
        </Link>
        <Link href="#demo" className="inline-flex align-center gap-3 py-2 px-4 rounded-full text-sm font-semibold border border-solid border-stone-900/10 text-stone-900 " >
          ▶ Watch a 90s walkthrough
        </Link>
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap justify-center gap-14 text-sm text-slate-800 mt-7" >
        {["No credit card", "Connect Shopify in 2 min", "Cancel any time"].map((item) => (
          <span key={item} className="inline-flex items-center gap-1.5">
            <span className="inline-flex align-center justify-center text-xs size-4 rounded-full bg-green-700 text-white" >✓</span>
            {item}
          </span>
        ))}
      </div>
    </section>
  );
}
