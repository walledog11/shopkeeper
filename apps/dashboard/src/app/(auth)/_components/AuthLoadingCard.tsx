import { Loader2 } from "lucide-react";
import { authLoadingClassName } from "./auth-styles";

export function AuthLoadingCard() {
  return (
    <div className={authLoadingClassName}>
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </div>
  );
}
