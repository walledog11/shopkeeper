import type { ReactNode } from "react";
import { Red_Hat_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { newsreader } from "@/lib/fonts";

// Loaded here, not in the root layout, so the dashboard doesn't preload them.
const redHatMono = Red_Hat_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-red-hat-mono",
});

// Page views are counted on the public site only, never inside the app.
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`m-page ${newsreader.variable} ${redHatMono.variable}`}>
      {children}
      <Analytics />
    </div>
  );
}
