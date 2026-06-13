"use client";

import Link from "next/link";
import { ChevronDown, Plus } from "lucide-react";
import { OrgAvatar } from "@/components/OrgAvatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
  variant: "topBar" | "sheet";
}) {
  const { organization, userMemberships, setActive, mounted } = navAuth;
  const isTopBar = variant === "topBar";
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
          aria-label={organization?.name ?? "Switch workspace"}
          className={cn(
            "flex items-center outline-none text-left transition-colors",
            isTopBar
              ? "gap-2 px-2 py-1.5 rounded-md hover:bg-sidebar-accent shrink-0 max-w-[11rem]"
              : "w-full gap-2 rounded-lg p-1 transition-colors hover:bg-foreground/[0.05]",
          )}
        >
          {!isTopBar && (
            <OrgAvatar
              name={organization?.name}
              imageUrl={organization?.imageUrl}
              className="size-6 rounded-md bg-green-500/20 text-[13px] font-bold text-green-300 shrink-0"
            />
          )}
          {isTopBar ? (
            <>
              <span className="max-w-[8rem] truncate text-sm font-semibold text-sidebar-foreground">
                {organization?.name ?? "Workspace"}
              </span>
              <ChevronDown className="size-3 text-sidebar-foreground/40 shrink-0" />
            </>
          ) : (
            <>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-semibold leading-tight text-foreground">
                  {organization?.name ?? "Workspace"}
                </p>
              </div>
              <ChevronDown className="size-3.5 shrink-0 text-foreground/40" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="bottom"
        align="start"
        className="w-[var(--radix-dropdown-menu-trigger-width)] bg-popover border-border text-popover-foreground"
      >
        {mounted &&
          memberships?.map((mem) => {
            const isActive = mem.organization.id === organization?.id;

            return (
              <DropdownMenuItem
                key={mem.organization.id}
                onClick={() => switchOrganization(mem.organization.id)}
                className={cn(
                  "flex items-center gap-2.5 cursor-pointer focus:bg-accent",
                  isActive && "bg-accent/70",
                )}
              >
                <OrgAvatar
                  name={mem.organization.name}
                  imageUrl={mem.organization.imageUrl}
                  className="size-5 rounded bg-muted text-xs text-muted-foreground shrink-0"
                />
                <span className="flex-1 text-xs font-medium truncate">{mem.organization.name}</span>
                {isActive && <span className="size-1.5 rounded-full bg-green-400 shrink-0" />}
              </DropdownMenuItem>
            );
          })}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="cursor-pointer gap-2 focus:bg-accent">
          <Link href="/create-workspace" onClick={() => onClose?.()}>
            <Plus className="size-4 shrink-0 text-muted-foreground" />
            <span className="text-xs font-medium">Create workspace</span>
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
