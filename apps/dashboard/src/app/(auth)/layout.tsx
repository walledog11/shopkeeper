import type { ReactNode } from "react";

const googleSansFlex =
  '"Google Sans Flex", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="dashboard-shell m-grain min-h-screen font-sans"
      style={
        {
          backgroundColor: "#f6f2eb",
          color: "#2b2118",
          "--font-google-sans-flex": googleSansFlex,
          "--m-serif": "Georgia, 'Times New Roman', serif",
          fontFamily: googleSansFlex,
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}
