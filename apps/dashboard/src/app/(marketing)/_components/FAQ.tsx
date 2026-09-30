"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Reveal } from "./Reveal";
import { SectionLabel } from "./SectionLabel";

const faqs = [
  {
    q: "Can I ask it to do things, or does it only answer customers?",
    a: "You can give it work directly through iMessage or the dashboard. Ask it to look up a customer, check stock, edit an eligible order, create a timed sale, update a product variant’s price, or email a customer. Incoming customer support is another part of the same product.",
  },
  {
    q: "Will it email a customer without me seeing it?",
    a: "For incoming support, Draft only prepares replies for review. In Ask first, the default, routine information replies can go out automatically, while order changes, money, and exceptions wait for you. Separately, you can instruct the merchant agent to send a message yourself. Actions remain subject to your settings and account permissions.",
  },
  {
    q: "Do I need to use iMessage?",
    a: "No. You can talk to the agent, review proposed actions, answer its questions, and manage conversations in the dashboard. Linking iMessage lets you do that work from your phone, including receiving the optional daily briefing.",
  },
  {
    q: "I don’t use Shopify. What do I get?",
    a: "It can still read your channels and reply using the rules you give it. But refunds, address changes, and exchanges need Shopify. Without it, there’s no order to fix.",
  },
  {
    q: "If I leave, do I get my data?",
    a: "Yes. Store and customer data downloads as JSON. Your action history downloads as CSV. Another store cannot see your customers or orders; see the Privacy Policy and Security page for how logins and isolation work.",
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-[color:var(--m-line)] first:border-t-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center justify-between gap-6 border-0 bg-transparent py-6 text-left"
      >
        <span className="text-[clamp(17px,2.2vw,20px)] font-medium tracking-[-0.01em] text-[color:var(--m-ink)]">{q}</span>
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-full border border-[color:var(--m-line-strong)] text-[color:var(--m-ink)]"
        >
          <Plus className={`size-4 transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-45" : ""}`} />
        </span>
      </button>
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <p className="pb-6 pr-14 text-[15px] leading-[1.65] text-[color:var(--m-ink-2)]">{a}</p>
        </div>
      </div>
    </div>
  );
}

export function FAQ() {
  return (
    <section id="faq" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-16 text-center sm:px-6 sm:py-24">
      <Reveal>
        <SectionLabel>how it works in practice</SectionLabel>
        <h2 className="m-display m-h2 mx-auto mb-12 max-w-[20ch]">
          What you can ask. <span className="m-tail">What happens next.</span>
        </h2>
      </Reveal>

      <Reveal delay={120} className="mx-auto max-w-[780px] text-left">
        <div className="m-card px-6 sm:px-8">
          {faqs.map((item) => (
            <FaqItem key={item.q} {...item} />
          ))}
        </div>
      </Reveal>
    </section>
  );
}
