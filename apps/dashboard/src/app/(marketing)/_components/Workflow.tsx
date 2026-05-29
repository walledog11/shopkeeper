"use client";

import { useState } from "react";

const steps = [
  {
    num: "STEP 01",
    title: 'Customer DMs you "where\'s my order?"',
    body: "Clerk reads it the second it lands. No queue, no delay.",
    vis: (
      <div>
        <div className="mb-3.5 text-xs text-white/60 [font-family:var(--m-mono)]">incoming · 14:42:09</div>
        <div className="rounded-t-xl rounded-br-xl rounded-bl bg-white/10 px-5 py-4 text-[15px] leading-[1.5]">where&apos;s my order? been waiting a week 😩</div>
        <div className="mt-[22px] flex items-center gap-2 text-xs text-orange-500 [font-family:var(--m-mono)]">
          <span className="inline-block size-1.5 shrink-0 rounded-full bg-orange-500" />
          Clerk read it · 0.4s ago
        </div>
      </div>
    ),
  },
  {
    num: "STEP 02",
    title: "It pulls the order, the policy, the history.",
    body: "Shopify order #3019. Shipped 2 days ago. Customer's last 3 messages.",
    vis: (
      <div>
        <div className="mb-3.5 text-xs text-white/60 [font-family:var(--m-mono)]">context loading · 14:42:10</div>
        <div className="grid gap-2 text-xs [font-family:var(--m-mono)]">
          {[
            ["shopify.order(2961)", "→ found"],
            ["usps.track(9400…)", "→ out for delivery"],
            ["history.last(3)", "→ first order"],
            ["policy.shipping", "→ 5-7 day est"],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between rounded-md bg-white/10 px-3 py-[9px]">
              <span>{k}</span>
              <span className="text-orange-500">{v}</span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    num: "STEP 03",
    title: "Drafts a reply in your voice.",
    body: "Trained on the last 100 replies you sent. Same casual tone, same emoji habits.",
    vis: (
      <div>
        <div className="mb-3.5 text-xs text-white/60 [font-family:var(--m-mono)]">drafting · in your voice</div>
        <div className="rounded-t-xl rounded-bl-xl rounded-br border border-solid border-orange-500/50 bg-white/10 px-5 py-4 text-[15px] leading-[1.5]">
          Hey! so sorry for the wait , your order #2961 is out for delivery today, should arrive by 8pm. tracking: usps.com/track/9400… lmk if it doesn&apos;t show up 💛
        </div>
        <div className="mt-3 text-xs text-white/60 [font-family:var(--m-mono)]">tone match: 94% · learned from your last 127 replies</div>
      </div>
    ),
  },
  {
    num: "STEP 04",
    title: "You tap approve. Or you don't.",
    body: "Set up rules so easy ones (tracking links, hours) auto-send. Hard ones wait for you.",
    vis: (
      <div className="text-center">
        <div className="mb-3.5 text-xs text-white/60 [font-family:var(--m-mono)]">awaiting your tap · 14:42:13</div>
        <div className="mb-5 text-[42px] tracking-[-0.02em] [font-family:var(--m-serif)]">approve &amp; send?</div>
        <div className="flex justify-center gap-2">
          <button type="button" className="cursor-pointer rounded-lg border-0 bg-white/10 px-5 py-2.5 text-[13px] text-white [font-family:inherit]">Edit first</button>
          <button type="button" className="cursor-pointer rounded-lg border-0 bg-orange-500 px-5 py-2.5 text-[13px] font-semibold text-white [font-family:inherit]">Send →</button>
        </div>
        <div className="mt-5 text-xs text-white/50 [font-family:var(--m-mono)]">avg time-to-approve: 4.2s</div>
      </div>
    ),
  },
];

export function Workflow() {
  const [active, setActive] = useState(0);

  return (
    <section className="mx-auto max-w-7xl border-t border-solid border-stone-900/10 px-7 py-20">
      <div className="mb-4 flex items-center gap-2.5 text-xs uppercase tracking-[0.15em] text-stone-700 [font-family:var(--m-mono)]">
        <span className="inline-block h-px w-6 bg-stone-700" />
        02 · How it actually works
      </div>
      <h2 className="mb-12 max-w-[18ch] text-[clamp(40px,5vw,72px)] leading-[0.95] tracking-[-0.02em] [font-family:var(--m-serif)]">
        You set the rules.{" "}
        <em className="italic text-green-600">Clerk does the typing.</em>
      </h2>

      {/* Desktop: 2-col */}
      <div className="hidden items-center gap-16 md:grid md:grid-cols-2">
        <ol className="m-0 list-none p-0">
          {steps.map((s, i) => (
            <li
              key={s.num}
              onMouseEnter={() => setActive(i)}
              className={`relative cursor-pointer border-b border-solid border-stone-900/10 py-6 transition-[padding] duration-200 last:border-b-0 ${i === active ? "pl-4" : ""}`}
            >
              {i === active && <span className="absolute bottom-6 left-0 top-6 w-[3px] bg-green-600" />}
              <span className="mb-2 block text-xs text-stone-700 [font-family:var(--m-mono)]">{s.num}</span>
              <h4 className="mb-2 text-[26px] font-normal tracking-[-0.01em] [font-family:var(--m-serif)]">{s.title}</h4>
              <p className="m-0 text-sm leading-[1.5] text-stone-700">{s.body}</p>
            </li>
          ))}
        </ol>
        <div className="relative flex h-[440px] items-center justify-center overflow-hidden rounded-2xl bg-stone-900 p-10 text-stone-100">
          {steps[active].vis}
        </div>
      </div>

      {/* Mobile: stacked */}
      <div className="flex flex-col gap-8 md:hidden">
        {steps.map((s) => (
          <div key={s.num}>
            <span className="mb-2 block text-xs text-stone-700 [font-family:var(--m-mono)]">{s.num}</span>
            <h4 className="mb-2 text-2xl font-normal [font-family:var(--m-serif)]">{s.title}</h4>
            <p className="mb-4 text-sm leading-[1.5] text-stone-700">{s.body}</p>
            <div className="rounded-xl bg-stone-900 p-6 text-stone-100">{s.vis}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
