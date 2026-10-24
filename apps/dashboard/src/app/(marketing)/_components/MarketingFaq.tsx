"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

export type FaqItem = { q: string; a: string };

const cardClassName = "m-card px-6 sm:px-8";

function AccordionFaqItem({ q, a }: FaqItem) {
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

function StaticFaqItem({ q, a }: FaqItem) {
  return (
    <div className="py-6">
      <dt className="text-lg font-medium text-[color:var(--m-ink)]">{q}</dt>
      <dd className="mt-2 text-sm leading-relaxed text-[color:var(--m-ink-2)]">{a}</dd>
    </div>
  );
}

export function MarketingFaq({
  items,
  variant,
}: {
  items: readonly FaqItem[];
  variant: "accordion" | "static";
}) {
  if (variant === "static") {
    return (
      <dl className={`${cardClassName} divide-y divide-[color:var(--m-line)]`}>
        {items.map((item) => (
          <StaticFaqItem key={item.q} {...item} />
        ))}
      </dl>
    );
  }

  return (
    <div className={cardClassName}>
      {items.map((item) => (
        <AccordionFaqItem key={item.q} {...item} />
      ))}
    </div>
  );
}
