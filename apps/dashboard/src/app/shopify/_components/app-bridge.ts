"use client";

import { requestJson } from '@/lib/api/fetcher';

interface AppBridge {
  idToken(): Promise<string>;
}

/** A fresh Shopify ID token for this admin session; App Bridge's tokens last a minute. */
function shopifyIdToken(): Promise<string> {
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

/**
 * Loads the app home again with a fresh ID token in its URL, which its server
 * render verifies. `retryParam` marks the load as a retry, so a token that still
 * fails there shows an error instead of bouncing again.
 */
export async function reloadWithFreshToken(retryParam?: string): Promise<void> {
  const url = new URL(window.location.href);
  url.searchParams.set('id_token', await shopifyIdToken());
  if (retryParam) url.searchParams.set(retryParam, '1');
  window.location.replace(url.toString());
}
