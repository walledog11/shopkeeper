import Link from "next/link";
import { Store } from "lucide-react";
import { PRODUCT_NAME } from "@/lib/brand";
import { cn } from "@/lib/ui/cn";

export function ShopkeeperLogo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label={`${PRODUCT_NAME} home`}
      className={cn(
        "m-nav-logo shrink-0 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[color:var(--m-focus)]",
        className,
      )}
    >
      <Store className="size-7" strokeWidth={1.75} aria-hidden />
      <span className="m-nav-wordmark" aria-hidden>
        {PRODUCT_NAME.toLowerCase()}
      </span>
    </Link>
  );
}
