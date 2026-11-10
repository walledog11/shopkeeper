import type { Metadata, Viewport } from "next";
import { Caveat } from "next/font/google";
import { headers } from "next/headers";
import { getMarketingSiteUrl, getShopifyOAuthAuthorizeConfig } from "@/lib/env";
import { SHOPIFY_APP_HOME_HEADER } from "@/proxy/shopify-app-home";
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

// URLs in the metadata (canonical, og:url, the preview image) resolve against
// the public site, not the app host that also serves these pages.
export const metadata: Metadata = {
  metadataBase: new URL(getMarketingSiteUrl()),
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
  const requestHeaders = await headers();

  // The app home inside Shopify admin: App Bridge reads the client id from the
  // meta tag and Shopify asks for its script ahead of the app's own. No Clerk
  // here: a third-party iframe holds no Clerk session.
  if (requestHeaders.get(SHOPIFY_APP_HOME_HEADER)) {
    return (
      <html lang="en" className={caveat.variable}>
        <head>
          <meta name="shopify-api-key" content={getShopifyOAuthAuthorizeConfig()?.clientId ?? ""} />
          {/* Shopify requires App Bridge unbundled from its CDN, loaded before the app's own scripts. */}
          {/* eslint-disable-next-line @next/next/no-sync-scripts */}
          <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" nonce={requestHeaders.get("x-nonce") ?? undefined} />
        </head>
        <body className="font-sans antialiased">{children}</body>
      </html>
    );
  }

  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!publishableKey) {
    throw new Error("Missing NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
  }

  // Clerk's middleware mints the CSP nonce and forwards it as `x-nonce`. The
  // client ClerkProvider cannot read request headers, so thread it through as a
  // prop or `clerk.browser.js` renders un-nonced and 'strict-dynamic' blocks it.
  const nonce = requestHeaders.get("x-nonce") ?? undefined;

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
