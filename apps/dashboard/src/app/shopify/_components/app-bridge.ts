"use client";

import { requestJson } from '@/lib/api/fetcher';

interface AppBridge {
  idToken(): Promise<string>;
}

/** A fresh Shopify ID token for this admin session; App Bridge's tokens last a minute. */
export function shopifyIdToken(): Promise<string> {
  const bridge = (window as Window & { shopify?: AppBridge }).shopify;
  if (!bridge) return Promise.reject(new Error("Shopify admin didn't finish loading. Reload the page."));
  return bridge.idToken();
}

/** `requestJson` for the Shopify app routes, which authenticate with that token. */
export async function shopifyAppRequest<T>(url: string, init: RequestInit = {}, fallbackError?: string): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${await shopifyIdToken()}`);
  return requestJson<T>(url, { ...init, headers }, fallbackError);
}
