import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { PRIMARY_CTA_LABEL } from "@/lib/brand";
import { ButtonLink } from "./ButtonLink";
import { CTA } from "./CTA";
import { Footer } from "./Footer";
import { Navbar } from "./Navbar";
import { RelatedLinks, type ProductLink } from "./RelatedLinks";
import { SectionLabel } from "./SectionLabel";

type Capability = {
  title: string;
  body: string;
  details: readonly string[];
};

type FAQ = {
  q: string;
  a: string;
};

export function ProductDetailTemplate({
  eyebrow,
  title,
  lede,
  backHref = "/",
  backLabel = "Back to home",
  jumpLabel,
  jumpHref = "#product-view",
  visualSectionId = "product-view",
  visual,
  afterVisual,
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
  requirementsFooter,
  relatedLinks,
  faqLabel,
  faqTitle = "The practical questions.",
  faqs,
}: {
  eyebrow: string;
  title: string;
  lede: string;
  backHref?: string;
  backLabel?: string;
  jumpLabel: string;
  jumpHref?: string;
  visualSectionId?: string;
  visual: ReactNode;
  afterVisual?: ReactNode;
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
  requirementsFooter?: ReactNode;
  relatedLinks: readonly ProductLink[];
  faqLabel: string;
  faqTitle?: string;
  faqs: readonly FAQ[];
}) {
  return (
    <main className="relative">
      <Navbar />

      <article>
        <header className="mx-auto max-w-6xl px-6 pb-12 pt-16 text-center sm:pt-24">
          <Link
            href={backHref}
            className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-[color:var(--m-ink-2)] underline decoration-[color:var(--m-line-strong)] underline-offset-4 hover:text-[color:var(--m-ink)]"
          >
            <ArrowLeft className="size-4" aria-hidden />
            {backLabel}
          </Link>
          <SectionLabel>{eyebrow}</SectionLabel>
          <h1 className="m-display m-h1 mx-auto max-w-[18ch]">
            {title}
          </h1>
          <p className="m-lede mx-auto mt-7 max-w-[64ch] sm:text-[18px]">
            {lede}
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <ButtonLink href="/signup" variant="primary" size="lg">
              {PRIMARY_CTA_LABEL}
            </ButtonLink>
            <ButtonLink href={jumpHref} variant="outline" size="lg">
              {jumpLabel}
              <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
          </div>
        </header>

        <div className="m-chapter m-chapter--alt">
          <section id={visualSectionId} className="mx-auto max-w-6xl scroll-mt-24 px-6 py-16">
            {visual}
          </section>
        </div>

        {afterVisual}

        <section aria-labelledby="capabilities-heading" className="mx-auto max-w-6xl px-6 py-14">
          <div className="mb-9 text-center">
            <SectionLabel>{capabilitiesLabel}</SectionLabel>
            <h2 id="capabilities-heading" className="m-display m-h2 mx-auto max-w-[20ch]">
              {capabilitiesTitle}
            </h2>
            <p className="m-lede mx-auto mt-5 max-w-[62ch] text-[15px]">
              {capabilitiesBody}
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {capabilities.map((capability) => (
              <div key={capability.title} className="m-card p-6">
                <h3 className="m-display text-[1.5rem]">{capability.title}</h3>
                <p className="mt-4 text-sm leading-relaxed text-[color:var(--m-ink-2)]">{capability.body}</p>
                <ul className="mt-5 space-y-3 text-[13px] text-[color:var(--m-ink-2)]">
                  {capability.details.map((detail) => (
                    <li key={detail} className="flex items-start gap-2.5">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-[color:var(--m-good)]" aria-hidden />
                      {detail}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <div className="m-chapter m-chapter--alt">
          <section aria-labelledby="workflow-detail-heading" className="mx-auto max-w-6xl px-6 py-16">
            <SectionLabel align="start">{workflowLabel}</SectionLabel>
            <h2 id="workflow-detail-heading" className="m-display m-h2 max-w-[20ch]">
              {workflowTitle}
            </h2>
            <ol className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {workflowSteps.map(([stepTitle, body], index) => (
                <li key={stepTitle} className="m-card p-5">
                  <span className="text-xs text-[color:var(--m-ink-3)] [font-family:var(--m-font-mono)]">0{index + 1}</span>
                  <h3 className="m-display mt-3 text-[1.25rem]">{stepTitle}</h3>
                  <p className="mt-3 text-[13px] leading-relaxed text-[color:var(--m-ink-2)]">{body}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <section aria-labelledby="requirements-heading" className="mx-auto max-w-4xl px-6 py-14">
          <div className="m-card p-6 sm:p-9">
            <SectionLabel align="start">setup and limits</SectionLabel>
            <h2 id="requirements-heading" className="m-display m-h2">
              {requirementsTitle}
            </h2>
            <p className="m-lede mt-5 text-[15px]">{requirementsBody}</p>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {requirements.map((requirement) => (
                <li key={requirement} className="flex items-start gap-2.5 rounded-xl bg-[color:var(--m-bg-alt)] p-4 text-[13px] leading-relaxed text-[color:var(--m-ink-2)]">
                  <Check className="mt-0.5 size-4 shrink-0 text-[color:var(--m-good)]" aria-hidden />
                  {requirement}
                </li>
              ))}
            </ul>
            {requirementsFooter}
          </div>
        </section>

        <div className="m-chapter m-chapter--alt">
          <RelatedLinks links={relatedLinks} />
        </div>

        <section aria-labelledby="product-faq-heading" className="mx-auto max-w-4xl px-6 py-14">
          <div className="mb-9 text-center">
            <SectionLabel>{faqLabel}</SectionLabel>
            <h2 id="product-faq-heading" className="m-display m-h2">
              {faqTitle}
            </h2>
          </div>
          <dl className="m-card divide-y divide-[color:var(--m-line)] px-6 sm:px-8">
            {faqs.map((item) => (
              <div key={item.q} className="py-6">
                <dt className="text-lg font-medium text-[color:var(--m-ink)]">{item.q}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-[color:var(--m-ink-2)]">{item.a}</dd>
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
