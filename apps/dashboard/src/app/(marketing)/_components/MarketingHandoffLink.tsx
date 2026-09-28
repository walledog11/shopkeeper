import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { marketingHandoffLinkClass } from "./marketingUi";

export function MarketingHandoffLink({ href, label }: { href: string; label: string }) {
  return (
    <div className="text-center">
      <Link href={href} className={marketingHandoffLinkClass}>
        {label}
        <ArrowRight className="size-4" aria-hidden />
      </Link>
    </div>
  );
}
