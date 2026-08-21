import type { ReactNode } from "react";

const generalSans =
  '"General Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="dashboard-shell m-grain min-h-screen font-sans"
      style={
        {
          backgroundColor: "#f6f2eb",
          color: "#2b2118",
          "--font-general-sans": generalSans,
          "--m-serif": "Georgia, 'Times New Roman', serif",
          fontFamily: generalSans,
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}
