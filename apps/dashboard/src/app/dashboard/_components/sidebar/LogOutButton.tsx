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
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm font-medium text-destructive transition-colors hover:bg-sidebar-accent/80"
      >
        <LogOut className="size-[18px] shrink-0 stroke-[1.5]" />
        <span className="flex-1 leading-tight">Log out</span>
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
