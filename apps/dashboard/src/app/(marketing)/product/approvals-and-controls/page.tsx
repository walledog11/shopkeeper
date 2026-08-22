import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  ClipboardCheck,
  LockKeyhole,
  MessageCircle,
  SlidersHorizontal,
} from "lucide-react";
import { CTA } from "../../_components/CTA";
import { Footer } from "../../_components/Footer";
import { MarginThread } from "../../_components/MarginThread";
import { Navbar } from "../../_components/Navbar";
import { SectionLabel } from "../../_components/SectionLabel";

const title = "Approvals and controls — Shopkeeper";
const description =
  "See how Shopkeeper uses autonomy modes, action limits, merchant approval, and an audit trail to keep consequential Shopify work under control.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/product/approvals-and-controls" },
  openGraph: {
    title,
    description,
    url: "/product/approvals-and-controls",
  },
  twitter: { title, description },
};

const modes = [
  {
    label: "Draft only",
    eyebrow: "Nothing sends or changes",
    body: "Shopkeeper prepares work for review but does not send customer replies or mutate Shopify.",
    tone: "border-stone-900/10 bg-white/55",
  },
  {
    label: "Ask first",
    eyebrow: "The default",
    body: "Routine replies can keep moving, while changes, money, and exceptions pause for merchant approval.",
    tone: "border-amber-800/20 bg-amber-700/[0.07]",
  },
  {
    label: "Trusted",
    eyebrow: "Explicit opt-in",
    body: "Simple replies can send without review. Refunds, cancellations, configured limits, and other approval rules still apply.",
    tone: "border-[#2f7a4a]/20 bg-[#2f7a4a]/[0.07]",
  },
] as const;

const boundaries = [
  {
    icon: SlidersHorizontal,
    title: "Action limits",
    body: "Set the refund cap, block cancellations or custom line items, and disable tool categories the workspace should not use.",
  },
  {
    icon: MessageCircle,
    title: "Merchant judgment",
    body: "Use iMessage for phone-native direction and approval, or review the same request in the dashboard.",
  },
  {
    icon: ClipboardCheck,
    title: "Reviewable outcomes",
    body: "The action history ties the proposal, mode, approver, execution status, result, and source thread together.",
  },
] as const;

const faqs = [
  {
    q: "Does Ask first mean every reply waits for me?",
    a: "No. In Ask first, routine and structurally safe information replies may send automatically. Changes, money, exceptions, and work that needs judgment pause. Choose Draft only if every reply must stay a draft.",
  },
  {
    q: "Can I approve from my phone?",
    a: "Yes. Connect iMessage as the merchant-control channel to review and direct Shopkeeper from the phone. The dashboard remains available for configuration, review, and audit.",
  },
  {
    q: "Does a refund cap guarantee a refund will run?",
    a: "No. The cap is one boundary, not an eligibility promise. The order, requested amount, supported refund path, workspace rules, and current Shopify state must still allow the action.",
  },
  {
    q: "What happens outside policy?",
    a: "Shopkeeper can ask for missing judgment, block an ineligible action, or escalate the request. It should not improvise a store policy or force a Shopify mutation through a failed guardrail.",
  },
  {
    q: "Can Shopify mutations run automatically?",
    a: "Mutative work defaults to approval. Automatic execution requires explicit rollout configuration and remains subject to action permissions, limits, eligibility checks, and the execution ledger; broad autonomous mutation is not the launch promise.",
  },
  {
    q: "What can I inspect afterward?",
    a: "The action history shows the source channel, summary, customer-facing output when present, tool outcomes, execution mode, status, timing, and merchant approver when one was required.",
  },
] as const;

