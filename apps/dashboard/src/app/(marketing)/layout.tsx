import type { ReactNode } from "react";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {/* Fixed white backdrop (same fixed-layer pattern as before for iOS). */}
      <div className="m-paper-bg" aria-hidden />
      <div
        className="m-paper-sheet"
        style={{
          /* Ink text over the fixed backdrop; the sheet itself is transparent.
             overflow-x must be `clip`, not `hidden`: hidden creates a scroll
             container and silently breaks position:sticky on the navbar. */
          color: "#2b2118",
          minHeight: "100vh",
          overflowX: "clip",
          "--m-mono": "ui-monospace, SFMono-Regular, 'SF Mono', Consolas, 'Liberation Mono', monospace",
        } as React.CSSProperties}
      >
        {children}
      </div>
    </>
  );
}
