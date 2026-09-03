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
        <h2 id="related-heading" className="m-display text-[clamp(34px,5vw,54px)]">
          Follow the product story.
        </h2>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {links.map((link) => (
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
  );
}
