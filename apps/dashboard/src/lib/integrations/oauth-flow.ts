import {
  isOAuthFlowMode,
  isOAuthOutcome,
  OAUTH_DONE_MESSAGE_TYPE,
  type OAuthDoneMessage,
  type OAuthFlowMode,
} from './oauth-contract';

export { OAUTH_DONE_MESSAGE_TYPE } from './oauth-contract';
export type { OAuthDoneMessage } from './oauth-contract';

export const OAUTH_POPUP_NAME = 'shopkeeper_oauth_popup';
export const OAUTH_POPUP_SESSION_KEY = 'shopkeeper-oauth-popup';
const OAUTH_RESULT_CHANNEL = 'shopkeeper-oauth-result';

export type OAuthLaunchResult =
  | { mode: 'popup'; popup: Window }
  | { mode: 'redirect' };

export function buildOAuthAuthUrl(path: string, params: Record<string, string | undefined>): string {
  const url = new URL(path, typeof window === 'undefined' ? 'http://localhost' : window.location.origin);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}`;
}

function withOAuthMode(value: string, mode: OAuthFlowMode): string {
  const url = new URL(value, window.location.origin);
  url.searchParams.set('mode', mode);
  return url.origin === window.location.origin ? `${url.pathname}${url.search}${url.hash}` : url.toString();
}

function markOAuthPopupSession(target?: Window): void {
  if (typeof window === 'undefined') return;
  try {
    (target ?? window).sessionStorage.setItem(OAUTH_POPUP_SESSION_KEY, '1');
  } catch {
    // Ignore storage failures in restricted contexts.
  }
}

function clearOAuthPopupSession(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(OAUTH_POPUP_SESSION_KEY);
  } catch {
    // Ignore storage failures in restricted contexts.
  }
}

/** Used only when callback state was unavailable and no trusted mode reached the completion URL. */
export function isOAuthPopupWindow(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(OAUTH_POPUP_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

export function resolveOAuthCompletionMode(value: unknown): OAuthFlowMode {
  if (isOAuthFlowMode(value)) return value;
  return isOAuthPopupWindow() ? 'popup' : 'redirect';
}

function publishOAuthDone(payload: OAuthDoneMessage): void {
  if (typeof window === 'undefined') return;

  let postedToOpener = false;
  if (window.opener && window.opener !== window) {
    try {
      window.opener.postMessage(payload, window.location.origin);
      postedToOpener = true;
    } catch {
      // Cross-origin redirects can break opener references.
    }
  }

  if (postedToOpener) return;
  try {
    const channel = new BroadcastChannel(OAUTH_RESULT_CHANNEL);
    channel.postMessage(payload);
    channel.close();
  } catch {
    // BroadcastChannel may be unavailable in some environments.
  }
}

export function subscribeOAuthDone(onResult: (payload: OAuthDoneMessage) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  function onMessage(event: MessageEvent) {
    if (event.origin !== window.location.origin || !isOAuthDoneMessage(event.data)) return;
    onResult(event.data);
  }

  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(OAUTH_RESULT_CHANNEL);
    channel.onmessage = (event: MessageEvent<OAuthDoneMessage>) => {
      if (isOAuthDoneMessage(event.data)) onResult(event.data);
    };
  } catch {
    // Ignore BroadcastChannel setup failures.
  }

  window.addEventListener('message', onMessage);
  return () => {
    window.removeEventListener('message', onMessage);
    channel?.close();
  };
}

export function finishOAuthPopup(payload: OAuthDoneMessage): void {
  publishOAuthDone(payload);
  clearOAuthPopupSession();
  window.close();
}

export function openOAuthPopup(url: string): OAuthLaunchResult {
  if (typeof window === 'undefined') return { mode: 'redirect' };

  const desktop = window.matchMedia('(min-width: 768px)').matches;
  if (!desktop) {
    window.location.href = withOAuthMode(url, 'redirect');
    return { mode: 'redirect' };
  }

  const features = 'width=720,height=820,menubar=no,toolbar=no,location=no,status=no';
  const popup = window.open('', OAUTH_POPUP_NAME, features);
  if (!popup) {
    window.location.href = withOAuthMode(url, 'redirect');
    return { mode: 'redirect' };
  }

  markOAuthPopupSession(popup);
  popup.location.href = withOAuthMode(url, 'popup');
  popup.focus();
  return { mode: 'popup', popup };
}

export function watchOAuthPopup(popup: Window, onClosed: () => void): () => void {
  const timer = window.setInterval(() => {
    if (popup.closed) {
      window.clearInterval(timer);
      onClosed();
    }
  }, 400);

  return () => window.clearInterval(timer);
}

export function isOAuthDoneMessage(data: unknown): data is OAuthDoneMessage {
  if (!data || typeof data !== 'object') return false;
  const message = data as Partial<OAuthDoneMessage>;
  return message.type === OAUTH_DONE_MESSAGE_TYPE && isOAuthOutcome(message.outcome);
}
