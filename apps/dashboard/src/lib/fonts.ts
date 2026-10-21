import { Newsreader } from "next/font/google";

// Shared by the public site and auth pages without preloading it in the dashboard.
export const newsreader = Newsreader({
  subsets: ["latin"],
  axes: ["opsz"],
  display: "swap",
  variable: "--font-newsreader",
});
