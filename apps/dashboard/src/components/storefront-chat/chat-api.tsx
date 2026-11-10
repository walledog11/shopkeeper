"use client";

import Link from 'next/link';
import { createContext, useContext, type ComponentProps, type ReactNode } from 'react';
import { requestJson } from '@/lib/api/fetcher';

/**
 * Where the website chat editor reads and writes. The dashboard uses its own
 * routes with the Clerk session; the app home inside Shopify admin swaps in
 * Shopify-authenticated routes and opens dashboard pages in a new tab.
 */
export interface StorefrontChatApi {
  configurationUrl: string;
  /** Setup checks (GET) and turning chat on or off (PATCH). */
  setupUrl: string;
  pictureUrl: string;
  previewUrl: string;
  request: typeof requestJson;
  /** Set inside Shopify admin, where dashboard links open this origin in a new tab. */
  appUrl?: string;
}

const DASHBOARD_API: StorefrontChatApi = {
  configurationUrl: '/api/integrations/shopify/storefront-chat/configuration',
  setupUrl: '/api/integrations/shopify/storefront-chat',
  pictureUrl: '/api/integrations/shopify/storefront-chat/image',
  previewUrl: '/api/integrations/shopify/storefront-chat/preview',
  request: requestJson,
};

const StorefrontChatApiContext = createContext<StorefrontChatApi>(DASHBOARD_API);

export const StorefrontChatApiProvider = StorefrontChatApiContext.Provider;

export function useStorefrontChatApi(): StorefrontChatApi {
  return useContext(StorefrontChatApiContext);
}

// Spreads the rest so `Button asChild` can style it.
export function DashboardLink({ href, children, ...props }: { href: string; children: ReactNode } & Omit<ComponentProps<'a'>, 'href'>) {
  const { appUrl } = useStorefrontChatApi();
  if (appUrl) {
    return <a {...props} href={`${appUrl}${href}`} target="_blank" rel="noopener">{children}</a>;
  }
  return <Link {...props} href={href}>{children}</Link>;
}
