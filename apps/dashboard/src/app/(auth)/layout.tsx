import type { ReactNode } from "react";

const googleSansFlex =
  '"Google Sans Flex", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Google+Sans+Flex:opsz,wght@8..144,400..700&display=swap"
      />
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
    </>
  );
}
