"use client";

import { useCallback, useEffect, useState } from 'react';
import { useSingleFlightOperation } from '@/hooks/useSingleFlightOperation';
import { errorMessageFromUnknown, isApiRequestError, requestJson } from '@/lib/api/fetcher';
import { DEFAULT_CHAT_SETTINGS, validateChatSettings, type ChatConfigurationResponse, type PublishedChatConfiguration, type StorefrontChatSettings } from '@/lib/storefront-chat/configuration';

const endpoint = '/api/integrations/shopify/storefront-chat/configuration';
type Action = 'save' | 'enable' | 'disable' | 'reload';

export function useChatEditor(initialData: ChatConfigurationResponse, draftKey: string, canManage: boolean) {
  const [data, setData] = useState(initialData);
  const [settings, setSettings] = useState(initialData.configuration?.settings ?? DEFAULT_CHAT_SETTINGS);
  const [draftRevision, setDraftRevision] = useState(initialData.configuration?.revision ?? 0);
  const [restored, setRestored] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const dirty = JSON.stringify(settings) !== JSON.stringify(data.configuration?.settings ?? DEFAULT_CHAT_SETTINGS);
  const validation = validateChatSettings(settings);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(draftKey);
      if (raw && canManage) {
        const draft = JSON.parse(raw);
        const parsed = validateChatSettings(draft.settings);
        if (parsed.settings && Number.isSafeInteger(draft.revision) && draft.revision >= 0
          && JSON.stringify(parsed.settings) !== JSON.stringify(initialData.configuration?.settings ?? DEFAULT_CHAT_SETTINGS)) {
          setSettings(parsed.settings);
          setDraftRevision(draft.revision);
          setConflict(draft.revision !== (initialData.configuration?.revision ?? 0));
          setRestored(true);
        }
      }
    } catch { /* Storage may be unavailable in private browsing. */ }
    setHydrated(true);
  }, [draftKey, initialData, canManage]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      if (dirty && canManage) sessionStorage.setItem(draftKey, JSON.stringify({ revision: draftRevision, settings }));
      else sessionStorage.removeItem(draftKey);
    } catch { /* Saving to the store still works without local storage. */ }
  }, [hydrated, dirty, draftKey, draftRevision, settings, canManage]);

  useEffect(() => {
    if (!dirty && !uploading) return;
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [dirty, uploading]);

  const operation = useSingleFlightOperation(async (nextAction: Action, snapshot: StorefrontChatSettings, revision: number) => {
    setAction(nextAction);
    if (nextAction === 'reload') {
      const latest = await requestJson<ChatConfigurationResponse>(endpoint, { signal: AbortSignal.timeout(20_000) }, 'Could not reload settings. Your draft is still here.');
      setData(latest);
      setSettings(latest.configuration?.settings ?? DEFAULT_CHAT_SETTINGS);
      setDraftRevision(latest.configuration?.revision ?? 0);
      setConflict(false); setRestored(false);
      return;
    }
    if (nextAction === 'save' || nextAction === 'enable') {
      const parsed = validateChatSettings(snapshot);
      if (!parsed.settings) throw new Error(parsed.error);
      if (dirty || !data.configuration) {
        const result = await requestJson<{ configuration: PublishedChatConfiguration }>(endpoint, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ settings: parsed.settings, revision }), signal: AbortSignal.timeout(20_000),
        }, 'Could not confirm the save. Your draft is still here. Try again.');
        setData(current => ({ ...current, configuration: result.configuration }));
        // Typing can continue while saving. A late response must not erase newer edits.
        setSettings(current => current === snapshot ? result.configuration.settings : current);
        setDraftRevision(result.configuration.revision);
        setRestored(false);
      }
    }
    if (nextAction === 'enable' || nextAction === 'disable') {
      const result = await requestJson<{ enabled: boolean }>('/api/integrations/shopify/storefront-chat', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextAction === 'enable' }), signal: AbortSignal.timeout(20_000),
      }, 'Could not update chat. Please try again.');
      setData(current => ({ ...current, enabled: result.enabled }));
    }
  }, cause => cause instanceof Error && cause.name === 'TimeoutError'
    ? 'This is taking longer than expected. Your draft is kept here. Try again.'
    : errorMessageFromUnknown(cause, 'Could not save your changes. Please try again.'));

  const busy = operation.state.status === 'pending';
  const run = (nextAction: Action) => {
    if (!canManage || !hydrated || busy || uploading || (conflict && nextAction !== 'reload' && nextAction !== 'disable')) return;
    void operation.run(nextAction, settings, draftRevision).catch(cause => {
      if (isApiRequestError(cause, 409)) setConflict(true);
    });
  };
  const change = useCallback((changes: Partial<StorefrontChatSettings>) => {
    setSettings(current => ({ ...current, ...changes }));
    setRestored(false);
  }, []);

  function discard() {
    if (busy || uploading) return;
    setSettings(data.configuration?.settings ?? DEFAULT_CHAT_SETTINGS);
    setDraftRevision(data.configuration?.revision ?? 0);
    setRestored(false);
    operation.reset();
  }

  return {
    data, settings, dirty, validation, uploading, setUploading, conflict, restored, hydrated, busy, action,
    error: operation.state.status === 'failed' ? operation.state.message : null,
    saved: operation.state.status === 'succeeded' && !dirty,
    run, change, discard,
  };
}
