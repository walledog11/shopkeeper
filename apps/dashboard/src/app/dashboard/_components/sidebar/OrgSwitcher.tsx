"use client";

import { ChevronDown } from "lucide-react";
import { OrgAvatar } from "@/components/OrgAvatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/ui/cn";
import type { NavAuth } from "./useNavAuth";

type WorkspaceMembership = {
  organization: {
    id: string;
    name: string;
    imageUrl?: string | null;
  };
};

export function OrgSwitcher({
  navAuth,
  onSwitching,
  onClose,
  variant,
}: {
  navAuth: NavAuth;
  onSwitching: (v: boolean) => void;
  onClose?: () => void;
  variant: "desktop" | "mobile" | "mobileCompact";
}) {
  const { organization, userMemberships, setActive, mounted, planName, seatCount } = navAuth;
  const isMobile = variant === "mobile";
  const isCompact = variant === "desktop" || variant === "mobileCompact";
  const memberships = userMemberships.data as WorkspaceMembership[] | undefined;

  const switchOrganization = async (organizationId: string) => {
    if (organizationId === organization?.id || !setActive) return;

    onClose?.();
    onSwitching(true);

    try {
      await setActive({ organization: organizationId });
      window.location.reload();
    } catch (error) {
      console.error("Failed to switch workspace", error);
      onSwitching(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "w-full flex items-center outline-none text-left transition-colors hover:bg-white/[0.06]",
            isMobile ? "gap-2.5 px-3 py-2.5 mb-4 rounded-lg" : "gap-2 p-1 rounded-lg hover:bg-white/[0.04]",
          )}
        >
          <OrgAvatar
            name={organization?.name}
            imageUrl={organization?.imageUrl}
            className={cn(
              "rounded-md bg-green-500/20 text-[13px] font-bold text-green-300 shrink-0",
              isCompact ? "size-6" : "size-9",
            )}
          />
          <div className="flex-1 min-w-0">
            <p className={cn("font-bold text-white truncate leading-tight", isCompact ? "text-xs" : "text-sm")}>
              {organization?.name ?? "Workspace"}
            </p>
            <p className="text-xs font-medium text-white/40 truncate leading-tight mt-0.5">
              {planName} plan · {seatCount} seat{seatCount === 1 ? "" : "s"}
            </p>
          </div>
          <ChevronDown className={cn("text-white/30 shrink-0", isCompact ? "size-3.5" : "size-4")} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="bottom"
        align="start"
        className="w-[var(--radix-dropdown-menu-trigger-width)] bg-popover border-white/[0.09] text-white"
      >
        {mounted &&
          memberships?.map((mem) => {
            const isActive = mem.organization.id === organization?.id;

            return (
              <DropdownMenuItem
                key={mem.organization.id}
                onClick={() => switchOrganization(mem.organization.id)}
                className={cn(
                  "flex items-center gap-2.5 cursor-pointer focus:bg-white/[0.07]",
                  isActive && "bg-white/[0.04]",
                )}
              >
                <OrgAvatar
                  name={mem.organization.name}
                  imageUrl={mem.organization.imageUrl}
                  className="size-5 rounded bg-white/10 text-xs text-white/70 shrink-0"
                />
                <span className="flex-1 text-xs font-medium text-white/80 truncate">{mem.organization.name}</span>
                {isActive && <span className="size-1.5 rounded-full bg-green-400 shrink-0" />}
              </DropdownMenuItem>
            );
          })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
