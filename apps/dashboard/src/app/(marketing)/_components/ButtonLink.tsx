import Link from "next/link";
import { cn } from "@/lib/ui/cn";

const variantClass = {
  primary: "m-btn-primary",
  outline: "m-btn-outline",
  light: "m-btn-light",
  ghost: "m-btn-ghost",
} as const;

export type MarketingButtonVariant = keyof typeof variantClass;
export type MarketingButtonSize = "md" | "lg";

export function marketingButtonClass({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: MarketingButtonVariant;
  size?: MarketingButtonSize;
  className?: string;
}) {
  return cn("m-btn", size === "lg" && "m-btn-lg", variantClass[variant], className);
}

type ButtonLinkProps = React.ComponentProps<typeof Link> & {
  variant?: MarketingButtonVariant;
  size?: MarketingButtonSize;
};

/** Flat pill link. `primary`/`outline` sit on light chapters; `light`/`ghost` on dark ones. */
export function ButtonLink({ variant = "primary", size = "md", className, ...props }: ButtonLinkProps) {
  return <Link className={marketingButtonClass({ variant, size, className })} {...props} />;
}
