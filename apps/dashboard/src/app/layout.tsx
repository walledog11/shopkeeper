import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Google_Sans_Flex } from "next/font/google";
import "./globals.css";

const googleSansFlex = Google_Sans_Flex({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-google-sans-flex",
});

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
  return (
    <html lang="en" className={googleSansFlex.variable}>
      <body className={`${googleSansFlex.className} antialiased`}>
        <ClerkProvider>
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
