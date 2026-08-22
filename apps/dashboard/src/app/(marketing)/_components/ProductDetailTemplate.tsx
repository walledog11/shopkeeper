import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { CTA } from "./CTA";
import { Footer } from "./Footer";
import { MarginThread } from "./MarginThread";
import { Navbar } from "./Navbar";
import { SectionLabel } from "./SectionLabel";

type Capability = {
  title: string;
  body: string;
  details: readonly string[];
};

type ProductLink = {
  href: string;
  label: string;
  body: string;
};

type FAQ = {
  q: string;
  a: string;
};

export function ProductDetailTemplate({
  eyebrow,
  title,
  lede,
  jumpLabel,
  visual,
  capabilitiesLabel,
  capabilitiesTitle,
  capabilitiesBody,
  capabilities,
  workflowLabel,
  workflowTitle,
  workflowSteps,
  requirementsTitle,
  requirementsBody,
  requirements,
  relatedLinks,
  faqLabel,
  faqs,
}: {
  eyebrow: string;
  title: string;
  lede: string;
  jumpLabel: string;
  visual: ReactNode;
  capabilitiesLabel: string;
  capabilitiesTitle: string;
  capabilitiesBody: string;
  capabilities: readonly Capability[];
  workflowLabel: string;
  workflowTitle: string;
  workflowSteps: readonly (readonly [string, string])[];
  requirementsTitle: string;
  requirementsBody: string;
  requirements: readonly string[];
  relatedLinks: readonly ProductLink[];
  faqLabel: string;
  faqs: readonly FAQ[];
}) {
  return (
    <main className="relative">
      <MarginThread />
      <Navbar />

      <article>
        <header className="mx-auto max-w-6xl px-6 pb-12 pt-16 text-center sm:pt-24">
          <Link
            href="/"
            className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-stone-600 underline decoration-stone-300 underline-offset-4 hover:text-stone-900"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back to overview
          </Link>
          <SectionLabel>{eyebrow}</SectionLabel>
          <h1 className="mx-auto max-w-[18ch] text-[clamp(48px,7vw,88px)] font-bold leading-[0.95] tracking-[0.03em] [font-family:var(--m-hand)]">
            {title}
          </h1>
          <p className="mx-auto mt-7 max-w-[64ch] text-[16px] leading-relaxed text-stone-700 sm:text-[18px]">
            {lede}
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Link href="/signup" className="m-glass-btn m-glass-btn-primary px-6 py-3">
              Start 14-day trial
            </Link>
            <Link href="#product-view" className="m-glass-btn m-glass-btn-outline px-6 py-3">
              {jumpLabel}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </header>

        <section id="product-view" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-12">
          {visual}
        </section>

        <section aria-labelledby="capabilities-heading" className="mx-auto max-w-6xl px-6 py-14">
          <div className="mb-9 text-center">
            <SectionLabel>{capabilitiesLabel}</SectionLabel>
            <h2 id="capabilities-heading" className="mx-auto max-w-[20ch] text-[clamp(36px,5vw,64px)] font-bold leading-none [font-family:var(--m-hand)]">
              {capabilitiesTitle}
            </h2>
            <p className="mx-auto mt-5 max-w-[62ch] text-[15px] leading-relaxed text-stone-700">
              {capabilitiesBody}
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {capabilities.map((capability) => (
              <div key={capability.title} className="rounded-2xl border border-stone-900/10 bg-[#fdfbf7]/85 p-6">
                <h3 className="text-[27px] font-bold leading-none [font-family:var(--m-hand)]">{capability.title}</h3>
                <p className="mt-4 text-sm leading-relaxed text-stone-600">{capability.body}</p>
                <ul className="mt-5 space-y-3 text-[13px] text-stone-700">
                  {capability.details.map((detail) => (
                    <li key={detail} className="flex items-start gap-2.5">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-[#2f7a4a]" aria-hidden />
                      {detail}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="workflow-detail-heading" className="mx-auto max-w-6xl px-6 py-14">
          <div className="rounded-3xl border border-stone-900/10 bg-white/45 p-6 sm:p-10">
            <SectionLabel>{workflowLabel}</SectionLabel>
            <h2 id="workflow-detail-heading" className="max-w-[20ch] text-[clamp(36px,5vw,60px)] font-bold leading-none [font-family:var(--m-hand)]">
              {workflowTitle}
            </h2>
            <ol className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {workflowSteps.map(([title, body], index) => (
                <li key={title} className="rounded-2xl border border-stone-900/10 bg-[#fdfbf7] p-5">
                  <span className="text-xs font-semibold text-stone-400">0{index + 1}</span>
                  <h3 className="mt-3 text-xl font-bold leading-none [font-family:var(--m-hand)]">{title}</h3>
                  <p className="mt-3 text-[13px] leading-relaxed text-stone-600">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="requirements-heading" className="mx-auto max-w-4xl px-6 py-14">
          <div className="rounded-2xl border border-stone-900/10 bg-[#fdfbf7]/80 p-6 sm:p-9">
            <SectionLabel>setup and limits</SectionLabel>
            <h2 id="requirements-heading" className="text-[clamp(34px,5vw,54px)] font-bold leading-none [font-family:var(--m-hand)]">
              {requirementsTitle}
            </h2>
            <p className="mt-5 text-[15px] leading-relaxed text-stone-700">{requirementsBody}</p>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {requirements.map((requirement) => (
                <li key={requirement} className="flex items-start gap-2.5 rounded-xl bg-white/65 p-4 text-[13px] leading-relaxed text-stone-700">
                  <Check className="mt-0.5 size-4 shrink-0 text-[#2f7a4a]" aria-hidden />
                  {requirement}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="related-heading" className="mx-auto max-w-6xl px-6 py-14">
          <div className="mb-8 text-center">
            <SectionLabel>keep exploring</SectionLabel>
            <h2 id="related-heading" className="text-[clamp(34px,5vw,54px)] font-bold leading-none [font-family:var(--m-hand)]">
              Follow the product story.
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {relatedLinks.map((link) => (
              <Link key={link.href} href={link.href} className="group rounded-2xl border border-stone-900/10 bg-[#fdfbf7]/80 p-5 transition-transform hover:-translate-y-0.5 motion-reduce:transition-none">
                <span className="flex items-center justify-between gap-3 text-sm font-semibold text-stone-900">
                  {link.label}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
                </span>
                <span className="mt-2 block text-[13px] leading-relaxed text-stone-600">{link.body}</span>
              </Link>
            ))}
          </div>
        </section>

        <section aria-labelledby="product-faq-heading" className="mx-auto max-w-4xl px-6 py-14">
          <div className="mb-9 text-center">
            <SectionLabel>{faqLabel}</SectionLabel>
            <h2 id="product-faq-heading" className="text-[clamp(36px,5vw,60px)] font-bold leading-none [font-family:var(--m-hand)]">
              The practical questions.
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
