import Link from "next/link";
import { cn } from "@/lib/ui/cn";

const variantClass = {
  primary: "m-btn-primary",
  outline: "m-btn-outline",
  light: "m-btn-light",
  ghost: "m-btn-ghost",
} as const;

type ButtonLinkProps = React.ComponentProps<typeof Link> & {
  variant?: keyof typeof variantClass;
  size?: "md" | "lg";
};

/** Flat pill link. `primary`/`outline` sit on light chapters; `light`/`ghost` on dark ones. */
export function ButtonLink({ variant = "primary", size = "md", className, ...props }: ButtonLinkProps) {
  return <Link className={cn("m-btn", size === "lg" && "m-btn-lg", variantClass[variant], className)} {...props} />;
}
