import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ProductDetailTemplate } from "../../_components/ProductDetailTemplate";

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
    title: "Find the order before answering",
    body: "Use Shopify order, customer, fulfillment, tracking, product, and inventory context to understand what is possible.",
    details: [
      "Look up orders, fulfillment, and tracking",
      "Check customer and order context",
      "Confirm product variants and inventory",
      "Read the current fulfillment state",
    ],
  },
  {
    title: "Prepare the exact Shopify work",
    body: "When the order is eligible, Shopkeeper can build the requested change and show the merchant what will happen before execution.",
    details: [
      "Correct a shipping address before fulfillment",
      "Add, remove, or swap order items",
      "Update customer information",
      "Add notes to the Shopify record",
    ],
  },
  {
    title: "Carry the request through resolution",
    body: "Supported exception workflows keep the Shopify result, customer response, and action history connected.",
    details: [
      "Issue an exact full-order refund within configured limits",
      "Cancel an eligible unfulfilled order",
      "Create a return or exchange",
      "Create a gift card or attach a return label",
      "Fulfill an order with tracking information",
    ],
  },
] as const;

const workflow = [
  ["Understand the request", "Match the customer to the order and identify the requested outcome."],
  ["Check eligibility", "Read fulfillment, inventory, price, policy, and configured action limits."],
  ["Prepare the action", "Show the exact Shopify change and explain why it is being proposed."],
  ["Ask when required", "Pause consequential or exceptional work for merchant judgment."],
  ["Execute and close the loop", "Update Shopify, send the customer response, and record the outcome."],
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

function OrderWorkflowWalkthrough() {
  return (
    <div className="rounded-3xl bg-[#2b2118] px-6 py-10 text-[#f6f2eb] sm:px-10 sm:py-14">
      <div className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#f6f2eb]/55">Seeded walkthrough · Order #3102</p>
        <h2 className="m-display mt-3 text-[clamp(36px,5vw,62px)]">
          Swap Medium to Small before fulfillment.
        </h2>
        <p className="mt-4 text-sm leading-relaxed text-[#f6f2eb]/65">
          Fictional customer and store data illustrate the intended product path without presenting a customer result.
        </p>
      </div>
      <ol className="mt-9 grid gap-3 md:grid-cols-5">
        {workflow.map(([step, body], index) => (
          <li key={step} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <span className="text-xs font-semibold text-[#f6f2eb]/40">0{index + 1}</span>
            <h3 className="mt-3 text-[21px] font-bold leading-none [font-family:var(--m-hand)]">{step}</h3>
            <p className="mt-3 text-[13px] leading-relaxed text-[#f6f2eb]/65">{body}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function OrderOperationsPage() {
  return (
    <ProductDetailTemplate
      eyebrow="order operations"
      title="Customer support that can finish the Shopify work."
      lede="Shopkeeper understands the request, checks the live order, prepares the supported action, asks when merchant judgment is required, and keeps the Shopify result tied to the customer response."
      jumpLabel="Follow an order change"
      visual={<OrderWorkflowWalkthrough />}
      capabilitiesLabel="supported work"
      capabilitiesTitle="More than an answer in a chat bubble."
      capabilitiesBody="Order operations span reading the situation, preparing the exact Shopify change, and carrying exceptions through to a recorded result."
      capabilities={actionGroups}
      workflowLabel="approval boundaries"
      workflowTitle="Control is decided before execution."
      workflowSteps={[
        ["Follow the selected autonomy mode", "Straightforward information replies may move without approval when the workspace settings allow it."],
        ["Pause for merchant judgment", "Order changes, money, and exceptions arrive with the affected order and proposed action visible."],
        ["Block or escalate", "Ineligible orders, disabled actions, and work beyond configured limits do not proceed by improvisation."],
      ]}
      requirementsTitle="Shopify provides the action layer."
      requirementsBody="Connect Shopify for order, customer, product, inventory, and fulfillment context. Add store policies, select an autonomy mode, set action limits, and connect the customer and merchant channels used by the workflow."
      requirements={[
        "Shopify connected for order, customer, and fulfillment context",
        "Store policies and action limits configured",
        "An autonomy mode selected for the workspace",
        "Customer intake and merchant approval channels connected",
      ]}
      requirementsFooter={
        <Link
          href="/product/approvals-and-controls"
          className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-stone-800 underline decoration-stone-300 underline-offset-4 hover:text-stone-950"
        >
          Explore approval modes and limits
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      }
      relatedLinks={relatedLinks}
      faqLabel="order operations faq"
      faqTitle="What happens at the edge cases?"
      faqs={faqs}
    />
  );
}