function ControlModel() {
  return (
    <div
      role="img"
      aria-label="Control model: a size-swap proposal pauses for merchant approval, then completes in Shopify and records the approver in the action history"
      className="rounded-3xl border border-stone-900/10 bg-[#2b2118] p-5 text-[#f6f2eb] shadow-[0_35px_70px_-42px_rgba(22,20,19,0.9)] sm:p-8"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[#f6f2eb]/45">Control model · synthetic order #3102</p>
          <p className="mt-1 text-lg font-semibold">Swap Medium / Sand → Small / Sand</p>
        </div>
        <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-xs font-semibold text-amber-100">
          Approval required
        </span>
      </div>
      <div className="grid gap-3 py-5 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-center">
        <div className="rounded-xl border border-white/10 bg-white/[0.05] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#f6f2eb]/40">Proposal</p>
          <p className="mt-2 text-sm font-semibold">Paid · unfulfilled</p>
          <p className="mt-1 text-xs leading-relaxed text-[#f6f2eb]/55">Same price · Small in stock · Ask first</p>
        </div>
        <ArrowRight className="mx-auto size-4 rotate-90 text-[#f6f2eb]/30 sm:rotate-0" aria-hidden />
        <div className="rounded-xl border border-amber-300/20 bg-amber-300/[0.08] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-amber-100/55">Merchant control</p>
          <p className="mt-2 text-sm font-semibold">Approved in iMessage</p>
          <p className="mt-1 text-xs leading-relaxed text-[#f6f2eb]/55">The exact proposed change stays attached.</p>
        </div>
        <ArrowRight className="mx-auto size-4 rotate-90 text-[#f6f2eb]/30 sm:rotate-0" aria-hidden />
        <div className="rounded-xl border border-emerald-300/20 bg-emerald-300/[0.08] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-emerald-100/55">Recorded result</p>
          <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold"><Check className="size-4" aria-hidden /> Completed</p>
          <p className="mt-1 text-xs leading-relaxed text-[#f6f2eb]/55">Human approved · Shopify updated</p>
        </div>
      </div>
      <p className="border-t border-white/10 pt-4 text-xs leading-relaxed text-[#f6f2eb]/45">
        This diagram explains the control model with fictional data; it is not presented as customer evidence.
      </p>
    </div>
  );
}

export default function ApprovalsAndControlsPage() {
  return (
    <main className="relative">
      <MarginThread />
      <Navbar />

      <article>
        <header className="mx-auto max-w-6xl px-6 pb-14 pt-16 text-center sm:pt-24">
          <Link
            href="/#controls"
            className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-stone-600 underline decoration-stone-300 underline-offset-4 hover:text-stone-900"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back to control overview
          </Link>
          <SectionLabel>approvals and controls</SectionLabel>
          <h1 className="mx-auto max-w-[18ch] text-[clamp(48px,7vw,88px)] font-bold leading-[0.95] tracking-[0.03em] [font-family:var(--m-hand)]">
            Set the boundary before the request arrives.
          </h1>
          <p className="mx-auto mt-7 max-w-[64ch] text-[16px] leading-relaxed text-stone-700 sm:text-[18px]">
            Choose what stays a draft, what can reply, and what must pause. Shopkeeper carries the exact Shopify work to the merchant, then keeps the decision and result reviewable.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Link href="/signup" className="m-glass-btn m-glass-btn-primary px-6 py-3">
              Start 14-day trial
            </Link>
            <Link href="#control-model" className="m-glass-btn m-glass-btn-outline px-6 py-3">
              Follow an approval
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </header>

        <section id="control-model" aria-labelledby="control-model-heading" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-14">
          <div className="mb-9 text-center">
            <SectionLabel>one consequential action</SectionLabel>
            <h2 id="control-model-heading" className="mx-auto max-w-[20ch] text-[clamp(36px,5vw,64px)] font-bold leading-none [font-family:var(--m-hand)]">
              The decision stays attached to the work.
            </h2>
          </div>
          <ControlModel />
        </section>

        <section aria-labelledby="modes-heading" className="mx-auto max-w-6xl px-6 py-14">
          <div className="mb-9 text-center">
            <SectionLabel>autonomy modes</SectionLabel>
            <h2 id="modes-heading" className="mx-auto max-w-[19ch] text-[clamp(36px,5vw,64px)] font-bold leading-none [font-family:var(--m-hand)]">
              Start cautious. Change the mode deliberately.
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {modes.map((mode) => (
              <div key={mode.label} className={`rounded-2xl border p-6 ${mode.tone}`}>
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-stone-500">{mode.eyebrow}</p>
                <h3 className="mt-3 text-[30px] font-bold leading-none [font-family:var(--m-hand)]">{mode.label}</h3>
                <p className="mt-4 text-sm leading-relaxed text-stone-600">{mode.body}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-center text-sm leading-relaxed text-stone-600">
            Broad and Full auto are not part of the merchant-facing launch choice. Automatic mutation requires separate rollout configuration.
          </p>
        </section>

        <section aria-labelledby="boundaries-heading" className="mx-auto max-w-6xl px-6 py-14">
          <div className="mb-9 text-center">
            <SectionLabel>the boundary has layers</SectionLabel>
            <h2 id="boundaries-heading" className="mx-auto max-w-[20ch] text-[clamp(36px,5vw,64px)] font-bold leading-none [font-family:var(--m-hand)]">
              A mode is the start, not the whole control system.
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {boundaries.map(({ icon: Icon, title: itemTitle, body }) => (
              <div key={itemTitle} className="rounded-2xl border border-stone-900/10 bg-[#fdfbf7]/85 p-6">
                <span className="grid size-10 place-items-center rounded-full bg-stone-900/[0.06] text-stone-800">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-5 text-[26px] font-bold leading-none [font-family:var(--m-hand)]">{itemTitle}</h3>
                <p className="mt-3 text-sm leading-relaxed text-stone-600">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="decision-heading" className="mx-auto max-w-6xl px-6 py-14">
          <div className="rounded-3xl border border-stone-900/10 bg-white/45 p-6 sm:p-10">
            <SectionLabel>decision states</SectionLabel>
            <h2 id="decision-heading" className="max-w-[20ch] text-[clamp(36px,5vw,60px)] font-bold leading-none [font-family:var(--m-hand)]">
              Three outcomes, stated before execution.
            </h2>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl bg-[#2f7a4a]/[0.07] p-5">
                <Check className="size-5 text-[#2f7a4a]" aria-hidden />
                <h3 className="mt-4 font-semibold">Follow the selected mode</h3>
                <p className="mt-2 text-sm leading-relaxed text-stone-600">Routine and structurally safe information work follows the configured autonomy.</p>
              </div>
              <div className="rounded-2xl bg-amber-700/[0.07] p-5">
                <CircleAlert className="size-5 text-amber-800" aria-hidden />
                <h3 className="mt-4 font-semibold">Pause for judgment</h3>
                <p className="mt-2 text-sm leading-relaxed text-stone-600">Consequential, exceptional, or uncertain work waits with the relevant context attached.</p>
              </div>
              <div className="rounded-2xl bg-[#b0472f]/[0.07] p-5">
                <LockKeyhole className="size-5 text-[#b0472f]" aria-hidden />
                <h3 className="mt-4 font-semibold">Block or escalate</h3>
                <p className="mt-2 text-sm leading-relaxed text-stone-600">Ineligible or disabled work stops instead of crossing a limit or inventing policy.</p>
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="requirements-heading" className="mx-auto max-w-4xl px-6 py-14">
          <div className="rounded-2xl border border-stone-900/10 bg-[#fdfbf7]/80 p-6 sm:p-9">
            <SectionLabel>what it needs</SectionLabel>
            <h2 id="requirements-heading" className="text-[clamp(34px,5vw,54px)] font-bold leading-none [font-family:var(--m-hand)]">
              Configure the rules and one place to reach you.
            </h2>
            <p className="mt-5 text-[15px] leading-relaxed text-stone-700">
              Connect Shopify, choose Draft only, Ask first, or Trusted, review the action permissions and refund cap, and add store policies. Connect iMessage for phone-native control; the dashboard remains the configuration, review, and audit surface.
            </p>
            <Link
              href="/product/order-operations"
              className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-stone-800 underline decoration-stone-300 underline-offset-4 hover:text-stone-950"
            >
              See the supported Shopify work
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </section>

        <section aria-labelledby="approvals-faq-heading" className="mx-auto max-w-4xl px-6 py-14">
          <div className="mb-9 text-center">
            <SectionLabel>approvals faq</SectionLabel>
            <h2 id="approvals-faq-heading" className="text-[clamp(36px,5vw,60px)] font-bold leading-none [font-family:var(--m-hand)]">
              Where does the boundary hold?
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
