"use client";

import { useRouter } from "next/navigation";
import { Bot } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useAgentPanel } from "./agent-panel/AgentPanelContext";
import { commandPaletteSections } from "./nav-items";

interface Props {
  open: boolean;
  onClose: () => void;
  agentName: string;
}

export default function CommandPalette({ open, onClose, agentName }: Props) {
  const { push } = useRouter();
  const { open: openAgentPanel } = useAgentPanel();

  function navigate(href: string) {
    push(href);
    onClose();
  }

  function openDeskChat() {
    openAgentPanel({ source: "command" });
    onClose();
  }

  return (
    <CommandDialog open={open} onOpenChange={(v) => !v && onClose()}>
      <CommandInput placeholder="Search pages and actions…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Quick actions">
          <CommandItem
            value={`Chat with ${agentName}`}
            keywords={["agent", "chat", "concierge", "desk", agentName]}
            onSelect={openDeskChat}
            className="gap-3 cursor-pointer"
          >
            <div className="size-7 rounded-md bg-muted flex items-center justify-center shrink-0">
              <Bot className="size-3.5 text-muted-foreground" />
            </div>
            <span className="flex-1 text-sm font-medium">Chat with {agentName}</span>
          </CommandItem>
        </CommandGroup>
        {commandPaletteSections.map(({ heading, items }) => (
          <CommandGroup key={heading} heading={heading}>
            {items.map((item) => (
              <CommandItem
                key={item.href}
                value={item.name}
                keywords={[item.href, item.name, item.description ?? ""]}
                onSelect={() => navigate(item.href)}
                className="gap-3 cursor-pointer"
              >
                <div className="size-7 rounded-md bg-muted flex items-center justify-center shrink-0">
                  <item.icon className="size-3.5 text-muted-foreground" />
                </div>
                <span className="flex-1 text-sm font-medium">{item.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
