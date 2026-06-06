import type { ReactNode } from "react";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div
      data-page="marketing"
      style={{
        /* Hardcoded cream background and dark text , overrides body's dark theme */
        background: "#ffffff",
        color: "#161413",
        minHeight: "100vh",
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        "--m-serif": "Georgia, Cambria, 'Times New Roman', serif",
        "--m-mono": "ui-monospace, SFMono-Regular, 'SF Mono', Consolas, 'Liberation Mono', monospace",
      } as React.CSSProperties}
    >
      {children}
    </div>
  );
}
