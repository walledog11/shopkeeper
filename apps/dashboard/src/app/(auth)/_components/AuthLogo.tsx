import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/ui/cn";
import { Store } from "lucide-react";

interface AuthLogoProps {
  href?: string;
  className?: string;
}

export function AuthLogo({ href = "/dashboard", className }: AuthLogoProps) {
  return (
    <Link href={href} className={cn("mx-auto flex w-fit items-center", className)}>
      <Store />
      <p className="ml-2">shopkeeper</p>
    </Link>
  );
}
