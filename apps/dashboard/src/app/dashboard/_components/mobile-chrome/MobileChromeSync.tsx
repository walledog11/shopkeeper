"use client";

import { useEffect } from "react";
import { useMobileChrome } from "./MobileChromeContext";

export function MobileChromeSync() {
  const mode = useMobileChrome();

  useEffect(() => {
    document.documentElement.dataset.mobileChrome = mode;
    return () => {
      delete document.documentElement.dataset.mobileChrome;
    };
  }, [mode]);

  return null;
}
