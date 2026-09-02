import type { Metadata } from "next";
import { Check, MessageCircle, PackageSearch, Sparkles } from "lucide-react";
import { ProductDetailTemplate } from "../../_components/ProductDetailTemplate";

const title = "Customer support — Shopkeeper";
const description =
  "See how Shopkeeper uses Shopify context, store policy, merchant judgment, and approved voice guidance to resolve customer requests.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/product/customer-support" },
  openGraph: { title, description, url: "/product/customer-support" },
  twitter: { title, description },
};

function SupportContextView() {
  return (
    <figure
      aria-labelledby="support-view-caption"
      className="overflow-hidden rounded-3xl border border-stone-900/10 bg-[#fdfbf7] shadow-[0_35px_70px_-45px_rgba(22,20,19,0.75)]"
    >
      <figcaption id="support-view-caption" className="sr-only">
        A representative support workspace showing Maya&apos;s size-swap request, matching Shopify and
        store-policy context, and a concise customer reply prepared after the approved order change.
      </figcaption>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-900/10 bg-[#2b2118] px-5 py-4 text-[#f6f2eb] sm:px-7">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#f6f2eb]/40">Support workspace · synthetic thread</p>
          <p className="mt-1 text-sm font-semibold">Maya Chen · Order #3102</p>
        </div>
        <span className="rounded-full bg-emerald-300/10 px-3 py-1 text-[10px] font-semibold text-emerald-100">Resolved</span>
      </div>
      <div className="grid lg:grid-cols-[0.9fr_1.2fr]">
        <div className="border-b border-stone-900/10 bg-[#f8f4ed] p-5 sm:p-7 lg:border-r lg:border-b-0">
          <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500"><MessageCircle className="size-3.5" aria-hidden /> Conversation</p>
          <div className="mt-5 rounded-2xl rounded-bl-md bg-white p-4 text-[13px] leading-relaxed text-stone-800 shadow-[0_12px_28px_-22px_rgba(22,20,19,0.6)]">
            hey! I ordered the linen jumpsuit in M but need S — can you switch it before it ships?
          </div>
          <div className="mt-4 ml-auto rounded-2xl rounded-br-md bg-[#2b2118] p-4 text-[13px] leading-relaxed text-[#f6f2eb]">
            Done — order #3102 is now Small / Sand. It is still unfulfilled, so there is nothing else you need to do.
            <p className="mt-2 flex items-center gap-1.5 text-[10px] text-emerald-200"><Check className="size-3" aria-hidden /> Sent after Shopify updated</p>
          </div>
        </div>
        <div className="p-5 sm:p-7">
          <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500"><PackageSearch className="size-3.5" aria-hidden /> Context used for this answer</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {[
              ["Order", "#3102 · Paid · Unfulfilled"],
              ["Inventory", "Small / Sand · 12 available"],
              ["Store policy", "Equal-price swap allowed before fulfillment"],
              ["Control", "Ask first · Approved by merchant"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-stone-900/10 bg-white p-4">
                <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-stone-400">{label}</p>
                <p className="mt-2 text-xs leading-relaxed text-stone-700">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-start gap-3 rounded-xl border border-violet-800/10 bg-violet-700/[0.05] p-4">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-violet-700" aria-hidden />
            <div>
              <p className="text-xs font-semibold text-stone-800">Approved voice guidance</p>
              <p className="mt-1 text-[11px] leading-relaxed text-stone-500">Concise, warm, and specific. Do not over-apologize or promise a ship date.</p>
            </div>
          </div>
        </div>
      </div>
      <p className="border-t border-stone-900/10 px-5 py-3 text-center text-[10px] text-stone-400 sm:px-7">Representative product composition using fictional details; not a customer transcript.</p>
    </figure>
  );
}

const capabilities = [
  {
    title: "Answer from context",
    body: "Use the information available to the conversation instead of filling gaps with a confident guess.",
    details: ["Order and fulfillment state", "Customer and product context", "Inventory and tracking", "Merchant policies and instructions"],
  },
  {
    title: "Close the loop",
    body: "Keep the customer response tied to the proposed or completed Shopify outcome.",
    details: ["Draft or send replies by mode", "Ask before consequential work", "State what actually changed", "Escalate uncertainty or blocked work"],
  },
  {
    title: "Learn deliberately",
    body: "Improve reusable knowledge and voice with merchant participation, not silent policy invention.",
    details: ["Save selected policy-gap answers", "Learn from approved edits or examples", "Propose voice updates after enough examples", "Apply a voice change only after approval"],
  },
] as const;

const faqs = [
  { q: "Does Shopkeeper send every reply automatically?", a: "No. Draft only keeps replies as drafts. Ask first can send routine, structurally safe information replies while consequential work pauses. Trusted is an explicit choice and still respects action limits and approval rules." },
  { q: "What happens when information is missing?", a: "Shopkeeper can ask the customer a focused follow-up, ask the merchant for judgment, or escalate. It should not invent a store policy or claim an order changed before Shopify confirms it." },
  { q: "Does every merchant response become store policy?", a: "No. A merchant can elect to save an answer to a policy-gap question as reusable knowledge. Ordinary replies do not silently become policy." },
  { q: "How does voice learning work?", a: "Approved merchant edits or examples can contribute to a proposed voice update after enough examples. The proposal changes the workspace guidance only after merchant approval." },
  { q: "Can I export support data?", a: "Workspace and customer data can be exported as JSON, and action history can be exported as CSV. Export availability and content remain tied to the organization workspace." },
] as const;

export default function CustomerSupportPage() {
  return (
    <ProductDetailTemplate
      eyebrow="customer support"
      title="A useful answer starts with the store."
      lede="Shopkeeper brings the conversation together with available Shopify context, merchant policy, and approved voice guidance—then replies with the outcome that actually happened."
      jumpLabel="See a grounded reply"
      visual={<SupportContextView />}
      capabilitiesLabel="context, action, reply"
      capabilitiesTitle="Resolve the request without separating the answer from the work."
      capabilitiesBody="Support quality comes from knowing the current state, respecting the merchant's boundary, and making the final response agree with Shopify."
      capabilities={capabilities}
      workflowLabel="one support thread"
      workflowTitle="Understand first. Act when eligible. Say what happened."
      workflowSteps={[
        ["Read the request", "Identify the customer's desired outcome and the information still needed."],
        ["Resolve context", "Use available conversation, customer, product, order, inventory, tracking, and policy context."],
        ["Act or ask", "Prepare supported work, follow the selected autonomy mode, and pause when judgment is required."],
        ["Reply and record", "Send or draft a grounded response and keep the decision and tool outcome reviewable."],
      ]}
      requirementsTitle="Give Shopkeeper reliable sources and a clear boundary."
      requirementsBody="Connect the store and customer intake, add the policies that matter most, and choose how replies and actions should behave before support starts moving."
      requirements={["Shopify context for commerce-specific support", "At least one supported customer-intake path", "Store policies and custom instructions", "An autonomy mode, action limits, and an escalation path"]}
      relatedLinks={[
        { href: "/product/order-operations", label: "Order operations", body: "Explore the Shopify work behind the final response." },
        { href: "/product/approvals-and-controls", label: "Approvals and controls", body: "See where merchant judgment enters the workflow." },
        { href: "/product/integrations", label: "Integrations", body: "Understand the roles of customer channels, iMessage, Shopify, and the dashboard." },
      ]}
      faqLabel="customer support faq"
      faqs={faqs}
    />
  );
}
