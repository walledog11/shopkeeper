import type { ComponentProps } from "react";
import { cn } from "@/lib/ui/cn";
import { marketingSectionClass } from "./marketingUi";

/** Standard home / marketing section shell: width, scroll margin, responsive padding. */
export function MarketingSection({
  className,
  ...props
}: ComponentProps<"section">) {
  return <section className={cn(marketingSectionClass, className)} {...props} />;
}
