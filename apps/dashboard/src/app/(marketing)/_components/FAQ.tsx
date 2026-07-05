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

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-solid border-stone-900/10">
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
          <div className="pb-6 text-sm leading-[1.6] text-stone-700">{a}</div>
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
        {faqs.map(item => (
          <FaqItem key={item.q} {...item} />
        ))}
        <div className="border-t border-solid border-stone-900/10" />
      </Reveal>
    </section>
  );
}
