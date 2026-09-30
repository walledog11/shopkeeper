import type { ReactNode } from "react";
import Link from "next/link";
import { SectionLabel } from "./SectionLabel";
import { MarketingHandoffLink } from "./MarketingHandoffLink";

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
    <div className="mb-10 text-center">
      <SectionLabel>{label}</SectionLabel>
      <h2 className="m-display m-h2 mx-auto mb-4 max-w-[20ch]">{title}</h2>
      <p className="m-lede mx-auto max-w-[58ch]">{body}</p>
    </div>
  );
}

function SectionHandoff({ href, label }: { href: string; label: string }) {
  return (
    <div className="mt-6">
      <MarketingHandoffLink href={href} label={label} />
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
  return <div className={`m-card p-5 sm:p-6 ${className}`}>{children}</div>;
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
    <section id="proactive" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-16 sm:px-6 sm:py-24">
      <SectionHeading
        label="your daily briefing"
        title="Sales, stock, and the decisions waiting for you."
        body="Turn on a morning briefing to catch up from iMessage. See the agent’s work and what needs your attention, with optional sales and inventory updates. Reply to ask about a customer or act on a pending decision."
      />

      <div className="grid gap-5 lg:grid-cols-[1.3fr_0.9fr]">
        <PaperCard className="flex flex-col justify-between !bg-white/[0.06]">
          <div>
            <div className="mb-5 flex items-center justify-between gap-3 text-xs text-[color:var(--m-ink-3)]">
              <span>Morning briefing · iMessage</span>
              <span>7:00 AM</span>
            </div>
            <div className="flex flex-col gap-4 text-[15px] leading-relaxed sm:text-[16px]">
              <div>
                <p>
                  Since your last briefing: 12 customer replies sent and two
                  order changes completed after your approval.
                </p>
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[color:var(--m-ink-2)]">
                  <li>• Jordan’s gift-note edit is complete.</li>
                  <li>• Sam’s return label is attached.</li>
                </ul>
              </div>
              <p>One decision is waiting: Riley wants to change the address on #3107 before it ships.</p>
              <p>Sales: 8 orders, $624 in revenue.</p>
              <p>Low stock: Linen Jumpsuit, Small / Sand — 3 left.</p>
            </div>
          </div>
          <p className="mt-8 border-t border-[color:var(--m-line)] pt-5 text-xs leading-relaxed text-[color:var(--m-ink-3)]">
            Illustrative briefing with fictional data. Sales pulse and low-stock alerts enabled.
          </p>
        </PaperCard>

        <div className="grid content-start gap-4">
          {briefingOptions.map((option) => (
            <PaperCard key={option.title}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="m-display text-[1.375rem]">{option.title}</h3>
                <span className="shrink-0 rounded-full border border-[color:var(--m-line)] px-2.5 py-1 text-[11px] uppercase leading-none tracking-[0.04em] text-[color:var(--m-ink-3)] [font-family:var(--m-font-mono)]">
                  Optional
                </span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-[color:var(--m-ink-2)]">{option.body}</p>
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
    <section id="trust" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-16 sm:px-6 sm:py-24">
      <SectionHeading
        label="trust and data handling"
        title="Your data stays yours. Even if you leave."
        body="Your Shopify login is encrypted before it’s stored. Your customers’ addresses never touch another merchant’s account. You can download all of it."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {trustFacts.map(([title, body]) => (
          <PaperCard key={title}>
            <h3 className="m-display text-[1.375rem]">{title}</h3>
            <p className="mt-3 text-[13px] leading-relaxed text-[color:var(--m-ink-2)]">{body}</p>
          </PaperCard>
        ))}
      </div>
      <p className="mt-5 text-center text-sm text-[color:var(--m-ink-2)]">
        The full details are in the{" "}
        <Link href="/privacy" className="font-semibold text-[color:var(--m-ink)] underline decoration-[color:var(--m-line-strong)] underline-offset-4">
          Privacy Policy
        </Link>
        .
      </p>
      <SectionHandoff href="/product/security" label="See the security model" />
    </section>
  );
}
