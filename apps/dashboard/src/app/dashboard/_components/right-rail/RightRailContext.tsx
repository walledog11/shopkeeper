"use client";

import {
  createContext,
  use,
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type RightRailTab = "concierge" | "help";

interface RightRailContextValue {
  isOpen: boolean;
  tab: RightRailTab;
  openTab: (tab: RightRailTab) => void;
  close: () => void;
}

const RightRailContext = createContext<RightRailContextValue | null>(null);

export function RightRailProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTabState] = useState<RightRailTab>("concierge");

  const setTab = useCallback((next: RightRailTab) => {
    setTabState(next);
  }, []);

  const openTab = useCallback((next: RightRailTab) => {
    setTab(next);
    setIsOpen(true);
  }, [setTab]);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const value = useMemo(
    () => ({ isOpen, tab, openTab, close }),
    [close, isOpen, openTab, tab],
  );

  return <RightRailContext.Provider value={value}>{children}</RightRailContext.Provider>;
}

export function useRightRail() {
  const ctx = use(RightRailContext);
  if (!ctx) throw new Error("useRightRail must be used within RightRailProvider");
  return ctx;
}
