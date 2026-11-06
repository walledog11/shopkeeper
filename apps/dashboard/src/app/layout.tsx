import type { Metadata, Viewport } from "next";
import { Caveat } from "next/font/google";
import { headers } from "next/headers";
import { getDashboardAppUrl } from "@/lib/env";
import { Providers } from "./providers";
import "./globals.css";

const caveat = Caveat({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-caveat",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const title = "Shopkeeper — customer support that texts you before it acts";
const description =
  "Shopkeeper answers your Instagram DMs and emails using your real orders in Shopify. Routine questions get answered on their own. Changes and refunds wait for your yes, by text.";

export const metadata: Metadata = {
  metadataBase: new URL(getDashboardAppUrl()),
  title,
  description,
  icons: {
    icon: "/logos/shopkeeper-shop-logo.png",
    apple: "/logos/shopkeeper-shop-logo.png",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Shopkeeper",
    title,
    description,
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!publishableKey) {
    throw new Error("Missing NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
  }

  // Clerk's middleware mints the CSP nonce and forwards it as `x-nonce`. The
  // client ClerkProvider cannot read request headers, so thread it through as a
  // prop or `clerk.browser.js` renders un-nonced and 'strict-dynamic' blocks it.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="en" className={caveat.variable}>
      <body className="font-sans antialiased">
        <Providers publishableKey={publishableKey} nonce={nonce}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
