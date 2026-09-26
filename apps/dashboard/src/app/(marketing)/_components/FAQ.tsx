"use client";

import { useState } from "react";
import { Reveal } from "./Reveal";
import { SectionLabel } from "./SectionLabel";

const faqs = [
  {
    q: "Can I ask it to do things, or does it only answer customers?",
    a: "You can give it work directly through iMessage or the dashboard. Ask it to look up a customer, check stock, edit an eligible order, create a timed sale, update a product variant’s price, or email a customer. Incoming customer support is another part of the same product.",
  },
  {
    q: "What does “run a sale” actually do?",
    a: "It creates an automatic percentage discount in Shopify for your whole catalog or specified variants, with an end time. Regular product prices stay unchanged. You can ask it to list or end active sales. Permanent price changes are a separate action on specific variants. These actions require the relevant Shopify permissions.",
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
    q: "Will it sound like me, or like a robot?",
    a: "It learns from the edits you make to its drafts. After enough of them it proposes a new voice brief. Nothing changes until you read it and say yes.",
  },
  {
    q: "If I leave, do I get my data?",
    a: "Yes. Store and customer data downloads as JSON. Your action history downloads as CSV.",
  },
  {
    q: "I don’t use Shopify. What do I get?",
    a: "It can still read your channels and reply using the rules you give it. But refunds, address changes, and exchanges need Shopify. Without it, there’s no order to fix.",
  },
  {
    q: "Where do my customers actually reach it?",
    a: "Through Gmail, forwarded support email, website chat, or an available Instagram connection. Instagram requires a Professional account. Check your workspace’s Integrations page for channel availability. Your own iMessage conversation is with your agent; customer conversations stay in their support channels.",
  },
  {
    q: "What if it doesn’t know the answer?",
    a: "If a missing store fact or judgment call would unblock a customer request, it asks you. If the request is outside its limits or it cannot complete the action, it hands the thread to you. You can inspect the context, correct the reply, and take over. Use Draft only while you evaluate its customer replies.",
  },
  {
    q: "Can another store see my customers?",
    a: "No. Your customers and your orders are yours alone. Your Shopify and Instagram logins are encrypted before they’re stored. You can download your data yourself.",
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
        <SectionLabel>how it works in practice</SectionLabel>
        <h2 className="mx-auto mb-12 max-w-[20ch] text-[clamp(36px,5vw,68px)] font-bold leading-[1] tracking-[0.03em] [font-family:var(--m-hand)]">
          What you can ask.{" "}
          <em className="italic text-[var(--m-quill)]">What happens next.</em>
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
