"use client";

import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { NavAuth } from "./useNavAuth";

export function LogOutButton({
  navAuth,
  variant = "default",
  onClick,
}: {
  navAuth: NavAuth;
  variant?: "default" | "sheet";
  onClick?: () => void;
}) {
  const { signOut } = navAuth;

  const handleClick = () => {
    onClick?.();
    void signOut({ redirectUrl: "/login" });
  };

  if (variant === "sheet") {
    return (
      <button
        type="button"
        onClick={handleClick}
        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold text-destructive transition-colors hover:bg-foreground/[0.05]"
      >
        <LogOut className="size-4 shrink-0" />
        Log out
      </button>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      className="h-8 border-foreground/[0.10] text-xs font-semibold text-destructive hover:bg-red-500/[0.08] hover:text-destructive"
    >
      <LogOut className="size-3" />
      Log out
    </Button>
  );
}
