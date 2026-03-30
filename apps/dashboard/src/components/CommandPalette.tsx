"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, Home, Inbox, BarChart2, Users, Settings, Plug } from "lucide-react";

const COMMANDS = [
  { label: "Home", href: "/dashboard", icon: Home, group: "Navigate" },
  { label: "Support Tickets", href: "/dashboard/tickets", icon: Inbox, group: "Navigate" },
  { label: "Analytics", href: "/dashboard/analytics", icon: BarChart2, group: "Navigate" },
  { label: "Team", href: "/dashboard/team", icon: Users, group: "Navigate" },
  { label: "Settings", href: "/dashboard/settings", icon: Settings, group: "Navigate" },
  { label: "Integrations", href: "/dashboard/integrations", icon: Plug, group: "Navigate" },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function CommandPalette({ open, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = COMMANDS.filter(c =>
    c.label.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      // Defer focus so the element is visible first
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  function navigate(href: string) {
    router.push(href);
    onClose();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      const cmd = filtered[activeIndex];
      if (cmd) navigate(cmd.href);
    } else if (e.key === "Escape") {
      onClose();
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] bg-black/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden"
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search pages and actions…"
            className="flex-1 text-sm text-slate-900 placeholder:text-slate-400 outline-none bg-transparent"
          />
          <kbd className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="py-1.5 max-h-72 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">
              No results for &ldquo;{query}&rdquo;
            </p>
          ) : (
            filtered.map((cmd, i) => (
              <button
                key={cmd.href}
                onClick={() => navigate(cmd.href)}
                onMouseEnter={() => setActiveIndex(i)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  i === activeIndex ? "bg-slate-50" : "hover:bg-slate-50"
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 transition-colors ${
                    i === activeIndex ? "bg-indigo-100" : "bg-slate-100"
                  }`}
                >
                  <cmd.icon
                    className={`w-3.5 h-3.5 transition-colors ${
                      i === activeIndex ? "text-indigo-600" : "text-slate-500"
                    }`}
                  />
                </div>
                <span className={`flex-1 text-sm font-medium ${i === activeIndex ? "text-slate-900" : "text-slate-600"}`}>
                  {cmd.label}
                </span>
                <span className="text-[10px] text-slate-400">{cmd.group}</span>
              </button>
            ))
          )}
        </div>

        {/* Footer hints */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-slate-100 bg-slate-50">
          <span className="flex items-center gap-1 text-[10px] text-slate-400">
            <kbd className="font-semibold bg-white border border-slate-200 px-1 py-0.5 rounded text-[9px]">↑↓</kbd>
            Navigate
          </span>
          <span className="flex items-center gap-1 text-[10px] text-slate-400">
            <kbd className="font-semibold bg-white border border-slate-200 px-1 py-0.5 rounded text-[9px]">↵</kbd>
            Open
          </span>
          <span className="flex items-center gap-1 text-[10px] text-slate-400">
            <kbd className="font-semibold bg-white border border-slate-200 px-1 py-0.5 rounded text-[9px]">ESC</kbd>
            Close
          </span>
        </div>
      </div>
    </div>
  );
}
