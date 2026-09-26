import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Check, CircleAlert, LockKeyhole } from "lucide-react";
import { SectionLabel } from "./SectionLabel";
import { MerchantTasks } from "./MerchantTasks";
import { CustomerWorkflow } from "./Hero";

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

const operationGroups = [
  {
    title: "Before it ships",
    items: ["Look up orders and customer details", "Correct a shipping address", "Add, remove, or swap order items", "Cancel an eligible unfulfilled order"],
  },
  {
    title: "Returns & refunds",
    items: ["Refund a whole order or specified items", "Open a return for delivered items", "Arrange an eligible size or color exchange", "Attach a return label you provide"],
  },
  {
    title: "The rest of the paperwork",
    items: ["Create an unpaid customer order", "Issue a requested fixed-value gift card", "Update customer details and notes", "Record fulfillment and tracking after shipment"],
  },
] as const;

const systemLayers = [
  {
    title: "Where customers write",
    body: "Instagram, email, and chat on your store",
  },
  {
    title: "The agent",
    body: "Reads the thread, checks Shopify and your policies",
  },
  {
    title: "Your decision",
    body: "Approve, edit, answer a question, or take over",
  },
  {
    title: "The result",
    body: "Store changes, the customer reply, and an action record",
  },
] as const;

export function CoreProductOverview() {
  return (
    <div className="relative">
      <MerchantTasks />
      <CustomerWorkflow />

      <section id="operations" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-14">
        <SectionHeading
          label="what it can do in shopify"
          title="The actual order work, from lookup to return."
          body="These are changes Shopkeeper can make in your connected store. Ask for them yourself, or review a proposal from a customer conversation. Each action still has to meet Shopify’s requirements and your configured limits."
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
        <p className="mt-5 text-center text-[13px] leading-relaxed text-stone-600">
          It cannot ship a parcel or buy a return label for you. Fulfillment records require
          your confirmation that the order shipped; returns use a label you supply.
        </p>
        <SectionHandoff href="/product/order-operations" label="Order workflows and requirements" />
      </section>

      <section id="controls" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-14">
        <SectionHeading
          label="when the agent is handling customer messages"
          title="Choose what needs your approval."
          body="In the default Ask first mode, routine information replies can go out automatically. Changes to an order, money, and exceptions wait for your decision. Set refund limits and enable only the actions you want it to use."
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
              Handles it
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-stone-600">
              Tracking, product details, and policy questions can be answered from
              your store data without waiting for you in Ask first mode.
            </p>
          </PaperCard>
          <PaperCard>
            <div className="mb-4 grid size-9 place-items-center rounded-full bg-amber-700/10 text-amber-800">
              <CircleAlert className="size-5" aria-hidden />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-stone-500">
              Money, or a change to the order
            </p>
            <h3 className="mt-2 text-[25px] font-bold leading-none [font-family:var(--m-hand)]">
              Checks with you
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-stone-600">
              A customer asks for a refund, cancellation, or address change.
              Review the proposed action and reply, approve it, or ask for a revision.
            </p>
          </PaperCard>
          <PaperCard>
            <div className="mb-4 grid size-9 place-items-center rounded-full bg-[#b0472f]/10 text-[#b0472f]">
              <LockKeyhole className="size-5" aria-hidden />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-stone-500">
              Outside your rules
            </p>
            <h3 className="mt-2 text-[25px] font-bold leading-none [font-family:var(--m-hand)]">
              Hands it back
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-stone-600">
              An over-limit refund, an ineligible order, or a failed action needs
              your attention. The thread stays available for you to take over.
            </p>
          </PaperCard>
        </div>
        <p className="mt-4 rounded-xl border border-stone-900/10 bg-[#fdfbf7]/80 px-5 py-4 text-center text-sm text-stone-700">
          Want to review every customer reply? Start in Draft only. Your direct
          instructions to the merchant agent are a separate way to initiate work;
          they still follow your action limits and connected-account permissions.
        </p>
        <SectionHandoff href="/product/approvals-and-controls" label="See approval modes and limits" />
      </section>

      <section id="system" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-14">
        <SectionHeading
          label="customer support, with the store attached"
          title="The message, the order, and the decision stay together."
          body="Email, Instagram DMs, and website chat arrive in your inbox. Shopkeeper uses the customer’s conversation and order context to prepare the reply and any store actions. You can review the work on your phone or open the full thread in the dashboard."
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
          Home brings together what needs an answer, what needs approval, and what
          needs you to take over. Open a conversation to see its history, edit the
          reply, or respond yourself. Review keeps the record of the agent’s work.
        </p>
        <SectionHandoff href="/product/integrations" label="See what each connection does" />
      </section>

      <section id="context" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-14">
        <SectionHeading
          label="store knowledge and memory"
          title="Teach it the things Shopify doesn’t know."
          body="Your return window, shipping exceptions, wholesale rules, and how you like to speak to customers belong in its memory. Add notes yourself, use synced store information, and review what it has learned from your answers."
        />

        <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
          <PaperCard>
            <h3 className="text-[25px] font-bold [font-family:var(--m-hand)]">What a reply is based on</h3>
            <div className="mt-5 flex flex-wrap gap-2">
              {["The order", "This customer’s past messages", "Products", "Stock", "Your policies", "About your store", "Your approved voice"].map(
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
            <p className="mt-5 border-t border-stone-900/10 pt-4 text-[13px] leading-relaxed text-stone-600">
              Memory separates your store profile, tone and voice, learned answers,
              Shopify information, and your own notes so you can inspect and correct them.
            </p>
          </PaperCard>
          <PaperCard>
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-stone-500">
              Example: a policy that needs your answer
            </p>
            <div className="mt-5 grid gap-3">
              {["Customer asks\n“Do you ship to Canada?”", "Shopkeeper asks you\n“Do we ship to Canada, and at what rate?”", "You answer\n“Yes, standard shipping is $15.”"].map(
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
            <p className="mt-4 text-[13px] leading-relaxed text-stone-600">
              The answer unblocks the customer reply and can be saved for future
              questions. Edits to drafts also inform proposed voice guidance,
              which you review before it becomes the agent’s voice.
            </p>
          </PaperCard>
        </div>
        <SectionHandoff href="/product/customer-support" label="How store knowledge shapes the reply" />
      </section>
    </div>
  );
}

const briefingOptions = [
  {
    title: "Morning briefing",
    body: "An optional daily summary of completed work, unanswered questions, and actions waiting for approval.",
  },
  {
    title: "Sales pulse",
    body: "Include orders and revenue since your last briefing, with a comparison to the prior week when available.",
  },
  {
    title: "Low-stock alerts",
    body: "Choose an inventory threshold. The briefing can flag product variants at or below that number of units.",
  },
] as const;

export function ProactiveOperations() {
  return (
    <section id="proactive" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-14">
      <SectionHeading
        label="your daily briefing"
        title="Sales, stock, and the decisions waiting for you."
        body="Turn on a morning briefing to catch up from iMessage. See the agent’s work and what needs your attention, with optional sales and inventory updates. Reply to ask about a customer or act on a pending decision."
      />

      <div className="grid gap-5 lg:grid-cols-[1.3fr_0.9fr]">
        <PaperCard className="flex flex-col justify-between !bg-[#2b2118] text-[#f6f2eb]">
          <div>
            <div className="mb-5 flex items-center justify-between gap-3 text-xs text-[#f6f2eb]/60">
              <span>Morning briefing · iMessage</span>
              <span>7:00 AM</span>
            </div>
            <div className="flex flex-col gap-4 text-[15px] leading-relaxed sm:text-[16px]">
              <div>
                <p>
                  Since your last briefing: 12 customer replies sent and two
                  order changes completed after your approval.
                </p>
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[#f6f2eb]/85">
                  <li>• Maya’s size swap is complete.</li>
                  <li>• Alex’s cancellation and refund are complete.</li>
                </ul>
              </div>
              <p>One decision is waiting: Priya wants to change the address on #3107 before it ships.</p>
              <p>Sales: 8 orders, $624 in revenue.</p>
              <p>Low stock: Linen Jumpsuit, Small / Sand — 3 left.</p>
            </div>
          </div>
          <p className="mt-8 border-t border-white/10 pt-5 text-xs leading-relaxed text-[#f6f2eb]/60">
            Illustrative briefing with fictional data. Sales pulse and low-stock alerts enabled.
          </p>
        </PaperCard>

        <div className="grid content-start gap-4">
          {briefingOptions.map((option) => (
            <PaperCard key={option.title}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-[25px] font-bold leading-none [font-family:var(--m-hand)]">
                  {option.title}
                </h3>
                <span className="shrink-0 rounded-full bg-stone-900/5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-500">
                  Optional
                </span>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-stone-600">{option.body}</p>
            </PaperCard>
          ))}
        </div>
      </div>
    </section>
  );
}

export function TrustSection() {
  const trustFacts = [
    ["Nobody else sees it", "Another store using Shopkeeper can’t see your customers or your orders."],
    ["Your logins are encrypted", "Your Shopify and Instagram logins are encrypted before they’re stored."],
    ["Every action is on the record", "What it proposed, what you approved, and what happened. All still readable."],
    ["Download it all", "Store and customer data downloads as JSON. Action history downloads as CSV."],
  ] as const;

  return (
    <section id="trust" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-14">
      <SectionHeading
        label="trust and data handling"
        title="Your data stays yours. Even if you leave."
        body="Your Shopify login is encrypted before it’s stored. Your customers’ addresses never touch another merchant’s account. You can download all of it."
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
        The full details are in the <Link href="/privacy" className="font-semibold text-stone-900 underline decoration-stone-400 underline-offset-4">Privacy Policy</Link>.
      </p>
      <SectionHandoff href="/product/security" label="See the security model" />
    </section>
  );
}
