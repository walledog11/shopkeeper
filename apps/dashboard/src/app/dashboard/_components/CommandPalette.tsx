"use client";

import { useRouter } from "next/navigation";
import { Home, Inbox, BarChart2, ScanEye, Users, Settings, Plug } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

const COMMANDS = [
  { label: "Home", href: "/dashboard", icon: Home, group: "Navigate" },
  { label: "Support Tickets", href: "/dashboard/tickets", icon: Inbox, group: "Navigate" },
  { label: "Analytics", href: "/dashboard/analytics", icon: BarChart2, group: "Navigate" },
  { label: "Review", href: "/dashboard/review", icon: ScanEye, group: "Navigate" },
  { label: "Team", href: "/dashboard/team", icon: Users, group: "Navigate" },
  { label: "Settings", href: "/dashboard/settings", icon: Settings, group: "Navigate" },
  { label: "Integrations", href: "/dashboard/integrations", icon: Plug, group: "Navigate" },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function CommandPalette({ open, onClose }: Props) {
  const { push } = useRouter();

  function navigate(href: string) {
    push(href);
    onClose();
  }

  return (
    <CommandDialog open={open} onOpenChange={(v) => !v && onClose()}>
      <CommandInput placeholder="Search pages and actions…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigate">
          {COMMANDS.map((cmd) => (
            <CommandItem
              key={cmd.href}
              value={cmd.label}
              onSelect={() => navigate(cmd.href)}
              className="gap-3 cursor-pointer"
            >
              <div className="size-7 rounded-md bg-white/[0.06] flex items-center justify-center shrink-0">
                <cmd.icon className="size-3.5 text-white/50" />
              </div>
              <span className="flex-1 text-sm font-medium">{cmd.label}</span>
              <span className="text-xs text-white/30">{cmd.group}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
