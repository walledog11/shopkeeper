"use client";

import { useState } from "react";
import { ArrowRight, Check, MessageCircle } from "lucide-react";
import { SectionLabel } from "./SectionLabel";

// Illustrative conversations, grounded in the merchant tools shared by the
// dashboard and iMessage. These controls only select examples.
const tasks = [
  {
    label: "Run a sale",
    prompt: "Take 15% off the whole store for the next 48 hours.",
    response: "The 15% sale is live across your store. It ends in 48 hours. Your regular product prices haven’t changed.",
    title: "Set up the promotion in Shopify.",
    description: "Create an automatic discount across your catalog or on selected product variants. Give it a percentage and duration, then ask it to end the sale early if you need to.",
    details: ["Storewide or selected products", "A set end time", "List or stop active sales"],
    note: "You can also ask for a permanent price change on specific variants. That changes the product price itself; a timed sale uses a discount.",
    record: ["15% automatic discount", "Entire catalog", "Ends in 48 hours"],
  },
  {
    label: "Check stock",
    prompt: "How many sand linen jumpsuits do we have in Small?",
    response: "There are 12 Small / Sand linen jumpsuits in stock.",
    title: "Ask about the products you actually sell.",
    description: "Find a product by name, check its sizes and colors, and read the stock for each variant. Ask what’s running low to get the items at or below your chosen threshold.",
    details: ["Search your Shopify catalog", "Stock by size, color, or variant", "Low-stock checks"],
    note: "Stock checks read your current Shopify inventory. They don’t change inventory quantities or place a replenishment order.",
    record: ["Linen jumpsuit", "Small / Sand", "12 in stock"],
  },
  {
    label: "Change an order",
    prompt: "On Maya’s order #3102, swap the Medium jumpsuit for a Small.",
    response: "Order #3102 is updated: one Small / Sand linen jumpsuit in place of the Medium. The order total is unchanged.",
    title: "Give it the order work directly.",
    description: "Look up a customer or order, add or remove items, change a variant, or correct an address before fulfillment. You can also create a new unpaid order for a customer.",
    details: ["Customer and order lookup", "Item swaps and address corrections", "New orders with payment pending"],
    note: "Shopkeeper checks the order’s state and your configured limits. A shipped item needs a return or exchange rather than an edit to the original order.",
    record: ["Order #3102", "Medium → Small", "Order total unchanged"],
  },
  {
    label: "Work the inbox",
    prompt: "What’s waiting on me?",
    response: "Maya’s size swap is ready for approval. Priya needs an answer about international shipping. Alex’s refund needs you to take over because it’s above your limit.",
    title: "Read, answer, and direct the work.",
    description: "Ask what’s open, read a customer’s conversation, approve or reject a proposed action, or ask for a revised reply. Tell Shopkeeper what to send and it replies on the customer’s existing thread.",
    details: ["Open conversations and pending decisions", "Approve, decline, or revise a plan", "Send a reply or mark a thread as spam"],
    note: "You can also ask what customers have been writing about over the last week or month, including ticket topics, channels, and resolution times.",
    record: ["1 approval", "1 policy question", "1 handoff"],
  },
  {
    label: "Email a customer",
    prompt: "Email jamie@example.com to say their replacement ships tomorrow.",
    response: "Sent to jamie@example.com: their replacement ships tomorrow.",
    title: "Start the conversation when you need to.",
    description: "Ask Shopkeeper to send an email to a specific address, even when there isn’t an existing support ticket. For a customer already in your inbox, it can reply on their original channel.",
    details: ["New outbound emails", "Replies on existing customer threads", "A record of the message and result"],
    note: "Requires a configured outbound email connection. Shopkeeper uses the information you provide; an email doesn’t itself ship or fulfill an order.",
    record: ["jamie@example.com", "Replacement update", "Email sent"],
  },
] as const;

