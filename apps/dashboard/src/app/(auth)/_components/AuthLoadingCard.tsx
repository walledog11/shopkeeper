import { Loader2 } from "lucide-react";
import { authLoadingClassName } from "./auth-styles";

export function AuthLoadingCard({ variant = "card" }: { variant?: "card" | "form" }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={
        variant === "form"
          ? "flex min-h-[352px] items-center justify-center text-[color:var(--m-ink-3)]"
          : authLoadingClassName
      }
    >
      <Loader2 aria-hidden className="size-5 animate-spin" />
    </div>
  );
}
