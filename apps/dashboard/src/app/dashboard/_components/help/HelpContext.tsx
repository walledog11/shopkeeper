"use client";

import { createContext, use, useCallback, useMemo, type ReactNode } from "react";
import { useRightRail } from "../right-rail/RightRailContext";

interface HelpContextValue {
  isOpen: boolean;
  openHelp: () => void;
  closeHelp: () => void;
}

const HelpContext = createContext<HelpContextValue | null>(null);

export function HelpProvider({ children }: { children: ReactNode }) {
  const { isOpen, open, close } = useRightRail();

  const openHelp = useCallback(() => {
    open();
  }, [open]);

  const closeHelp = useCallback(() => {
    close();
  }, [close]);

  const value = useMemo(
    () => ({ isOpen, openHelp, closeHelp }),
    [closeHelp, isOpen, openHelp],
  );

  return <HelpContext.Provider value={value}>{children}</HelpContext.Provider>;
}

export function useHelp() {
  const ctx = use(HelpContext);
  if (!ctx) throw new Error("useHelp must be used within HelpProvider");
  return ctx;
}
