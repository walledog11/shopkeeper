import type { Metadata, Viewport } from "next";
import { Providers } from "./providers";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Shopkeeper — AI support for Shopify brands",
  description:
    "Consolidate customer messages from Instagram, TikTok, Shopify, and email into one AI-powered dashboard. Respond faster and smarter.",
  icons: {
    icon: "/logos/shopkeeper-shop-logo.png",
    apple: "/logos/shopkeeper-shop-logo.png",
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
    <html lang="en">
      <body className="font-sans antialiased">
        <Providers publishableKey={publishableKey}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
