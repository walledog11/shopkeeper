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
    body: "A short text each morning: what got done and what’s waiting on you.",
  },
  {
    title: "Sales pulse",
    body: "Orders and revenue since your last briefing, and how that compares with last week.",
  },
  {
    title: "Low-stock alerts",
    body: "Set a threshold and get flagged when a variant drops to it.",
  },
] as const;

export function ProactiveOperations() {
  return (
    <section id="proactive" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-16 sm:px-6 sm:py-24">
      <SectionHeading
        label="Your daily briefing"
        title="Sales, stock, and the decisions waiting for you."
        body="Get a text each morning with what Shopkeeper did and what needs you. Add sales and low-stock updates if you want them, then reply to ask a question or settle a decision."
      />

      <div className="grid gap-5 lg:grid-cols-[1.3fr_0.9fr]">
        <PaperCard className="!bg-white/[0.06]">
          <div className="mb-5 flex items-center justify-between gap-3 text-xs text-[color:var(--m-ink-3)]">
            <span>Morning briefing · iMessage</span>
            <span>7:00 AM</span>
          </div>
          <div className="flex flex-col gap-4 text-[15px] leading-relaxed sm:text-[16px]">
            <div>
              <p>
                Since your last briefing: 12 customer replies sent and 2
                order changes completed after your approval.
              </p>
              <ul className="m-0 mt-2 flex list-disc flex-col gap-1.5 pl-5 text-[color:var(--m-ink-2)] marker:text-[color:var(--m-ink-3)]">
                <li>Jordan’s gift-note edit is complete.</li>
                <li>Sam’s return label is attached.</li>
              </ul>
            </div>
            <p>One decision is waiting: Riley wants to change the address on #3107 before it ships.</p>
            <p>Sales: 8 orders, $624 in revenue.</p>
            <p>Low stock: Linen Pant, Oat / M, 3 left.</p>
          </div>
        </PaperCard>

        <div className="grid content-start gap-4">
          {briefingOptions.map((option) => (
            <PaperCard key={option.title}>
              <h3 className="m-display text-[1.375rem]">{option.title}</h3>
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
