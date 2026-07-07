"use client";

import { useState } from "react";
import { Reveal } from "./Reveal";
import { SectionLabel } from "./SectionLabel";

const faqs = [
  {
    q: "Will it ever send something embarrassing on my behalf?",
    a: "Not unless you tell it to. By default, Shopkeeper drafts every reply and waits for your approval — one text on your phone (iMessage or Telegram) or right in the dashboard. As you build trust you can raise its trust level to send simple replies on its own — refunds and cancellations still need your OK.",
  },
  {
    q: "How does it learn my voice?",
    a: "It reads your last 100 outgoing replies on connect. From then on it learns from every draft you edit before sending.",
  },
  {
    q: "Can I export my data?",
    a: "Yes — full conversation history, customer notes, and tags export to CSV any time. We don't hold your data hostage.",
  },
  {
    q: "What if I don't use Shopify?",
    a: "Inbox + AI drafts work standalone. Shopify-specific actions (refund, address change) only fire if you connect a store.",
  },
  {
    q: "Can multiple team members use Shopkeeper?",
    a: "Yes. Pro includes two team seats, and internal notes let your team align privately before replying.",
  },
  {
    q: "Is my customers' data secure?",
    a: "All customer data is encrypted in transit and at rest. Each organization's data is strictly isolated — no cross-tenant access.",
  },
];

/* One ruled row on the notebook sheet — the rule runs full-bleed to the sheet
   edges (negative margins undo the sheet padding), like a printed line. */
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="-ml-14 -mr-6 border-t border-solid border-[#88aac9]/40 pl-14 pr-6 sm:-ml-20 sm:-mr-10 sm:pl-20 sm:pr-10">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center justify-between border-0 bg-transparent py-6 text-left font-sans text-[clamp(17px,2.5vw,21px)] font-semibold tracking-[-0.01em]"
      >
        <span>{q}</span>
        <span className={`ml-4 shrink-0 text-lg font-normal transition-transform duration-200 [font-family:var(--m-mono)] ${open ? "rotate-45" : ""}`}>+</span>
      </button>
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="flex gap-2.5 pb-6 text-sm leading-[1.6] text-stone-700">
            <span aria-hidden className="text-[20px] leading-[1.1] [color:var(--m-pen)] [font-family:var(--m-hand)]">
              A.
            </span>
            <span>{a}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function FAQ() {
  return (
    <section id="faq" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-12 text-center">
      <Reveal>
        <SectionLabel>before you hire</SectionLabel>
        <h2 className="mx-auto mb-12 max-w-[20ch] text-[clamp(36px,5vw,68px)] font-bold leading-[1] tracking-[0.03em] [font-family:var(--m-hand)]">
          Things people ask{" "}
          <em className="italic text-[var(--m-quill)]">before they trust an AI.</em>
        </h2>
      </Reveal>

      <Reveal delay={120} className="mx-auto max-w-[780px] text-left">
        {/* Ruled notebook sheet: pale-blue printed rules, red margin line, taped
            to the desk at the top. Questions are the printed matter; answers come
            back in pen. */}
        <div className="relative rounded-[3px] border border-stone-900/10 bg-[#fcfaf4] pl-14 pr-6 pt-4 shadow-[0_28px_60px_-28px_rgba(43,33,24,0.4),0_8px_20px_-10px_rgba(43,33,24,0.14)] sm:pl-20 sm:pr-10">
          <span
            aria-hidden
            className="absolute -top-2 left-1/2 h-[18px] w-24 -translate-x-1/2 -rotate-[3deg] rounded-[2px] bg-[#cdb896]/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] mix-blend-multiply"
          />
          <span aria-hidden className="absolute inset-y-0 left-9 w-px bg-[#c05a45]/50 sm:left-14" />
          <span aria-hidden className="absolute inset-y-0 left-[calc(2.25rem+3px)] w-px bg-[#c05a45]/25 sm:left-[calc(3.5rem+3px)]" />
          {faqs.map(item => (
            <FaqItem key={item.q} {...item} />
          ))}
          <div className="-ml-14 -mr-6 border-t border-solid border-[#88aac9]/40 pb-5 sm:-ml-20 sm:-mr-10" />
        </div>
      </Reveal>
    </section>
  );
}
