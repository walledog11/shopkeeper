import type { Metadata } from "next";
import { ArrowDown, Mail, MessageCircle, MonitorCheck, ShoppingBag, Smartphone } from "lucide-react";
import { ProductDetailTemplate } from "../../_components/ProductDetailTemplate";

const title = "Integrations — Shopkeeper";
const description =
  "See how Shopkeeper separates customer support intake, merchant control, Shopify execution, and dashboard review.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/product/integrations" },
  openGraph: { title, description, url: "/product/integrations" },
  twitter: { title, description },
};

function IntegrationsMap() {
  return (
    <figure
      aria-labelledby="integrations-map-caption"
      className="overflow-hidden rounded-3xl border border-stone-900/10 bg-[#2b2118] p-5 text-[#f6f2eb] shadow-[0_35px_70px_-42px_rgba(22,20,19,0.9)] sm:p-8"
    >
      <figcaption id="integrations-map-caption" className="sr-only">
        Integration map showing Instagram and email as customer intake, Shopkeeper as the planning
        layer, iMessage as merchant control, Shopify as execution, and the dashboard as review and audit.
      </figcaption>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-white/10 pb-5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#f6f2eb]/40">Four roles, kept distinct</p>
          <h2 className="mt-2 text-[30px] font-bold leading-none [font-family:var(--m-hand)] sm:text-[38px]">One request. The right surface at each step.</h2>
        </div>
        <span className="rounded-full bg-white/[0.07] px-3 py-1 text-[10px] text-[#f6f2eb]/55">Representative system map</span>
      </div>
      <div className="grid gap-3 py-6 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] lg:items-stretch">
        <div className="rounded-2xl border border-sky-200/15 bg-sky-200/[0.06] p-4">
          <Mail className="size-5 text-sky-100" aria-hidden />
          <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.1em] text-sky-100/50">Customer intake</p>
          <p className="mt-2 text-sm font-semibold">Instagram, email, chat</p>
          <p className="mt-2 text-[11px] leading-relaxed text-[#f6f2eb]/50">Customers ask for help where support is available.</p>
        </div>
        <ArrowDown className="mx-auto size-4 text-[#f6f2eb]/25 lg:-rotate-90 lg:self-center" aria-hidden />
        <div className="rounded-2xl border border-violet-200/15 bg-violet-200/[0.06] p-4">
          <MessageCircle className="size-5 text-violet-100" aria-hidden />
          <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.1em] text-violet-100/50">Plan</p>
          <p className="mt-2 text-sm font-semibold">Shopkeeper</p>
          <p className="mt-2 text-[11px] leading-relaxed text-[#f6f2eb]/50">Resolves store context and prepares the supported action.</p>
        </div>
        <ArrowDown className="mx-auto size-4 text-[#f6f2eb]/25 lg:-rotate-90 lg:self-center" aria-hidden />
        <div className="rounded-2xl border border-amber-200/15 bg-amber-200/[0.06] p-4">
          <Smartphone className="size-5 text-amber-100" aria-hidden />
          <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.1em] text-amber-100/50">Merchant control</p>
          <p className="mt-2 text-sm font-semibold">iMessage</p>
          <p className="mt-2 text-[11px] leading-relaxed text-[#f6f2eb]/50">Consequential work arrives with the facts needed to decide.</p>
        </div>
        <ArrowDown className="mx-auto size-4 text-[#f6f2eb]/25 lg:-rotate-90 lg:self-center" aria-hidden />
        <div className="rounded-2xl border border-emerald-200/15 bg-emerald-200/[0.06] p-4">
          <ShoppingBag className="size-5 text-emerald-100" aria-hidden />
          <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.1em] text-emerald-100/50">System of action</p>
          <p className="mt-2 text-sm font-semibold">Shopify</p>
          <p className="mt-2 text-[11px] leading-relaxed text-[#f6f2eb]/50">Eligible order and customer changes happen in the store.</p>
        </div>
      </div>
      <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.05] p-4">
        <MonitorCheck className="mt-0.5 size-5 shrink-0 text-[#f6f2eb]/70" aria-hidden />
        <div>
          <p className="text-sm font-semibold">Dashboard · configuration, review, and audit</p>
          <p className="mt-1 text-[11px] leading-relaxed text-[#f6f2eb]/45">Connect services, set policies and limits, inspect conversations, and review action history without making the dashboard the only place a merchant can work.</p>
        </div>
      </div>
    </figure>
  );
}

