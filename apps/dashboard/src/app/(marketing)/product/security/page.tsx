import type { Metadata } from "next";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { CircleAlert, Download, FileCheck2, LockKeyhole, MessageSquareWarning, ScrollText, Store } from "lucide-react";
import { cn } from "@/lib/ui/cn";
import { CTA as Cta } from "../../_components/CTA";
import { Footer } from "../../_components/Footer";
import { SettingsPreview } from "../../_components/Limits";
import { Navbar } from "../../_components/Navbar";

const title = "Security — Shopkeeper";
const description =
  "What Shopkeeper does on its own, what waits for your yes, the limits you set, and how your store’s data is kept.";
const previewImage = { url: "/opengraph-image", width: 1200, height: 630, alt: "Shopkeeper: customer support that texts you before it acts" };

// A page-level openGraph replaces the inherited one, image included, so the
// site-wide preview image is named again here.
export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/product/security" },
  openGraph: { type: "website", url: "/product/security", siteName: "Shopkeeper", title, description, images: [previewImage] },
  twitter: { card: "summary_large_image", title, description, images: [previewImage] },
};

// The lanes are `decideAutonomy` in the default "Ask first" tier; "Never" is
// the compensation caps (`compensation_over_cap`), the claimed-approval
// escalation (`forwarded_prompt_injection`) and approval binding to the exact
// proposal (agent-runtime "Approval binding").
const lanes = [
  {
    tone: "auto",
    title: "On its own",
    items: [
      "Looks up orders, tracking and stock",
      "Answers from your policies and pages",
      "Asks a customer which order, for a photo, or for the email or zip on an order",
    ],
  },
  {
    tone: "ask",
    title: "Only with your yes",
    items: [
      "Changes an order or its shipping address",
      "Cancels or refunds an order",
      "Opens a return or an exchange, or sends a gift card",
    ],
  },
  {
    tone: "you",
    title: "Never",
    items: [
      "Goes over your refund limits, even with your approval",
      "Takes a customer’s word that you already approved something",
      "Runs anything other than what you approved",
    ],
  },
] as const;

interface Point {
  Icon: LucideIcon;
  title: string;
  body: string;
}

const approvals: Point[] = [
  {
    Icon: FileCheck2,
    title: "What you approve is what runs.",
    body: "If the amount, the order, the address or the words change, it asks you again.",
  },
  {
    Icon: CircleAlert,
    title: "When in doubt, it stops.",
    body: "If Shopify doesn’t confirm a change, it tells you instead of trying again.",
  },
  {
    Icon: MessageSquareWarning,
    title: "Customers can’t give it orders.",
    body: "Their messages are read as requests, never as instructions. A claim that you already approved something comes straight to you.",
  },
];

const data: Point[] = [
  {
    Icon: LockKeyhole,
    title: "Connections are encrypted",
    body: "Access to your Shopify store, Instagram and Gmail is encrypted before it’s stored.",
  },
  {
    Icon: Store,
    title: "Your store stays separate",
    body: "Every lookup is scoped to your workspace. No other store can see your data.",
  },
  {
    Icon: ScrollText,
    title: "Every step is on the record",
    body: "What was asked, what it proposed, who approved it and what changed. Download the history as CSV.",
  },
  {
    Icon: Download,
    title: "Take it with you",
    body: "Export your store and customer data as JSON any time, or delete your workspace and everything in it.",
  },
];

function PointCard({ Icon, title: heading, body }: Point) {
  return (
    <div className="m-point">
      <span aria-hidden className="m-point-icon">
        <Icon strokeWidth={1.75} />
      </span>
      <h3 className="mt-5 text-[17px] font-medium text-[color:var(--m-ink)]">{heading}</h3>
      <p className="mt-2 text-[15px] leading-relaxed text-[color:var(--m-ink-2)]">{body}</p>
    </div>
  );
}

const linkClass =
  "underline decoration-[color:var(--m-line-strong)] underline-offset-4 transition-colors hover:decoration-[color:var(--m-ink)]";

export default function SecurityPage() {
  return (
    <main className="relative">
      <Navbar />

      <section aria-labelledby="security-heading" className="mx-auto max-w-6xl px-5 pb-16 pt-16 sm:px-8 sm:pb-20 sm:pt-24">
        <h1 id="security-heading" className="m-display m-h1 max-w-[14em]">How Shopkeeper keeps your store safe.</h1>
        <p className="m-lede mt-6 max-w-2xl text-[1.125rem] sm:text-[1.1875rem]">
          It does only what you allow. Anything that changes an order or moves money waits for your yes, and every
          step is on the record.
        </p>
      </section>

      <section aria-labelledby="lanes-heading" className="mx-auto max-w-6xl px-5 pb-20 sm:px-8 sm:pb-28">
        <h2 id="lanes-heading" className="m-display m-h2 max-w-2xl">What it does alone, and what waits for you.</h2>
        <p className="m-lede mt-5 max-w-2xl text-[1.125rem]">
          This is Ask first, the default. In Draft only, it sends nothing and changes nothing.
        </p>
        <div className="m-lanes mt-12">
          {lanes.map((lane) => (
            <div key={lane.tone} className={cn("m-lane", `is-${lane.tone}`)}>
              <div className="m-lane-head">
                <h3 className="m-lane-title">
                  <span aria-hidden className="m-lane-dot" />
                  {lane.title}
                </h3>
              </div>
              <ul className="m-rules">
                {lane.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <div className="m-chapter m-chapter--alt">
        <section
          aria-labelledby="limits-heading"
          className="mx-auto grid max-w-6xl items-center gap-14 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-2 lg:gap-20"
        >
          <div className="max-w-xl">
            <h2 id="limits-heading" className="m-display m-h2">Limits you set.</h2>
            <ul className="m-lede mt-6 space-y-3 text-[1.0625rem]">
              <li>A cap on each refund or gift card, and on the day’s total. Both hold even when you approve.</li>
              <li>Block cancellations altogether.</li>
              <li>Require a photo before any damage refund.</li>
              <li>Choose how much it does alone: Draft only, Ask first or Trusted.</li>
            </ul>
          </div>
          <SettingsPreview />
        </section>
      </div>

      <section aria-labelledby="approvals-heading" className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        <h2 id="approvals-heading" className="m-display m-h2 max-w-2xl">Approvals are exact.</h2>
        <div className="mt-12 grid gap-4 md:grid-cols-3 lg:gap-5">
          {approvals.map((point) => (
            <PointCard key={point.title} {...point} />
          ))}
        </div>
      </section>

      <div className="m-chapter m-chapter--alt">
        <section aria-labelledby="data-heading" className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
          <h2 id="data-heading" className="m-display m-h2 max-w-2xl">Your data.</h2>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:gap-5">
            {data.map((point) => (
              <PointCard key={point.title} {...point} />
            ))}
          </div>
          <p className="mt-10 max-w-2xl text-[15px] leading-relaxed text-[color:var(--m-ink-2)]">
            Read the <Link href="/privacy" className={linkClass}>privacy policy</Link> and{" "}
            <Link href="/data-deletion" className={linkClass}>how to delete your data</Link>. Shopkeeper hasn’t been
            independently audited or certified yet; this page describes how the product works today.
          </p>
        </section>
      </div>

      <Cta />
      <Footer />
    </main>
  );
}
