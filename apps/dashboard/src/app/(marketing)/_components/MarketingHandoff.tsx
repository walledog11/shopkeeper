import { ArrowRight } from "lucide-react";
import { ButtonLink } from "./ButtonLink";

type HandoffLink = { href: string; label: string };

/** Outline CTAs under a marketing section — one link or a centered row. */
export function MarketingHandoff({ links }: { links: readonly HandoffLink[] }) {
  if (links.length === 1) {
    const link = links[0];
    return (
      <div className="mt-6 text-center">
        <ButtonLink href={link.href} variant="outline" size="lg">
          {link.label}
          <ArrowRight className="size-4" aria-hidden />
        </ButtonLink>
      </div>
    );
  }

  return (
    <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center sm:gap-8">
      {links.map((link) => (
        <div key={link.href} className="text-center">
          <ButtonLink href={link.href} variant="outline" size="lg">
            {link.label}
            <ArrowRight className="size-4" aria-hidden />
          </ButtonLink>
        </div>
      ))}
    </div>
  );
}
