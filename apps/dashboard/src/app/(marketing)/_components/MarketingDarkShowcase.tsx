import type { ComponentProps, ElementType } from "react";
import { cn } from "@/lib/ui/cn";
import { marketingDarkShowcaseClass } from "./marketingUi";

type MarketingDarkShowcaseProps<T extends ElementType> = {
  as?: T;
  plain?: boolean;
} & Omit<ComponentProps<T>, "as">;

/** Dark product-demo panel shared across product detail hero visuals. */
export function MarketingDarkShowcase<T extends ElementType = "figure">({
  as,
  plain = false,
  className,
  ...props
}: MarketingDarkShowcaseProps<T>) {
  const Component = as ?? "figure";
  return (
    <Component
      className={cn(
        plain ? "rounded-3xl m-chapter--dark" : marketingDarkShowcaseClass,
        className,
      )}
      {...props}
    />
  );
}