export function MerchantTasks() {
  const [active, setActive] = useState(0);
  const task = tasks[active];

  return (
    <section id="workflow" aria-labelledby="merchant-tasks-heading" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-14">
      <div className="mb-9 text-center">
        <SectionLabel>when you have a job for it</SectionLabel>
        <h2 id="merchant-tasks-heading" className="m-display mx-auto mb-4 max-w-[22ch] text-[clamp(34px,4.5vw,58px)]">
          “Put the store on sale until Sunday.”
        </h2>
        <p className="mx-auto max-w-[63ch] text-[15px] leading-relaxed text-stone-700 sm:text-base">
          You can give Shopkeeper work without waiting for a customer to ask.
          Talk to the same agent from iMessage or the dashboard: it can read your
          store, make supported changes, and tell you what happened.
        </p>
      </div>

      <div role="group" aria-label="Explore things you can ask Shopkeeper" className="mb-7 flex flex-wrap justify-center gap-2">
        {tasks.map((item, index) => (
          <button key={item.label} type="button" aria-pressed={active === index} aria-controls="merchant-task-example"
            onClick={() => setActive(index)}
            className={`min-h-11 rounded-full border px-4 py-2.5 text-[13px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-stone-800 motion-reduce:transition-none ${active === index ? "border-[#2b2118] bg-[#2b2118] text-[#f6f2eb]" : "border-stone-900/15 bg-white/50 text-stone-700 hover:bg-white/80"}`}>
            {item.label}
          </button>
        ))}
      </div>

      <div id="merchant-task-example" className="grid gap-7 lg:grid-cols-[1.05fr_1fr]" aria-live="polite" aria-atomic="true">
        <div className="relative rounded-3xl border border-stone-900/10 bg-[#fdfbf7]/90 p-6 shadow-[0_24px_50px_-32px_rgba(43,33,24,0.45)] sm:p-8">
          <span aria-hidden className="absolute -top-2 left-8 h-[18px] w-20 -rotate-3 rounded-[2px] bg-[#cdb896]/55" />
          <div className="mb-7 flex items-center justify-between gap-3 border-b border-stone-900/10 pb-4 text-xs text-stone-500">
            <span className="flex items-center gap-2"><MessageCircle size={16} aria-hidden />You & Shopkeeper</span>
            <span>Illustrative conversation</span>
          </div>
          <p className="mb-2 text-right text-[11px] text-stone-500">You</p>
          <p className="ml-auto max-w-[90%] rounded-2xl rounded-br-sm bg-[#2b2118] px-5 py-4 text-[15px] leading-relaxed text-[#f6f2eb]">{task.prompt}</p>
          <p className="mb-2 mt-6 text-[11px] text-stone-500">Shopkeeper</p>
          <p className="mr-auto max-w-[95%] rounded-2xl rounded-bl-sm border border-stone-900/10 bg-white/80 px-5 py-4 text-[15px] leading-relaxed text-stone-800">{task.response}</p>
          <div className="mt-7 flex flex-wrap gap-x-4 gap-y-2 border-t border-stone-900/10 pt-4">
            {task.record.map(item => <span key={item} className="flex items-center gap-1.5 text-[11px] text-stone-600"><Check size={12} className="text-[#2f7a4a]" aria-hidden />{item}</span>)}
          </div>
        </div>
        <div className="flex flex-col justify-center py-3 lg:min-h-[420px]">
          <h3 className="text-[32px] leading-tight [font-family:var(--m-hand)]">{task.title}</h3>
          <p className="mt-4 text-[15px] leading-relaxed text-stone-700">{task.description}</p>
          <ul className="mt-5 space-y-3">
            {task.details.map(item => <li key={item} className="flex items-center gap-2.5 text-sm text-stone-800"><ArrowRight size={14} className="shrink-0 text-stone-400" aria-hidden />{item}</li>)}
          </ul>
          <p className="mt-6 border-t border-stone-900/10 pt-4 text-[13px] leading-relaxed text-stone-600">{task.note}</p>
        </div>
      </div>
      <p className="mx-auto mt-5 max-w-[70ch] text-center text-xs leading-relaxed text-stone-500">
        Illustrative conversations with fictional store data.
        Shopify actions require the relevant permissions and follow your workspace limits.
      </p>
    </section>
  );
}