const capabilities = [
  {
    title: "Bring in the request",
    body: "Customer channels supply the conversation; they are not merchant approval surfaces.",
    details: ["Instagram customer messages", "Gmail support intake", "Forwarded support email", "Chat on your store"],
  },
  {
    title: "Keep judgment close",
    body: "Merchant-control channels carry proposals, questions, approvals, and direction.",
    details: ["iMessage for phone-native review", "Dashboard manual fallback", "Exact action context attached", "No customer inbox role for iMessage"],
  },
  {
    title: "Complete and review",
    body: "Shopify remains the system of action while the dashboard preserves the operating record.",
    details: ["Shopify order and customer context", "Supported Shopify mutations", "Action outcomes and approvers", "Workspace configuration and exports"],
  },
] as const;

const faqs = [
  { q: "Is iMessage a customer support inbox?", a: "No. In this product model, Instagram, Gmail, forwarded email, and chat on your store are customer-intake surfaces. iMessage is for the merchant to review, approve, and direct Shopkeeper." },
  { q: "Is Shopify required?", a: "Yes. Shopkeeper is built for Shopify stores, and Shopify supplies the commerce context and system of action behind supported order work." },
  { q: "Can I use forwarded support email instead of Gmail?", a: "Yes. A store can forward a support address into the provided intake path. The setup should explain the forwarding destination and verification steps without asking customers to change how they write in." },
  { q: "Does Shopkeeper merge every customer across channels?", a: "No. It uses the conversation, customer, and Shopify context available to the request. It does not promise perfect cross-channel identity resolution." },
  { q: "Are TikTok Shop and WhatsApp part of the primary integration story?", a: "Not for this refresh. They may become separate priorities, but the core story here is Shopify execution, Instagram and email intake, iMessage merchant control, and dashboard review." },
] as const;

export default function IntegrationsPage() {
  return (
    <ProductDetailTemplate
      eyebrow="integrations"
      title="Every connection has one clear job."
      lede="Customer channels bring in the request. Shopkeeper builds the plan. The merchant decides when needed. Shopify completes the work, and the dashboard keeps it reviewable."
      jumpLabel="See the system map"
      visual={<IntegrationsMap />}
      capabilitiesLabel="integration roles"
      capabilitiesTitle="Connect the workflow without blurring the surfaces."
      capabilitiesBody="The setup stays understandable because intake, control, execution, and review are described as different responsibilities everywhere they appear."
      capabilities={capabilities}
      workflowLabel="from connection to resolution"
      workflowTitle="A connected request still follows the same control model."
      workflowSteps={[
        ["Connect Shopify", "Authorize the store that supplies order, customer, product, inventory, and fulfillment context."],
        ["Add intake", "Connect Gmail or Instagram, or configure the store's support address to forward into Shopkeeper."],
        ["Choose control", "Set the autonomy mode and connect iMessage when phone-native merchant approval is wanted."],
        ["Review the loop", "Inspect requests, proposals, decisions, executions, and replies from the dashboard."],
      ]}
      requirementsTitle="Start with Shopify, then add only the surfaces you use."
      requirementsBody="A workspace needs a Shopify store and its operating rules. Customer channels and iMessage are connected separately so each permission and role stays explicit."
      requirements={["An eligible Shopify store and organization workspace", "A support address or supported customer-channel account", "Store policies, action permissions, and autonomy mode", "iMessage only when phone-native merchant control is desired"]}
      relatedLinks={[
        { href: "/product/order-operations", label: "Order operations", body: "See which Shopify actions Shopkeeper can prepare and complete." },
        { href: "/product/approvals-and-controls", label: "Approvals and controls", body: "Understand autonomy modes, limits, decisions, and action history." },
        { href: "/product/customer-support", label: "Customer support", body: "See how context, replies, policy knowledge, and voice fit together." },
      ]}
      faqLabel="integrations faq"
      faqs={faqs}
    />
  );
}
