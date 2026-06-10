"use client";

import { useState } from "react";
import { Reveal } from "./Reveal";

const faqs = [
  {
    q: "Will it ever send something embarrassing on my behalf?",
    a: "Not unless you tell it to. By default, Shopkeeper drafts every reply but waits for you to approve. As you build trust you can turn on auto-send for narrow cases like \"send tracking link if order is shipped.\" Everything else still pings you.",
  },
  {
    q: "How does it learn my voice?",
    a: "It reads your last 100 outgoing replies on connect. From then on it learns from every draft you edit before sending.",
  },
  {
    q: "Can I export my data?",
    a: "Yes , full conversation history, customer notes, and tags export to CSV any time. We don't hold your data hostage.",
  },
  {
    q: "What if I don't use Shopify?",
    a: "Inbox + AI drafts work standalone. Shopify-specific actions (refund, address change) only fire if you connect a store.",
  },
  {
    q: "Can multiple team members use Shopkeeper?",
    a: "Yes. Professional includes multi-member access, role-based permissions, and internal notes so teams can align privately before replying.",
  },
  {
    q: "Is my customers' data secure?",
    a: "All customer data is encrypted in transit and at rest. Each organization's data is strictly isolated , no cross-tenant access.",
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      aria-expanded={open}
      className="w-full cursor-pointer border-0 border-t border-solid border-stone-900/10 bg-transparent py-6 text-left [font-family:inherit]"
    >
      <div className="flex items-center justify-between text-[clamp(18px,3vw,24px)] tracking-[-0.01em] [font-family:var(--m-serif)]">
        <span>{q}</span>
        <span className={`ml-4 shrink-0 text-lg font-normal transition-transform duration-200 [font-family:var(--m-mono)] ${open ? "rotate-45" : ""}`}>+</span>
      </div>
      {open && (
        <div className="mt-3 max-h-[200px] overflow-hidden text-sm leading-[1.6] text-stone-700">
          {a}
        </div>
      )}
    </button>
  );
}

export function FAQ() {
  return (
    <section id="faq" className="mx-auto max-w-6xl border-t border-stone-900/10 px-6 py-24 text-center">
      <Reveal>
        <h2 className="mx-auto mb-12 max-w-[20ch] text-[clamp(36px,5vw,68px)] font-normal leading-[1] tracking-[-0.01em] [font-family:var(--m-serif)]">
          Things people ask{" "}
          <em className="italic text-[#9c9285]">before they trust an AI.</em>
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
