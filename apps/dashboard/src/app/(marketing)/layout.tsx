import type { ReactNode } from "react";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {/* Fixed crumpled-paper backdrop. A real fixed element (not
          background-attachment:fixed) so it stays sharp and works on iOS. */}
      <div className="m-paper-bg" aria-hidden />
      <div
        className="m-paper-sheet"
        style={{
          /* Ink text over the fixed paper backdrop; the sheet itself is
             transparent so the backdrop shows through.
             overflow-x must be `clip`, not `hidden`: hidden creates a scroll
             container and silently breaks position:sticky on the navbar. */
          color: "#2b2118",
          minHeight: "100vh",
          overflowX: "clip",
          "--m-serif": "Georgia, 'Times New Roman', serif",
          "--m-mono": "ui-monospace, SFMono-Regular, 'SF Mono', Consolas, 'Liberation Mono', monospace",
        } as React.CSSProperties}
      >
        {children}
      </div>
    </>
  );
}
