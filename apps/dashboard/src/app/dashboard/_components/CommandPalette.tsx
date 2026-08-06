"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bot, Sparkles } from "lucide-react";
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
import { dispatchNavProgressStart } from "./sidebar/sidebar-helpers";

interface Props {
  open: boolean;
  onClose: () => void;
  agentName: string;
}

export default function CommandPalette({ open, onClose, agentName }: Props) {
  const { push } = useRouter();
  const { open: openAgentPanel } = useAgentPanel();
  const [query, setQuery] = useState("");

  // Programmatic, so the shell's link delegation never sees it.
  function navigate(href: string) {
    if (href !== window.location.pathname) dispatchNavProgressStart();
    push(href);
    onClose();
  }

  function openDeskChat(instruction?: string) {
    openAgentPanel({ source: "command", ...(instruction ? { instruction } : {}) });
    setQuery("");
    onClose();
  }

  // What the merchant typed is already an instruction when it names an intent
  // ("refund 1234"); the palette hands it to the panel instead of making them
  // retype it. forceMount because cmdk would filter this row out against itself.
  const instruction = query.trim();

  return (
    <CommandDialog open={open} onOpenChange={(v) => !v && onClose()}>
      <CommandInput
        placeholder={`Search pages, or tell ${agentName} what to do…`}
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {/* An instruction is always a result, and cmdk does not count force-mounted
            rows — without this, typing one shows "No results found." above it. */}
        {!instruction && <CommandEmpty>No results found.</CommandEmpty>}
        <CommandGroup heading="Quick actions">
          {instruction && (
            <CommandItem
              forceMount
              value={`__instruct__${instruction}`}
              onSelect={() => openDeskChat(instruction)}
              className="gap-3 cursor-pointer"
            >
              <div className="size-7 rounded-md bg-muted flex items-center justify-center shrink-0">
                <Sparkles className="size-3.5 text-muted-foreground" />
              </div>
              <span className="flex-1 min-w-0 truncate text-sm font-medium">
                Ask {agentName}: {instruction}
              </span>
            </CommandItem>
          )}
          <CommandItem
            value={`Chat with ${agentName}`}
            keywords={["agent", "chat", "concierge", "desk", agentName]}
            onSelect={() => openDeskChat()}
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
