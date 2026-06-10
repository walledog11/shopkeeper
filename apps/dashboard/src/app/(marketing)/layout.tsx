import type { ReactNode } from "react";
import { Instrument_Serif, Inter } from "next/font/google";

const serif = Instrument_Serif({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  display: "swap",
});

const sans = Inter({ subsets: ["latin"], display: "swap" });

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={sans.className}
      style={{
        /* Warm paper background and ink text — overrides body's dark theme */
        background: "#f6f2eb",
        color: "#161413",
        minHeight: "100vh",
        overflowX: "hidden",
        "--m-serif": `${serif.style.fontFamily}, Georgia, 'Times New Roman', serif`,
        "--m-mono": "ui-monospace, SFMono-Regular, 'SF Mono', Consolas, 'Liberation Mono', monospace",
      } as React.CSSProperties}
    >
      {children}
    </div>
  );
}
