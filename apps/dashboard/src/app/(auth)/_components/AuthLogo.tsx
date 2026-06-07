import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/ui/cn";

interface AuthLogoProps {
  href?: string;
  className?: string;
}

export function AuthLogo({ href = "/dashboard", className }: AuthLogoProps) {
  return (
    <Link href={href} className={cn("mx-auto flex w-fit items-center", className)}>
      <Image
        src="/logos/shopkeeper-underline-logo.png"
        alt="Shopkeeper"
        width={120}
        height={32}
        className="h-8 w-auto"
        priority
      />
    </Link>
  );
}
