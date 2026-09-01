import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Check, CircleAlert, LockKeyhole } from "lucide-react";
import { SectionLabel } from "./SectionLabel";

function SectionHeading({
  label,
  title,
  body,
}: {
  label: string;
  title: string;
  body: string;
}) {
  return (
    <div className="mb-9 text-center">
      <SectionLabel>{label}</SectionLabel>
      <h2 className="mx-auto mb-4 max-w-[20ch] text-[clamp(34px,4.5vw,58px)] font-bold leading-[1] tracking-[0.03em] [font-family:var(--m-hand)]">
        {title}
      </h2>
      <p className="mx-auto max-w-[58ch] text-[15px] leading-relaxed text-stone-700 sm:text-[16px]">
        {body}
      </p>
    </div>
  );
}

function SectionHandoff({ href, label }: { href: string; label: string }) {
  return (
    <div className="mt-6 text-center">
      <Link
        href={href}
        className="inline-flex items-center gap-2 rounded-full border border-stone-900/15 bg-[#fdfbf7] px-5 py-2.5 text-sm font-semibold text-stone-800 transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-stone-900 motion-reduce:transition-none"
      >
        {label}
        <ArrowRight className="size-4" aria-hidden />
      </Link>
    </div>
  );
}

function PaperCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-stone-900/10 bg-[#fdfbf7]/90 p-5 shadow-[0_16px_34px_-28px_rgba(22,20,19,0.55)] ${className}`}
    >
      {children}
    </div>
  );
}

const workflowSteps = [
  ["01", "Understand", "Find order #3102, confirm it is unfulfilled, and check Small is in stock."],
  ["02", "Prepare", "Build the Shopify item swap and explain exactly what will change."],
  ["03", "Ask", "Pause the consequential action and request approval through iMessage."],
  ["04", "Finish", "Update Shopify, reply to the customer, and record the completed action."],
] as const;

const operationGroups = [
  {
    title: "Resolve the order",
    items: ["Tracking and fulfillment", "Address correction", "Add, remove, or swap items"],
  },
  {
    title: "Handle the exception",
    items: ["Refund or cancellation", "Return or exchange", "Gift card and return label"],
  },
  {
    title: "Finish the work",
    items: ["Update customer details", "Add Shopify notes", "Fulfill and send the response"],
  },
] as const;

const systemLayers = [
  {
    title: "Customer channels",
    body: "Instagram and email",
  },
  {
    title: "Shopkeeper",
    body: "Understands context and prepares the right action",
  },
  {
    title: "Merchant control",
    body: "iMessage and dashboard",
  },
  {
    title: "Shopify",
    body: "Executes the work and returns the result",
  },
] as const;

