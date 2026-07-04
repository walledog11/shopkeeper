import type { Metadata, Viewport } from "next";
import { Caveat, Just_Another_Hand } from "next/font/google";
import { getDashboardAppUrl } from "@/lib/env";
import { Providers } from "./providers";
import "./globals.css";

const caveat = Caveat({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-caveat",
});

const justAnotherHand = Just_Another_Hand({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  variable: "--font-just-another-hand",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const title = "Shopkeeper — the AI employee for your Shopify store";
const description =
  "Shopkeeper is the AI employee for your Shopify store. It answers customers overnight, fixes orders directly in Shopify, and texts you on iMessage or Telegram when it needs your call.";

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
    images: [{ url: "/og.png", width: 1200, height: 630, alt: title }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!publishableKey) {
    throw new Error("Missing NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
  }

  return (
    <html lang="en" className={`${caveat.variable} ${justAnotherHand.variable}`}>
      <body className="font-sans antialiased">
        <Providers publishableKey={publishableKey}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
