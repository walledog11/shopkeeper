import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SectionLabel } from "./SectionLabel";

export type ProductLink = {
  href: string;
  label: string;
  body: string;
};

export function RelatedLinks({ links }: { links: readonly ProductLink[] }) {
  return (
    <section aria-labelledby="related-heading" className="mx-auto max-w-6xl px-6 py-14">
      <div className="mb-8 text-center">
        <SectionLabel>keep exploring</SectionLabel>
        <h2 id="related-heading" className="m-display m-h2">
          Follow the product story.
        </h2>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {links.map((link) => (
          <Link key={link.href} href={link.href} className="m-card group p-5 transition-colors hover:border-[color:var(--m-line-strong)] motion-reduce:transition-none">
            <span className="flex items-center justify-between gap-3 text-sm font-semibold text-[color:var(--m-ink)]">
              {link.label}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
            </span>
            <span className="mt-2 block text-[13px] leading-relaxed text-[color:var(--m-ink-2)]">{link.body}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
