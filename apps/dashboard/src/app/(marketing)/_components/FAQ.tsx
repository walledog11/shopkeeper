"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Plus } from "lucide-react";

const faqs = [
  {
    q: "Which channels does Clerk support?",
    a: "Clerk supports Instagram DM, Email, SMS (via Twilio), and Shopify today. TikTok is already in the channel roadmap and marked as coming soon. Most channels connect in minutes.",
  },
  {
    q: "Does it connect to my Shopify store?",
    a: "Yes. Clerk connects via Shopify OAuth and pulls order context directly into tickets, so your team and the AI can respond without switching tabs.",
  },
  {
    q: "What if the AI gives a wrong answer?",
    a: "Clerk runs human-in-the-loop by default. The agent proposes a plan, you can disable steps, and nothing customer-facing is sent without approval unless you explicitly enable automation.",
  },
  {
    q: "Can I manage tickets from my phone?",
    a: "Yes. Team members can use SMS or WhatsApp to instruct the AI agent, approve plans, and handle urgent support without opening the dashboard.",
  },
  {
    q: "Can I use my own email domain?",
    a: "Yes. You connect your existing business email (Gmail, or any email via Postmark). Replies go out from your domain and customer replies route back to Clerk automatically.",
  },
  {
    q: "Is my customers' data secure?",
    a: "All customer data is encrypted in transit and at rest. Each organization's data is strictly isolated — no cross-tenant access. We use Neon PostgreSQL with row-level security.",
  },
  {
    q: "Can multiple team members use Clerk?",
    a: "Yes. Professional includes multi-member access, role-based permissions, and internal notes so teams can align privately before replying.",
  },
  {
    q: "Does Clerk auto-organize tickets?",
    a: "Yes. Clerk auto-triages with tags and thread statuses (Open, Pending, Closed) so the inbox stays organized instead of purely chronological.",
  },
];

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-slate-100 last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-4 py-5 text-left group"
      >
        <span className="text-sm sm:text-base font-semibold text-slate-800 group-hover:text-slate-600 transition-colors">
          {q}
        </span>
        <div className={`shrink-0 w-6 h-6 rounded-full border border-slate-200 flex items-center justify-center transition-transform duration-300 ${open ? "rotate-45 bg-slate-900 border-slate-900" : "bg-white"}`}>
          <Plus className={`w-3 h-3 transition-colors ${open ? "text-white" : "text-slate-500"}`} />
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <p className="pb-5 text-sm text-slate-500 leading-relaxed max-w-2xl">
              {a}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function FAQ() {
  return (
    <section id="faq" className="relative w-full py-24">
      <div className="container mx-auto px-4 md:px-6 max-w-3xl">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
            Frequently asked questions
          </h2>
          <p className="mt-4 text-base text-slate-500">
            Have more questions?{" "}
            <a href="mailto:hello@useclerk.co" className="text-slate-800 font-semibold underline underline-offset-2 hover:text-slate-600 transition-colors">
              Reach out to us.
            </a>
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm px-6 sm:px-8">
          {faqs.map((item) => (
            <FAQItem key={item.q} {...item} />
          ))}
        </div>
      </div>
    </section>
  );
}
