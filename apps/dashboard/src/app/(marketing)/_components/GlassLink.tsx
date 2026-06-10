import Link from "next/link";
import { cn } from "@/lib/ui/cn";

const variantClass = {
  primary: "m-glass-btn m-glass-btn-primary",
  secondary: "m-glass-btn m-glass-btn-secondary",
  light: "m-glass-btn m-glass-btn-light",
  outline: "m-glass-btn m-glass-btn-outline",
} as const;

type GlassLinkProps = React.ComponentProps<typeof Link> & {
  variant?: keyof typeof variantClass;
};

export function GlassLink({ variant = "primary", className, ...props }: GlassLinkProps) {
  return <Link className={cn(variantClass[variant], className)} {...props} />;
}
