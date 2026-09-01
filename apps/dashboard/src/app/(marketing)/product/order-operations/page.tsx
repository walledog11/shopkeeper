import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, CircleAlert, LockKeyhole } from "lucide-react";
import { CTA } from "../../_components/CTA";
import { Footer } from "../../_components/Footer";
import { MarginThread } from "../../_components/MarginThread";
import { Navbar } from "../../_components/Navbar";
import { RelatedLinks } from "../../_components/RelatedLinks";
import { SectionLabel } from "../../_components/SectionLabel";

const title = "Order operations — Shopkeeper";
const description =
  "See how Shopkeeper prepares and completes supported Shopify order work while keeping consequential actions under merchant control.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/product/order-operations" },
  openGraph: {
    title,
    description,
    url: "/product/order-operations",
  },
  twitter: { title, description },
};

const actionGroups = [
  {
    eyebrow: "Read the situation",
    title: "Find the order before answering",
    body: "Use Shopify order, customer, fulfillment, tracking, product, and inventory context to understand what is possible.",
    actions: [
      "Look up orders, fulfillment, and tracking",
      "Check customer and order context",
      "Confirm product variants and inventory",
      "Read the current fulfillment state",
    ],
  },
  {
    eyebrow: "Change the order",
    title: "Prepare the exact Shopify work",
    body: "When the order is eligible, Shopkeeper can build the requested change and show the merchant what will happen before execution.",
    actions: [
      "Correct a shipping address before fulfillment",
      "Add, remove, or swap order items",
      "Update customer information",
      "Add notes to the Shopify record",
    ],
  },
  {
    eyebrow: "Resolve the exception",
    title: "Carry the request through resolution",
    body: "Supported exception workflows keep the Shopify result, customer response, and action history connected.",
    actions: [
      "Issue an exact full-order refund within configured limits",
      "Cancel an eligible unfulfilled order",
      "Create a return or exchange",
      "Create a gift card or attach a return label",
      "Fulfill an order with tracking information",
    ],
  },
] as const;

const workflow = [
  ["1", "Understand the request", "Match the customer to the order and identify the requested outcome."],
  ["2", "Check eligibility", "Read fulfillment, inventory, price, policy, and configured action limits."],
  ["3", "Prepare the action", "Show the exact Shopify change and explain why it is being proposed."],
  ["4", "Ask when required", "Pause consequential or exceptional work for merchant judgment."],
  ["5", "Execute and close the loop", "Update Shopify, send the customer response, and record the outcome."],
] as const;

const decisionStates = [
  {
    icon: Check,
    tone: "text-[#2f7a4a] bg-[#2f7a4a]/10",
    label: "Routine and safe",
    title: "Follow the selected autonomy mode",
    body: "Straightforward information replies may move without approval when the workspace settings allow it.",
  },
  {
    icon: CircleAlert,
    tone: "text-amber-800 bg-amber-700/10",
    label: "Consequential or exceptional",
    title: "Pause for merchant judgment",
    body: "Order changes, money, and exceptions arrive with the affected order and proposed action visible.",
  },
  {
    icon: LockKeyhole,
    tone: "text-[#b0472f] bg-[#b0472f]/10",
    label: "Outside the rules",
    title: "Block or escalate",
    body: "Ineligible orders, disabled actions, and work beyond configured limits do not proceed by improvisation.",
  },
] as const;

const relatedLinks = [
  { href: "/product/customer-support", label: "Customer support", body: "See how context, replies, policy knowledge, and voice fit together." },
  { href: "/product/approvals-and-controls", label: "Approvals and controls", body: "Understand autonomy modes, limits, decisions, and action history." },
  { href: "/product/integrations", label: "Integrations", body: "Understand what each connected surface contributes to the system." },
] as const;

const faqs = [
  {
    q: "Does Shopkeeper change every order automatically?",
    a: "No. Draft only never sends or changes Shopify. Ask first is the default: routine replies can keep moving, while changes, money, and exceptions pause for merchant approval. Other behavior requires explicit workspace configuration.",
  },
  {
    q: "What happens if an order is already fulfilled?",
    a: "Shopkeeper checks the current order and fulfillment state before proposing work. If the requested edit is no longer eligible, it blocks or escalates instead of forcing the mutation.",
  },
  {
    q: "Can it issue any refund amount?",
    a: "Refund behavior follows configured limits. The supported refund path creates an exact full-order refund when the order and configured cap allow it; work outside the rules pauses or escalates.",
  },
  {
    q: "Will the customer know what changed?",
    a: "The workflow can pair the completed Shopify result with a customer response through the connected support channel, subject to the selected autonomy and approval settings.",
  },
  {
    q: "Can I review what happened later?",
    a: "Yes. The action history records proposed, approved, and executed work so the merchant can review the decision and outcome.",
  },
] as const;

