import { ArrowRight, Check, Inbox, MessageCircleMore } from "lucide-react";

const painPoints = [
  "Stop opening Shopify for every “where is my order?”",
  "Stop copying context between Instagram, email, and the admin.",
  "Stop keeping address changes and refunds in your head for later.",
] as const;

export function Delegation() {
  return (
    <section id="why-shopkeeper" className="scroll-mt-24 py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-end lg:gap-20">
          <div>
            <p className="m-kicker">Less support work in your day</p>
            <h2 className="m-display mt-5 max-w-[14ch] text-[clamp(2.1rem,4.6vw,4.15rem)]">
              Support should not be the tab you keep reopening.
            </h2>
          </div>
          <p className="max-w-[52ch] text-[16px] leading-[1.75] text-stone-600 lg:pb-1">
            The repetitive part is rarely just the reply. It is finding the order,
            checking the policy, making the promised change, and remembering to close
            the loop. Shopkeeper handles that work as one job.
          </p>
        </div>

        <ul className="mt-12 grid list-none gap-0 border-y border-stone-900/10 p-0 md:grid-cols-3 md:divide-x md:divide-stone-900/10">
          {painPoints.map((point) => (
            <li key={point} className="flex gap-3 border-b border-stone-900/10 py-5 last:border-b-0 md:border-b-0 md:px-7 md:first:pl-0 md:last:pr-0">
              <Check className="mt-0.5 size-4 shrink-0 text-[#2f7a4a]" strokeWidth={2.2} aria-hidden />
              <span className="text-[14px] leading-relaxed text-stone-700">{point}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mx-auto mt-16 max-w-6xl px-5 sm:px-6 md:mt-24">
        <div className="overflow-hidden rounded-[2rem] border border-stone-900/10 bg-[#2b2118] text-[#f6f2eb] shadow-[0_36px_80px_-56px_rgba(22,20,19,0.9)]">
          <div className="grid lg:grid-cols-[0.82fr_1.18fr]">
            <div className="border-b border-white/10 p-6 sm:p-9 lg:border-r lg:border-b-0 lg:p-11">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#f6f2eb]/45">
                A different operating model
              </p>
              <h2 className="m-display mt-5 max-w-[12ch] text-[clamp(2rem,4vw,3.35rem)] text-[#f6f2eb]">
                Do not run another support queue.
              </h2>
              <p className="mt-5 max-w-[38ch] text-[15px] leading-relaxed text-[#f6f2eb]/65">
                Customers keep using the channels they know. Shopkeeper does the
                routine work. You show up when the answer needs your judgment.
              </p>
            </div>

            <div className="p-5 sm:p-8 lg:p-10">
              <div className="border-b border-white/10 pb-7">
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#f6f2eb]/35">
                  Traditional helpdesk
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2.5 text-[13px] text-[#f6f2eb]/55">
                  <FlowNode icon={<MessageCircleMore className="size-4" aria-hidden />} label="Customer message" />
                  <ArrowRight className="size-4 text-[#f6f2eb]/20" aria-hidden />
                  <FlowNode icon={<Inbox className="size-4" aria-hidden />} label="Ticket waits" />
                  <ArrowRight className="size-4 text-[#f6f2eb]/20" aria-hidden />
                  <FlowNode label="You work it" />
                </div>
              </div>

              <div className="pt-7">
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-emerald-200/60">
                  With Shopkeeper
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
                    <p className="text-[12px] font-semibold">Customer asks</p>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-[#f6f2eb]/45">
                      Shopkeeper checks the store, replies, and completes supported work.
                    </p>
                  </div>
                  <ArrowRight className="mx-auto size-4 rotate-90 text-[#f6f2eb]/25 sm:rotate-0" aria-hidden />
                  <div className="rounded-2xl border border-emerald-200/20 bg-emerald-200/[0.08] p-4">
                    <p className="text-[12px] font-semibold text-emerald-50">You get the decision</p>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-[#f6f2eb]/55">
                      A concise iMessage arrives only when approval or store guidance is needed.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FlowNode({ icon, label }: { icon?: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5">
      {icon}
      {label}
    </span>
  );
}
