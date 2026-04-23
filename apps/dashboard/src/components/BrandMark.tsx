import Link from "next/link";
import { cn } from "@/lib/ui/cn";

interface BrandMarkProps {
  href?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: {
    container: "gap-1.5",
    word: "text-lg",
    dot: "mt-1 size-2",
  },
  md: {
    container: "gap-1.5",
    word: "text-xl",
    dot: "mt-1 size-2",
  },
  lg: {
    container: "gap-2",
    word: "text-3xl",
    dot: "mt-1.5 size-2.5",
  },
} as const;

export function BrandMark({
  href = "/",
  className,
  size = "md",
}: BrandMarkProps) {
  const styles = sizeClasses[size];

  return (
    <Link
      href={href}
      className={cn(
        "inline-flex w-fit items-start text-white transition-opacity hover:opacity-90",
        styles.container,
        className,
      )}
    >
      <span className={cn("font-black tracking-tight", styles.word)}>clerk</span>
      <span className={cn("shrink-0 rounded-full bg-green-400", styles.dot)} />
    </Link>
  );
}