export default function OrderOperationsPage() {
  return (
    <main className="relative">
      <MarginThread />
      <Navbar />

      <article>
        <header className="mx-auto max-w-6xl px-6 pb-16 pt-16 text-center sm:pt-24">
          <Link
            href="/"
            className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-stone-600 underline decoration-stone-300 underline-offset-4 hover:text-stone-900"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back to overview
          </Link>
          <SectionLabel>order operations</SectionLabel>
          <h1 className="mx-auto max-w-[18ch] text-[clamp(48px,7vw,88px)] font-bold leading-[0.95] tracking-[0.03em] [font-family:var(--m-hand)]">
            Customer support that can finish the Shopify work.
          </h1>
          <p className="mx-auto mt-7 max-w-[62ch] text-[16px] leading-relaxed text-stone-700 sm:text-[18px]">
            Shopkeeper understands the request, checks the live order, prepares the supported action,
            asks when merchant judgment is required, and keeps the Shopify result tied to the customer response.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Link href="/signup" className="m-glass-btn m-glass-btn-primary px-6 py-3">
              Start free trial
            </Link>
            <Link href="#workflow" className="m-glass-btn m-glass-btn-outline px-6 py-3">
              Follow an order change
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </header>

        <section aria-labelledby="capabilities-heading" className="mx-auto max-w-6xl px-6 py-14">
          <div className="mb-10 text-center">
            <SectionLabel>supported work</SectionLabel>
            <h2 id="capabilities-heading" className="mx-auto max-w-[20ch] text-[clamp(36px,5vw,64px)] font-bold leading-none [font-family:var(--m-hand)]">
              More than an answer in a chat bubble.
            </h2>
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            {actionGroups.map((group) => (
              <div key={group.title} className="rounded-2xl border border-stone-900/10 bg-[#fdfbf7]/90 p-6 shadow-[0_18px_38px_-30px_rgba(22,20,19,0.6)]">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-stone-500">{group.eyebrow}</p>
                <h3 className="mt-3 text-[28px] font-bold leading-none [font-family:var(--m-hand)]">{group.title}</h3>
                <p className="mt-4 text-sm leading-relaxed text-stone-600">{group.body}</p>
                <ul className="mt-6 space-y-3 text-sm text-stone-700">
                  {group.actions.map((action) => (
                    <li key={action} className="flex items-start gap-2.5">
                      <Check className="mt-0.5 size-4 shrink-0 text-[#2f7a4a]" strokeWidth={2} aria-hidden />
                      {action}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section id="workflow" aria-labelledby="order-workflow-heading" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-14">
          <div className="rounded-3xl bg-[#2b2118] px-6 py-10 text-[#f6f2eb] sm:px-10 sm:py-14">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#f6f2eb]/55">Seeded walkthrough · Order #3102</p>
              <h2 id="order-workflow-heading" className="mt-3 text-[clamp(36px,5vw,62px)] font-bold leading-none [font-family:var(--m-hand)]">
                Swap Medium to Small before fulfillment.
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-[#f6f2eb]/65">
                Fictional customer and store data illustrate the intended product path without presenting a customer result.
              </p>
            </div>
            <ol className="mt-9 grid gap-3 md:grid-cols-5">
              {workflow.map(([number, step, body]) => (
                <li key={number} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <span className="text-xs font-semibold text-[#f6f2eb]/40">0{number}</span>
                  <h3 className="mt-3 text-[21px] font-bold leading-none [font-family:var(--m-hand)]">{step}</h3>
                  <p className="mt-3 text-[13px] leading-relaxed text-[#f6f2eb]/65">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="controls-heading" className="mx-auto max-w-6xl px-6 py-14">
          <div className="mb-10 text-center">
            <SectionLabel>approval boundaries</SectionLabel>
            <h2 id="controls-heading" className="mx-auto max-w-[20ch] text-[clamp(36px,5vw,64px)] font-bold leading-none [font-family:var(--m-hand)]">
              Control is decided before execution.
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {decisionStates.map(({ icon: Icon, tone, label, title: stateTitle, body }) => (
              <div key={label} className="rounded-2xl border border-stone-900/10 bg-[#fdfbf7]/90 p-6">
                <span className={`grid size-10 place-items-center rounded-full ${tone}`}>
                  <Icon className="size-5" aria-hidden />
                </span>
                <p className="mt-5 text-xs font-semibold uppercase tracking-[0.1em] text-stone-500">{label}</p>
                <h3 className="mt-2 text-[25px] font-bold leading-none [font-family:var(--m-hand)]">{stateTitle}</h3>
                <p className="mt-3 text-sm leading-relaxed text-stone-600">{body}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 text-center">
            <Link
              href="/product/approvals-and-controls"
              className="inline-flex items-center gap-2 text-sm font-semibold text-stone-800 underline decoration-stone-300 underline-offset-4 hover:text-stone-950"
            >
              Explore approval modes and limits
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </section>

        <section aria-labelledby="requirements-heading" className="mx-auto max-w-4xl px-6 py-14">
          <div className="rounded-2xl border border-stone-900/10 bg-white/40 p-6 sm:p-9">
            <SectionLabel>what it needs</SectionLabel>
            <h2 id="requirements-heading" className="text-[clamp(34px,5vw,54px)] font-bold leading-none [font-family:var(--m-hand)]">
              Shopify provides the action layer.
            </h2>
            <p className="mt-5 text-[15px] leading-relaxed text-stone-700">
              Connect Shopify for order, customer, product, inventory, and fulfillment context. Add store
              policies, select an autonomy mode, set action limits, and connect the customer and merchant
              channels used by the workflow.
            </p>
          </div>
        </section>

        <RelatedLinks links={relatedLinks} />

        <section aria-labelledby="order-faq-heading" className="mx-auto max-w-4xl px-6 py-14">
          <div className="mb-9 text-center">
            <SectionLabel>order operations faq</SectionLabel>
            <h2 id="order-faq-heading" className="text-[clamp(36px,5vw,60px)] font-bold leading-none [font-family:var(--m-hand)]">
              What happens at the edge cases?
            </h2>
          </div>
          <dl className="divide-y divide-stone-900/10 rounded-2xl border border-stone-900/10 bg-[#fdfbf7]/80 px-6 sm:px-8">
            {faqs.map((item) => (
              <div key={item.q} className="py-6">
                <dt className="text-lg font-semibold text-stone-900">{item.q}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-stone-600">{item.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      </article>

      <CTA />
      <Footer />
    </main>
  );
}
