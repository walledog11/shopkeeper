"use client";

import { useCallback, useEffect, useReducer } from "react";
import { DEFAULT_DATA, STEPS, STORAGE_KEY, type OnboardingData } from "../_lib/onboarding-model";
import { parseStoredOnboardingState } from "../_lib/onboarding-state";

interface DraftState { data: OnboardingData; idx: number; scope: string | null }
type Action =
  | { type: "hydrate"; scope: string; data: OnboardingData; idx: number }
  | { type: "patch"; patch: Partial<OnboardingData> }
  | { type: "go"; idx: number };

function reducer(state: DraftState, action: Action): DraftState {
  if (action.type === "hydrate") return { scope: action.scope, data: action.data, idx: action.idx };
  if (action.type === "patch") return { ...state, data: { ...state.data, ...action.patch } };
  return { ...state, idx: Math.max(0, Math.min(STEPS.length - 1, action.idx)) };
}

export function useOnboardingDraft({ userId, organizationId, clerkLoaded, founderName, organizationName, pinnedStepIndex, savedEmail }: {
  userId: string | undefined;
  organizationId: string | undefined;
  clerkLoaded: boolean;
  founderName: string | null | undefined;
  organizationName: string | null | undefined;
  pinnedStepIndex: number | null;
  savedEmail: string | undefined;
}) {
  const scope = userId ? `${STORAGE_KEY}:${userId}:${organizationId ?? "new"}` : null;
  const [state, dispatch] = useReducer(reducer, { data: DEFAULT_DATA, idx: pinnedStepIndex ?? 0, scope: null });

  useEffect(() => {
    if (!clerkLoaded || !scope || state.scope === scope) return;
    let stored = null;
    try { stored = parseStoredOnboardingState(localStorage.getItem(scope)); } catch { /* Storage is optional. */ }
    // Carry the draft into an organization just created by this user, never into another workspace.
    const isNewWorkspace = state.scope === `${STORAGE_KEY}:${userId}:new`;
    const data = stored?.data ?? (isNewWorkspace ? state.data : DEFAULT_DATA);
    dispatch({ type: "hydrate", scope, idx: isNewWorkspace ? state.idx : pinnedStepIndex ?? stored?.idx ?? 0,
      data: { ...data, storeName: organizationName || data.storeName, founderName: founderName || data.founderName } });
  }, [clerkLoaded, founderName, organizationName, pinnedStepIndex, scope, state, userId]);

  useEffect(() => {
    if (savedEmail) dispatch({ type: "patch", patch: { primaryEmail: savedEmail } });
  }, [savedEmail]);

  useEffect(() => {
    if (!scope || state.scope !== scope) return;
    try { localStorage.setItem(scope, JSON.stringify({ ...state.data, idx: state.idx })); } catch { /* Storage is optional. */ }
  }, [scope, state]);

  const go = useCallback((idx: number) => {
    const bounded = Math.max(0, Math.min(STEPS.length - 1, idx));
    const url = new URL(window.location.href);
    url.searchParams.set("step", STEPS[bounded].id);
    for (const key of ["provider", "status", "error"]) url.searchParams.delete(key);
    window.history.pushState(null, "", `${url.pathname}${url.search}`);
    dispatch({ type: "go", idx: bounded });
  }, []);

  useEffect(() => {
    const onPop = () => {
      const step = new URL(window.location.href).searchParams.get("step");
      const idx = STEPS.findIndex(candidate => candidate.id === step);
      dispatch({ type: "go", idx: idx < 0 ? 0 : idx });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const clear = useCallback(() => {
    try {
      if (scope) localStorage.removeItem(scope);
      if (userId) localStorage.removeItem(`${STORAGE_KEY}:${userId}:new`);
    } catch { /* Storage is optional. */ }
  }, [scope, userId]);

  return {
    advance: () => go(state.idx + 1), back: () => go(state.idx - 1), go, clear,
    hydrated: Boolean(scope && state.scope === scope), data: state.data, idx: state.idx,
    update: useCallback((patch: Partial<OnboardingData>) => dispatch({ type: "patch", patch }), []),
  };
}
