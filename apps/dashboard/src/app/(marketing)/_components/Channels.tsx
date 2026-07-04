"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { HandUnderline } from "./HandUnderline";
import { Reveal } from "./Reveal";

const moments: {
  time: string;
  channel: string;
  logo: string;
  side: "left" | "right";
  stampTilt: string;
  body: ReactNode;
  chip?: string;
}[] = [
  {
    time: "7:02 am",
    channel: "iMessage",
    logo: "/logos/imessage.svg",
    side: "left",
    stampTilt: "rotate-[4deg]",
    body: (
      <>
        A sizing question came in at 6:40 — <b>answered from your size guide</b> before you were up.
      </>
    ),
  },
  {
    time: "11:34 am",
    channel: "Telegram",
    logo: "/logos/telegram.svg",
    side: "right",
    stampTilt: "-rotate-[3deg]",
    body: (
      <>
        Caught a wrong address on #3114 <b>before it shipped</b>{" "}— the customer confirmed the
        fix, Shopify&apos;s updated.
      </>
    ),
  },
  {
    time: "4:20 pm",
    channel: "Dashboard",
    logo: "/logos/shopkeeper-shop-logo.png",
    side: "left",
    stampTilt: "rotate-[3deg]",
    body: (
      <>
        You answered &ldquo;do you ship to Canada?&rdquo; once — <b>it&apos;s in the knowledge base
        now.</b> I take it from here.
      </>
    ),
  },
  {
    time: "9:47 pm",
    channel: "iMessage",
    logo: "/logos/imessage.svg",
    side: "right",
    stampTilt: "-rotate-[4deg]",
    body: (
      <>
        Priya&apos;s return window closed yesterday — she&apos;s a 9-order regular, so I&apos;d{" "}
        <b>extend it once.</b> Your call.
      </>
    ),
    chip: "✓ approve with one tap",
  },
];

export function Channels() {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = timelineRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section id="channels" className="mx-auto max-w-6xl scroll-mt-24 border-t border-stone-900/10 px-6 py-24 text-center">
      <Reveal>
        <h2 className="mx-auto mb-5 max-w-[22ch] text-[clamp(36px,5vw,68px)] font-bold leading-[1] tracking-[-0.01em] [font-family:var(--m-caveat)]">
          Reach your new hire from{" "}
          <em className="italic text-[var(--m-quill)]">
            <HandUnderline>wherever you already are.</HandUnderline>
          </em>
        </h2>
        <p className="mx-auto mb-14 max-w-[52ch] text-[16px] leading-relaxed text-stone-700">
          Texting Shopkeeper feels like texting your best employee — because that&apos;s what it is.
        </p>
      </Reveal>

      <div ref={timelineRef} className="relative mx-auto max-w-[660px]">
        <svg
          aria-hidden
          className="absolute left-[18px] top-0 h-full w-10 -translate-x-1/2 sm:left-1/2"
          viewBox="0 0 40 700"
          preserveAspectRatio="none"
        >
          <path
            d="M 20 0 C 27 90 13 180 20 260 C 26 340 14 430 20 510 C 25 580 16 650 20 700"
            pathLength={1}
            strokeWidth={1.5}
            className={`fill-none stroke-stone-900/25 [stroke-dasharray:1] transition-[stroke-dashoffset] duration-[2200ms] ease-out motion-reduce:transition-none ${
              inView ? "[stroke-dashoffset:0]" : "[stroke-dashoffset:1] motion-reduce:[stroke-dashoffset:0]"
            }`}
          />
        </svg>

        {moments.map((m, i) => (
          <div
            key={m.time}
            className={`relative py-6 opacity-0 motion-reduce:opacity-100 sm:py-7 ${
              inView ? "animate-[m-rise_0.7s_ease-out_both] motion-reduce:animate-none" : ""
            }`}
            style={{ animationDelay: `${0.2 + i * 0.35}s` }}
          >
            <span
              className={`mb-2 block pl-12 text-left text-[17px] font-bold leading-none text-stone-500 [font-family:var(--m-caveat)] sm:absolute sm:top-1/2 sm:mb-0 sm:-translate-y-1/2 sm:pl-0 sm:text-[22px] ${
                m.side === "left" ? "sm:left-[calc(50%+28px)]" : "sm:right-[calc(50%+28px)]"
              }`}
            >
              {m.time}
            </span>
            <div className={`pl-12 sm:pl-0 ${m.side === "right" ? "sm:flex sm:justify-end" : ""}`}>
              <div
                className={`relative rounded-2xl border border-stone-900/10 bg-[#fdfbf7] px-[18px] py-4 text-left text-[13.5px] leading-relaxed text-stone-700 shadow-[0_18px_40px_-20px_rgba(22,20,19,0.3),0_4px_12px_-6px_rgba(22,20,19,0.12)] [&_b]:font-semibold [&_b]:text-stone-900 sm:w-[46%] ${
                  m.side === "left" ? "-rotate-[1.2deg]" : "rotate-[1deg]"
                }`}
              >
                <span
                  className={`absolute -top-3.5 right-3.5 grid size-9 place-items-center rounded-lg border border-dashed border-stone-900/35 bg-[#f6f2eb] ${m.stampTilt}`}
                >
                  <Image src={m.logo} alt={`${m.channel} logo`} width={20} height={20} />
                </span>
                {m.body}
                {m.chip && (
                  <span className="mt-2.5 flex w-fit items-center gap-1.5 rounded-full border border-[#2f7a4a]/40 bg-[#2f7a4a]/5 px-2.5 py-1 text-[11.5px] font-semibold text-[#2f7a4a]">
                    {m.chip}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="pt-8 text-[24px] text-[var(--m-quill)] [font-family:var(--m-caveat)]">
        covering the night shift 🌙
      </div>

      <p className="mt-8 flex items-center justify-center gap-2 text-[13.5px] text-stone-500">
        <Image src="/logos/whatsapp-logo.png" alt="WhatsApp logo" width={18} height={18} />
        WhatsApp — one more doorway, coming soon.
      </p>
    </section>
  );
}
