import { Newsreader } from "next/font/google";

// The one serif: the public site, the auth pages and the onboarding headlines.
// The dashboard itself stays in the sans and never loads it.
export const newsreader = Newsreader({
  subsets: ["latin"],
  axes: ["opsz"],
  display: "swap",
  variable: "--font-newsreader",
});
