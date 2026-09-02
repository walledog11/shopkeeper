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
  ["01", "Reads it", "Opens order #3102, checks it hasn’t shipped, counts the Small in stock."],
  ["02", "Gets it ready", "Builds the swap in Shopify and writes out exactly what changes."],
  ["03", "Texts you", "Stops there. Changing order #3102 needs your yes first."],
  ["04", "Does it", "Updates Shopify, replies to Maya, keeps a record you can check."],
] as const;

const operationGroups = [
  {
    title: "Fix the order",
    items: ["“Where’s my order?”", "“I typed the wrong address”", "“Can I swap the size?”"],
  },
  {
    title: "When it goes wrong",
    items: ["“I want a refund”", "“I need to return this”", "“Store credit or a return label?”"],
  },
  {
    title: "Close it out",
    items: ["Update their details", "Add a note on the order", "Mark it fulfilled and send the reply"],
  },
] as const;

const systemLayers = [
  {
    title: "Where customers write",
    body: "Instagram, email, and chat on your store",
  },
  {
    title: "Shopkeeper",
    body: "Reads the order and gets the work ready",
  },
  {
    title: "Where you decide",
    body: "iMessage, or the dashboard if you’d rather",
  },
  {
    title: "Shopify",
    body: "Does the work and reports back",
  },
] as const;

export function CoreProductOverview() {
  return (
    <div className="relative">
      <section id="workflow" aria-labelledby="workflow-heading" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-14">
        <div className="mb-9 text-center">
          <SectionLabel>one request, start to finish</SectionLabel>
          <h2
            id="workflow-heading"
            className="mx-auto mb-4 max-w-[20ch] text-[clamp(34px,4.5vw,58px)] font-bold leading-[1] tracking-[0.03em] [font-family:var(--m-hand)]"
          >
            A customer asks. The order actually changes.
          </h2>
          <p className="mx-auto max-w-[58ch] text-[15px] leading-relaxed text-stone-700 sm:text-[16px]">
            You’re asleep. Shopkeeper reads the DM, opens order #3102, and gets the swap
            ready. Then it waits for you.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[0.9fr_1.4fr]">
          <PaperCard className="flex flex-col justify-between !bg-[#2b2118] text-[#f6f2eb]">
            <div>
              <div className="mb-5 flex items-center justify-between gap-3 text-xs text-[#f6f2eb]/60">
                <span>Demo data · Instagram</span>
                <span>2:14 AM</span>
              </div>
              <p className="text-[22px] leading-snug [font-family:var(--m-hand)] sm:text-[26px]">
                “Can you swap my linen jumpsuit from M to S before it ships? Order #3102.”
              </p>
            </div>
            <p className="mt-8 border-t border-white/10 pt-5 text-xs leading-relaxed text-[#f6f2eb]/60">
              Fictional store and customer. Real product workflow.
            </p>
          </PaperCard>

          <div className="rounded-2xl border border-stone-900/10 bg-white/35 p-5 shadow-[0_16px_34px_-28px_rgba(22,20,19,0.55)] sm:p-7">
            <div className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                Swap Medium → Small
              </p>
              <p className="mt-1 text-sm text-stone-600">DM → your yes → Shopify updated</p>
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
          title="It doesn’t just reply. It changes the order."
          body="You’ve written that apology before. Shopkeeper can issue the refund on order #3102 instead, then update Shopify. It asks you before it does."
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
        <SectionHandoff href="/product/order-operations" label="See everything it can do to an order" />
      </section>

      <section id="controls" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-14">
        <SectionHeading
          label="control without babysitting"
          title="It knows when to answer, when to ask, and when to stop."
          body="You tell it once where your line is. A tracking question and a $180 refund are not the same thing, and it knows that."
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
              Answers the easy ones itself, if that’s the trust level you set.
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
              Refunds, cancellations, address changes. One text, with the facts already in it.
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
              Won’t go near it
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-stone-600">
              Past your cap it stops and hands you the thread. No guessing.
            </p>
          </PaperCard>
        </div>
        <p className="mt-4 rounded-xl border border-stone-900/10 bg-[#fdfbf7]/80 px-5 py-4 text-center text-sm text-stone-700">
          There’s also a mode where it can’t send anything at all. Draft only writes the
          reply and leaves it to you.
        </p>
        <SectionHandoff href="/product/approvals-and-controls" label="See approval modes and limits" />
      </section>

      <section id="system" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-14">
        <SectionHeading
          label="one system, four places"
          title="Your customers get a reply. You get a text."
          body="Maya messages you on Instagram. You get one text on iMessage. Shopify gets the update. You never have to open the dashboard to do it."
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
          The dashboard is still there for setup, for reviewing what happened, and for
          taking over by hand.
        </p>
        <SectionHandoff href="/product/integrations" label="See what each connection does" />
      </section>

      <section id="context" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-14">
        <SectionHeading
          label="answers grounded in the store"
          title="It reads the order before it answers."
          body="Order #3102 is paid and hasn’t shipped. There are 12 Small in stock. Shopkeeper knew all of that before it wrote to Maya. When it can’t find the answer, it asks you instead of inventing one."
        />

        <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
          <PaperCard>
            <h3 className="text-[25px] font-bold [font-family:var(--m-hand)]">What it reads</h3>
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
              A first-time customer has no history. It says so rather than guessing.
            </p>
          </PaperCard>
          <PaperCard>
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-stone-500">
              What it knew before replying to Maya
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

const briefingOptions = [
  {
    title: "Morning briefing",
    body: "Off until you turn it on. One text, once a day.",
  },
  {
    title: "Sales and stock",
    body: "Add yesterday’s sales and a low-stock line on top of it.",
  },
] as const;

export function ProactiveOperations() {
  return (
    <section id="proactive" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-14">
      <SectionHeading
        label="while you were asleep"
        title="You wake up already caught up."
        body="At 7am, one text. It tells you what it handled while you were asleep, and what still needs you."
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
                  Since your last briefing I handled three things, including one refund and
                  one reply:
                </p>
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[#f6f2eb]/85">
                  <li>- Swapped #3102 from Medium to Small for Maya Chen</li>
                  <li>- Refunded #3098, damaged in transit</li>
                </ul>
              </div>
              <p>Two of those ran without needing you.</p>
              <p>One action is waiting for your approval.</p>
              <p>Priya wants to change the address on #3107 before it ships.</p>
              <p>Should I go ahead?</p>
            </div>
          </div>
          <p className="mt-8 border-t border-white/10 pt-5 text-xs leading-relaxed text-[#f6f2eb]/60">
            Fictional store and customer. Real briefing wording.
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
