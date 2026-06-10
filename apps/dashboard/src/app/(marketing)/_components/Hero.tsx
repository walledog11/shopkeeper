import Link from "next/link";

function rise(delayMs: number) {
  return {
    animation: "m-rise 0.7s ease-out both",
    animationDelay: `${delayMs}ms`,
  } as React.CSSProperties;
}

export function Hero() {
  return (
    <section className="relative isolate px-6 pb-20 pt-16 text-center sm:pt-24">
      {/* Soft watercolor wash behind the hero */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[12%] -z-10 h-[720px] w-[1100px] max-w-none -translate-x-1/2 blur-2xl bg-[radial-gradient(55%_45%_at_50%_30%,rgba(168,190,202,0.4),transparent_70%),radial-gradient(45%_40%_at_25%_75%,rgba(208,190,160,0.45),transparent_70%),radial-gradient(45%_40%_at_78%_70%,rgba(170,184,162,0.35),transparent_70%)]"
      />

      <p
        className="mb-5 text-xs font-medium uppercase tracking-[0.18em] text-stone-500 [font-family:var(--m-mono)]"
        style={rise(0)}
      >
        ✦ AI support for Shopify brands
      </p>

      <h1
        className="mx-auto mb-6 max-w-[16ch] text-[clamp(48px,8vw,104px)] font-normal leading-[0.95] tracking-[-0.02em] [font-family:var(--m-serif)]"
        style={rise(80)}
      >
        Meet Shopkeeper, <em className="italic text-[#9c9285]">your newest employee.</em>
      </h1>

      <p
        className="mx-auto mb-8 max-w-[52ch] text-[17px] leading-relaxed text-stone-700"
        style={rise(160)}
      >
        It answers your customers on Instagram, email, and SMS — in your voice, with your store&apos;s
        real order data — and texts you when something needs a human. You approve; it does the typing.
      </p>

      <div className="mb-5 flex flex-wrap items-center justify-center gap-3" style={rise(240)}>
        <Link
          href="/signup"
          className="inline-flex items-center rounded-full bg-[#2b2118] px-6 py-3 text-sm font-semibold text-[#f6f2eb] no-underline transition-[background-color,transform] duration-200 hover:-translate-y-0.5 hover:bg-[#43352a]"
        >
          Hire Shopkeeper — free for 14 days
        </Link>
        <Link
          href="#how"
          className="inline-flex items-center rounded-full border border-stone-900/15 px-6 py-3 text-sm font-semibold text-stone-900 no-underline transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-stone-900/35"
        >
          Watch it work ↓
        </Link>
      </div>

      <div
        className="mb-14 flex flex-wrap justify-center gap-x-8 gap-y-2 text-[13px] text-stone-600"
        style={rise(320)}
      >
        {["No credit card", "Shopify connects in 2 min", "Cancel anytime"].map((item) => (
          <span key={item} className="inline-flex items-center gap-1.5">
            <span className="grid size-4 place-items-center rounded-full bg-[#2b2118] text-[9px] text-[#f6f2eb]">✓</span>
            {item}
          </span>
        ))}
      </div>

      <div style={rise(420)}>
        {/* Raw HTML so the `muted` attribute is present at parse time — React only sets
            the property, and the browser blocks autoplay on a not-yet-muted video. */}
        <div
          dangerouslySetInnerHTML={{
            __html: `<video src="https://cfkjygwgphgv2dom.public.blob.vercel-storage.com/demo-film.mp4" autoplay muted loop playsinline class="mx-auto w-full max-w-[880px] rounded-[28px] bg-[#f6f2eb] shadow-[0_40px_80px_-30px_rgba(22,20,19,0.4)]"></video>`,
          }}
        />
        <p className="mt-6 text-[13px] text-stone-500 [font-family:var(--m-mono)]">
          ↑ 38 seconds of your newest employee at work
        </p>
      </div>
    </section>
  );
}