export function CoreProductOverview() {
  return (
    <div className="relative">
      <section id="workflow" aria-labelledby="workflow-heading" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-14">
        <div className="mb-9 text-center">
          <SectionLabel>one request, fully resolved</SectionLabel>
          <h2
            id="workflow-heading"
            className="mx-auto mb-4 max-w-[20ch] text-[clamp(34px,4.5vw,58px)] font-bold leading-[1] tracking-[0.03em] [font-family:var(--m-hand)]"
          >
            A customer asks. The order actually changes.
          </h2>
          <p className="mx-auto max-w-[58ch] text-[15px] leading-relaxed text-stone-700 sm:text-[16px]">
            Shopkeeper follows the request from customer message to Shopify execution, pausing for
            merchant judgment before consequential work.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[0.9fr_1.4fr]">
          <PaperCard className="flex flex-col justify-between !bg-[#2b2118] text-[#f6f2eb]">
            <div>
              <div className="mb-5 flex items-center justify-between gap-3 text-xs text-[#f6f2eb]/60">
                <span>Seeded walkthrough · Instagram</span>
                <span>2:14 AM</span>
              </div>
              <p className="text-[22px] leading-snug [font-family:var(--m-hand)] sm:text-[26px]">
                “Can you swap my linen jumpsuit from M to S before it ships? Order #3102.”
              </p>
            </div>
            <p className="mt-8 border-t border-white/10 pt-5 text-xs leading-relaxed text-[#f6f2eb]/60">
              Fictional store and customer data used to explain the product workflow.
            </p>
          </PaperCard>

          <div className="rounded-2xl border border-stone-900/10 bg-white/35 p-5 shadow-[0_16px_34px_-28px_rgba(22,20,19,0.55)] sm:p-7">
            <div className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                Swap Medium → Small
              </p>
              <p className="mt-1 text-sm text-stone-600">Request → approval → Shopify result</p>
            </div>
            <ol className="grid gap-3 sm:grid-cols-2">
              {workflowSteps.map(([number, title, body]) => (
                <li key={number} className="rounded-xl border border-stone-900/10 bg-[#fdfbf7] p-4">
                  <span className="text-xs font-semibold text-stone-400">{number}</span>
                  <h3 className="mt-2 text-[20px] font-bold leading-none [font-family:var(--m-hand)]">
                    {title}
                  </h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-stone-600">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section id="operations" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-14">
        <SectionHeading
          label="shopify work, not just answers"
          title="Give support the ability to finish the job."
          body="Shopkeeper can move from understanding the request to completing supported order work and sending the customer a grounded response."
        />

        <div className="grid gap-4 md:grid-cols-3">
          {operationGroups.map((group) => (
            <PaperCard key={group.title}>
              <h3 className="text-[24px] font-bold leading-none [font-family:var(--m-hand)]">
                {group.title}
              </h3>
              <ul className="mt-5 space-y-3 text-sm text-stone-700">
                {group.items.map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <Check className="mt-0.5 size-4 shrink-0 text-[#2f7a4a]" strokeWidth={2} aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
            </PaperCard>
          ))}
        </div>
        <SectionHandoff href="/product/order-operations" label="Explore Order operations" />
      </section>

      <section id="controls" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-14">
        <SectionHeading
          label="control without babysitting"
          title="It knows when to answer, when to ask, and when to stop."
          body="The autonomy setting, action limits, and store policies define the boundary before Shopkeeper handles a request."
        />

        <div className="grid gap-4 md:grid-cols-3">
          <PaperCard>
            <div className="mb-4 grid size-9 place-items-center rounded-full bg-[#2f7a4a]/10 text-[#2f7a4a]">
              <Check className="size-5" aria-hidden />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-stone-500">
              Routine and safe
            </p>
            <h3 className="mt-2 text-[25px] font-bold leading-none [font-family:var(--m-hand)]">
              Follow the autonomy setting
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-stone-600">
              Routine replies can keep moving according to the mode the merchant selected.
            </p>
          </PaperCard>
          <PaperCard>
            <div className="mb-4 grid size-9 place-items-center rounded-full bg-amber-700/10 text-amber-800">
              <CircleAlert className="size-5" aria-hidden />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-stone-500">
              Consequential or exceptional
            </p>
            <h3 className="mt-2 text-[25px] font-bold leading-none [font-family:var(--m-hand)]">
              Pause and ask the merchant
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-stone-600">
              Order changes, money, and exceptions arrive with the facts needed to decide.
            </p>
          </PaperCard>
          <PaperCard>
            <div className="mb-4 grid size-9 place-items-center rounded-full bg-[#b0472f]/10 text-[#b0472f]">
              <LockKeyhole className="size-5" aria-hidden />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-stone-500">
              Outside policy
            </p>
            <h3 className="mt-2 text-[25px] font-bold leading-none [font-family:var(--m-hand)]">
              Block or escalate instead of guessing
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-stone-600">
              Limits and blocked actions establish a hard boundary around what the agent can do.
            </p>
          </PaperCard>
        </div>
        <SectionHandoff href="/product/approvals-and-controls" label="See approval modes and limits" />
      </section>

      <section id="system" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-14">
        <SectionHeading
          label="one system, four surfaces"
          title="Customers write in one place. You stay in control from another."
          body="Customer intake, merchant control, Shopify execution, and dashboard review each have a distinct role."
        />

        <ol className="grid gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] md:items-stretch">
          {systemLayers.map((layer, index) => (
            <li key={layer.title} className="contents">
              <PaperCard className="min-h-[150px]">
                <span className="text-xs font-semibold text-stone-400">0{index + 1}</span>
                <h3 className="mt-3 text-[23px] font-bold leading-none [font-family:var(--m-hand)]">
                  {layer.title}
                </h3>
                <p className="mt-4 text-[13px] leading-relaxed text-stone-600">{layer.body}</p>
              </PaperCard>
              {index < systemLayers.length - 1 ? (
                <ArrowRight className="mx-auto size-5 rotate-90 self-center text-stone-400 md:rotate-0" aria-hidden />
              ) : null}
            </li>
          ))}
        </ol>
        <p className="mt-4 rounded-xl border border-stone-900/10 bg-[#fdfbf7]/80 px-5 py-4 text-center text-sm text-stone-700">
          The dashboard remains the setup, review, audit, and manual fallback surface.
        </p>
        <SectionHandoff href="/product/integrations" label="See what each connection does" />
      </section>

      <section id="context" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-14">
        <SectionHeading
          label="answers grounded in the store"
          title="The response comes from context, not vibes."
          body="Shopkeeper combines live commerce data, available history, and merchant-provided rules before it proposes an answer or action."
        />

        <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
          <PaperCard>
            <h3 className="text-[25px] font-bold [font-family:var(--m-hand)]">Context sources</h3>
            <div className="mt-5 flex flex-wrap gap-2">
              {["Order state", "Customer context", "Products", "Inventory", "Policies", "Custom instructions", "Approved voice"].map(
                (source) => (
                  <span
                    key={source}
                    className="rounded-full border border-stone-900/10 bg-white px-3 py-1.5 text-xs text-stone-700"
                  >
                    {source}
                  </span>
                ),
              )}
            </div>
          </PaperCard>
          <PaperCard>
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-stone-500">
              Seeded order-change context
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {["Order #3102\nPaid · Unfulfilled", "Small / Sand\n12 in stock", "Store policy\nSame-price swap allowed"].map(
                (item) => (
                  <div
                    key={item}
                    className="whitespace-pre-line rounded-xl border border-stone-900/10 bg-white p-4 text-[13px] leading-relaxed text-stone-700"
                  >
                    {item}
                  </div>
                ),
              )}
            </div>
          </PaperCard>
        </div>
        <SectionHandoff href="/product/customer-support" label="See how a reply gets grounded" />
      </section>
    </div>
  );
}

export function ProactiveOperations() {
  return (
    <section id="proactive" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-14">
      <SectionHeading
        label="after the immediate reply"
        title="Keep an eye on the work that should not be forgotten."
        body="Optional briefings surface follow-up work after the core request is understood."
      />
      <div className="grid gap-4">
        <PaperCard>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[27px] font-bold leading-none [font-family:var(--m-hand)]">
              Morning briefing
            </h3>
            <span className="rounded-full bg-stone-900/5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-500">
              Optional
            </span>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-stone-600">
            Summarize support activity and optionally include a sales pulse or low-stock alert through iMessage.
          </p>
        </PaperCard>
      </div>
    </section>
  );
}

export function TrustSection() {
  const trustFacts = [
    ["Organization scope", "Workspace and customer access is scoped to the organization."],
    ["Protected credentials", "Connected-provider credentials are encrypted before storage."],
    ["Action history", "Proposals, approvals, and execution outcomes remain reviewable."],
    ["Data exports", "Workspace and customer data export as JSON; action history exports as CSV."],
  ] as const;

  return (
    <section id="trust" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-14">
      <SectionHeading
        label="trust and data handling"
        title="The controls are part of the product, not a footnote."
        body="Shopkeeper keeps access, decisions, and completed work tied to the workspace that owns them."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {trustFacts.map(([title, body]) => (
          <PaperCard key={title}>
            <h3 className="text-[22px] font-bold leading-none [font-family:var(--m-hand)]">{title}</h3>
            <p className="mt-3 text-[13px] leading-relaxed text-stone-600">{body}</p>
          </PaperCard>
        ))}
      </div>
      <p className="mt-5 text-center text-sm text-stone-600">
        Read the public <Link href="/privacy" className="font-semibold text-stone-900 underline decoration-stone-400 underline-offset-4">Privacy Policy</Link> for data-use details.
      </p>
      <SectionHandoff href="/product/security" label="See the security model" />
    </section>
  );
}
