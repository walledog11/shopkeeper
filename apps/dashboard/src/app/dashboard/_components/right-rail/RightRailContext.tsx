"use client";

import {
  createContext,
  use,
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface RightRailContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

const RightRailContext = createContext<RightRailContextValue | null>(null);

export function RightRailProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => {
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const value = useMemo(
    () => ({ isOpen, open, close }),
    [close, isOpen],
  );

  return <RightRailContext.Provider value={value}>{children}</RightRailContext.Provider>;
}

export function useRightRail() {
  const ctx = use(RightRailContext);
  if (!ctx) throw new Error("useRightRail must be used within RightRailProvider");
  return ctx;
}
