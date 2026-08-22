import Link from "next/link";
import { Check, Clock3, MessageSquare } from "lucide-react";

function ApprovalHistoryComposition() {
  return (
    <figure
      aria-labelledby="approval-history-caption"
      className="overflow-hidden rounded-3xl border border-stone-900/10 bg-[#2b2118] text-[#f6f2eb] shadow-[0_30px_65px_-45px_rgba(22,20,19,0.9)]"
    >
      <figcaption id="approval-history-caption" className="sr-only">
        Maya asks to swap the Linen Jumpsuit on order 3102 from Medium to Small. The merchant
        approves in iMessage, Shopify updates, and the reply is sent. All details are fictional.
      </figcaption>
      <div className="grid lg:grid-cols-[0.95fr_1.25fr]">
        <div className="border-b border-white/10 p-5 sm:p-7 lg:border-r lg:border-b-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[12px] text-[#f6f2eb]/45">iMessage</p>
              <h3 className="mt-1 text-[1.25rem] font-semibold tracking-tight">Approve the swap</h3>
            </div>
            <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2.5 py-1 text-[10px] font-semibold text-amber-100">
              Waiting on you
            </span>
          </div>
          <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.06] p-4">
            <p className="text-xs leading-relaxed text-[#f6f2eb]/75">
              Maya wants to swap order #3102 from Medium / Sand to Small / Sand. It is unfulfilled,
              the price is unchanged, and 12 are in stock.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full bg-white/10 px-3 py-1.5 text-[10px] text-[#f6f2eb]/60">Keep Medium</span>
              <span className="rounded-full bg-[#367ee8] px-3 py-1.5 text-[10px] font-semibold text-white">Approve swap</span>
            </div>
          </div>
          <p className="mt-4 flex items-center gap-2 text-[11px] text-[#f6f2eb]/45">
            <MessageSquare className="size-3.5" aria-hidden /> The proposal arrives with the facts.
          </p>
        </div>

        <div className="p-5 sm:p-7">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[12px] text-[#f6f2eb]/45">Action history</p>
              <h3 className="mt-1 text-[1.25rem] font-semibold tracking-tight">Done in Shopify</h3>
            </div>
            <span className="text-[10px] text-[#f6f2eb]/35">Order #3102</span>
          </div>
          <div className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
            <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-white/10 p-4">
              <span className="grid size-8 place-items-center rounded-full bg-emerald-300/10 text-emerald-200">
                <Check className="size-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold">Swap order item · M → S</p>
                <p className="mt-1 text-[10px] text-[#f6f2eb]/45">Shopify · Linen Jumpsuit</p>
              </div>
              <span className="rounded-full bg-emerald-300/10 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.08em] text-emerald-100">
                Completed
              </span>
            </div>
            <dl className="grid gap-px bg-white/10 sm:grid-cols-3">
              {[
                ["Decision", "Approved by you"],
                ["Execution", "Small / Sand applied"],
                ["Customer", "Reply sent"],
              ].map(([term, detail]) => (
                <div key={term} className="bg-[#30251d] p-4">
                  <dt className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#f6f2eb]/35">{term}</dt>
                  <dd className="mt-1.5 text-[11px] leading-snug text-[#f6f2eb]/70">{detail}</dd>
                </div>
              ))}
            </dl>
          </div>
          <p className="mt-4 flex items-center gap-2 text-[11px] text-[#f6f2eb]/45">
            <Clock3 className="size-3.5" aria-hidden /> Proposal, decision, Shopify change, and reply stay together.
          </p>
        </div>
      </div>
    </figure>
  );
}

export function ControlMoment() {
  const modes = [
    ["Draft only", "Prepares the reply and Shopify work. Nothing sends or changes."],
    ["Ask first", "Routine answers can move. Money and order changes wait for you."],
    ["Trusted", "Simple replies can send; permissions, limits, and order checks still apply."],
  ] as const;

  return (
    <section id="controls" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-16 sm:px-6 md:py-24">
      <div className="grid gap-8 lg:grid-cols-[1fr_0.95fr] lg:items-end lg:gap-16">
        <div>
          <p className="m-kicker">Control without the queue</p>
          <h2 className="m-display mt-5 max-w-[15ch] text-[clamp(2.1rem,4.6vw,4.15rem)]">
            You decide what can happen without you.
          </h2>
        </div>
        <p className="max-w-[52ch] text-[16px] leading-[1.7] text-stone-600">
          Start with Ask first. Routine answers can keep moving, while refunds,
          cancellations, and order changes can arrive with the facts attached for approval.
        </p>
      </div>

      <div className="mt-10 grid border-y border-stone-900/10 md:grid-cols-3 md:divide-x md:divide-stone-900/10">
        {modes.map(([name, body], index) => (
          <div key={name} className="border-b border-stone-900/10 py-5 last:border-b-0 md:border-b-0 md:px-7 md:first:pl-0 md:last:pr-0">
            <div className="flex items-center gap-2.5">
              <h3 className="text-[14px] font-semibold text-stone-800">{name}</h3>
              {index === 1 ? (
                <span className="rounded-full bg-[#2f7a4a]/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-[#2f7a4a]">
                  Default
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-stone-500">{body}</p>
          </div>
        ))}
      </div>

      <div className="mt-10">
        <ApprovalHistoryComposition />
      </div>
      <p className="mt-4 text-center text-[12px] leading-relaxed text-stone-500">
        Example workflow · Demo data. Eligibility and approval behavior depend on the order and your settings.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-stone-600">
        <Link
          href="/product/order-operations"
          className="font-medium text-stone-900 underline decoration-stone-300 underline-offset-4 hover:decoration-stone-600"
        >
          Shopify order work
        </Link>
        <Link
          href="/product/approvals-and-controls"
          className="font-medium text-stone-900 underline decoration-stone-300 underline-offset-4 hover:decoration-stone-600"
        >
          Approval modes and limits
        </Link>
      </div>
    </section>
  );
}
