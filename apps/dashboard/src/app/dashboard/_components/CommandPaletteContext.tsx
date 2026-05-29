"use client";

import { createContext, use, useCallback, useEffect, useMemo, useState } from "react";
import CommandPalette from "./CommandPalette";

interface CommandPaletteContextValue {
  open: () => void;
  close: () => void;
  toggle: () => void;
  isOpen: boolean;
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

export function useCommandPalette() {
  const ctx = use(CommandPaletteContext);
  if (!ctx) throw new Error("useCommandPalette must be used inside CommandPaletteProvider");
  return ctx;
}

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen(o => !o), []);
  const value = useMemo(() => ({ open, close, toggle, isOpen }), [close, isOpen, open, toggle]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        toggle();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggle]);

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      <CommandPalette open={isOpen} onClose={close} />
    </CommandPaletteContext.Provider>
  );
}
