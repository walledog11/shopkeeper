import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface AuthBackLinkProps {
  href: string;
  label: string;
}

export function AuthBackLink({ href, label }: AuthBackLinkProps) {
  return (
    <Link
      href={href}
      className="inline-flex w-full items-center justify-center gap-2 pt-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      <span>{label}</span>
    </Link>
  );
}
