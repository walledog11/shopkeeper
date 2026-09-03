import type { Metadata } from "next";
import { Database, Download, KeyRound, LockKeyhole, ScrollText, ShieldCheck } from "lucide-react";
import { ProductDetailTemplate } from "../../_components/ProductDetailTemplate";

const title = "Security — Shopkeeper";
const description =
  "Read Shopkeeper's product principles for workspace isolation, provider access, action limits, audit history, and data exports.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/product/security" },
  openGraph: { title, description, url: "/product/security" },
  twitter: { title, description },
};

function SecurityModel() {
  const controls = [
    { icon: LockKeyhole, label: "Workspace scope", body: "Organization-bound access" },
    { icon: KeyRound, label: "Provider access", body: "Encrypted stored credentials" },
    { icon: ShieldCheck, label: "Action boundary", body: "Modes, permissions, and limits" },
    { icon: ScrollText, label: "Operating record", body: "Proposal through outcome" },
  ] as const;

  return (
    <figure
      aria-labelledby="security-model-caption"
      className="overflow-hidden rounded-3xl border border-stone-900/10 bg-[#2b2118] p-5 text-[#f6f2eb] shadow-[0_35px_70px_-42px_rgba(22,20,19,0.9)] sm:p-8"
    >
      <figcaption id="security-model-caption" className="sr-only">
        Product security model showing organization-scoped access, protected provider credentials,
        configured action boundaries, reviewable action history, and workspace exports.
      </figcaption>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-white/10 pb-5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#f6f2eb]/40">Product security model</p>
          <h2 className="m-display mt-2 text-[30px] sm:text-[38px]">Protect access. Bound actions. Preserve the record.</h2>
        </div>
        <span className="rounded-full border border-white/10 px-3 py-1 text-[10px] text-[#f6f2eb]/50">Principles, not certification claims</span>
      </div>
      <div className="grid gap-3 py-6 sm:grid-cols-2 lg:grid-cols-4">
        {controls.map(({ icon: Icon, label, body }, index) => (
          <div key={label} className="relative rounded-2xl border border-white/10 bg-white/[0.05] p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="grid size-9 place-items-center rounded-full bg-white/[0.07]"><Icon className="size-4" aria-hidden /></span>
              <span className="text-[10px] text-[#f6f2eb]/25">0{index + 1}</span>
            </div>
            <p className="mt-5 text-sm font-semibold">{label}</p>
            <p className="mt-2 text-[11px] leading-relaxed text-[#f6f2eb]/45">{body}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <Database className="mt-0.5 size-5 shrink-0 text-sky-200" aria-hidden />
          <div><p className="text-sm font-semibold">Data stays tied to the owning workspace</p><p className="mt-1 text-[11px] leading-relaxed text-[#f6f2eb]/45">Store, customer, conversation, and action access follows the organization scope.</p></div>
        </div>
        <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <Download className="mt-0.5 size-5 shrink-0 text-emerald-200" aria-hidden />
          <div><p className="text-sm font-semibold">Exports provide a path out</p><p className="mt-1 text-[11px] leading-relaxed text-[#f6f2eb]/45">Workspace and customer data export as JSON; action history exports as CSV.</p></div>
        </div>
      </div>
    </figure>
  );
}

const capabilities = [
  {
    title: "Scope access",
    body: "Keep product access and connected commerce data tied to the organization that owns the workspace.",
    details: ["Organization-bound application access", "Workspace-scoped customer and store context", "Provider permissions requested for product functions", "Connected credentials encrypted before storage"],
  },
  {
    title: "Constrain work",
    body: "Define what can draft, send, ask, execute, or stop before a customer request reaches an action.",
    details: ["Draft only, Ask first, and Trusted modes", "Tool and action permissions", "Refund cap and eligibility checks", "Block or escalate outside policy"],
  },
  {
    title: "Keep evidence",
    body: "Make consequential operating decisions and tool outcomes reviewable after the conversation moves on.",
    details: ["Proposed action and source thread", "Merchant decision and approver", "Execution status and result", "JSON and CSV export paths"],
  },
] as const;

const faqs = [
  { q: "Is Shopkeeper security-certified?", a: "This page does not claim an external audit or certification. It describes intended and implemented product controls such as organization scope, encrypted stored provider credentials, action limits, review history, and exports." },
  { q: "How are connected-provider credentials stored?", a: "Connected-provider credentials are encrypted before storage. Access is used for the product functions the merchant authorizes through the relevant provider connection." },
  { q: "Can Shopkeeper make any Shopify change once connected?", a: "No. Supported tools, Shopify eligibility, workspace permissions, autonomy mode, action-specific limits, and approval requirements all constrain the work. Unsupported or blocked actions should stop or escalate." },
  { q: "What is kept in the action history?", a: "The history can tie the source request, proposed work, execution mode, merchant decision, tool status, timing, customer-facing output, and completed result together for review." },
  { q: "Can workspace data be exported?", a: "Workspace and customer data can be exported as JSON, and action history can be exported as CSV. The export remains scoped to the organization workspace." },
  { q: "Where can I read the legal data-use terms?", a: "The public Privacy Policy describes data use and handling in legal terms. This page focuses on the product's access, control, audit, and export model." },
] as const;

export default function SecurityPage() {
  return (
    <ProductDetailTemplate
      eyebrow="security"
      title="Control is a system, not a confirmation dialog."
      lede="Shopkeeper combines organization-scoped access, protected provider credentials, explicit action boundaries, and a reviewable operating record."
      jumpLabel="See the security model"
      visual={<SecurityModel />}
      capabilitiesLabel="product principles"
      capabilitiesTitle="Protect the connection and the work it can perform."
      capabilitiesBody="Security on an action-taking support product includes who can access a workspace, what connected permissions enable, which actions are allowed, and what remains inspectable afterward."
      capabilities={capabilities}
      workflowLabel="before, during, after"
      workflowTitle="The boundary follows the action through its lifecycle."
      workflowSteps={[
        ["Authorize access", "Connect the organization and providers needed for the selected product functions."],
        ["Configure limits", "Choose the autonomy mode, tool permissions, financial limits, and store policies."],
        ["Gate the action", "Check eligibility and pause consequential or exceptional work when approval is required."],
        ["Record the result", "Keep the proposal, decision, execution status, and customer output available for review."],
      ]}
      requirementsTitle="Connect deliberately and review the boundary."
      requirementsBody="The merchant chooses the organization workspace, provider connections, product permissions, autonomy mode, and operating limits. Security claims here stay grounded in those product controls."
      requirements={["An organization workspace with authorized members", "Only the provider connections required for the workflow", "Reviewed action permissions, refund cap, and autonomy mode", "Store policies plus a merchant escalation and approval path"]}
      relatedLinks={[
        { href: "/product/approvals-and-controls", label: "Approvals and controls", body: "See how modes, limits, approval, and action history work in practice." },
        { href: "/product/integrations", label: "Integrations", body: "Understand what each connected surface contributes to the system." },
        { href: "/privacy", label: "Privacy Policy", body: "Read the public legal terms for data use and handling." },
      ]}
      faqLabel="security faq"
      faqs={faqs}
    />
  );
}
