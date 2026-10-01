import type { ReactNode } from "react";
import { Newsreader, Red_Hat_Mono } from "next/font/google";

// Loaded here, not in the root layout, so the dashboard doesn't preload them.
const newsreader = Newsreader({
  subsets: ["latin"],
  axes: ["opsz"],
  display: "swap",
  variable: "--font-newsreader",
});

const redHatMono = Red_Hat_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-red-hat-mono",
});

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return <div className={`m-page ${newsreader.variable} ${redHatMono.variable}`}>{children}</div>;
}
