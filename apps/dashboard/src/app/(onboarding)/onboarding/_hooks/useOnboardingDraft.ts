"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  DEFAULT_DATA,
  STEPS,
  STORAGE_KEY,
  type OnboardingData,
} from "../_components/model";
import { parseStoredOnboardingState } from "../_lib/onboarding-state";

interface DraftState {
  data: OnboardingData;
  hydrated: boolean;
  idx: number;
  prefilledEmail: string | null;
}

type DraftAction =
  | { type: "advance" }
  | { type: "back" }
  | { type: "hydrate"; data: OnboardingData; idx: number }
  | { type: "hydrateSkipped" }
  | { type: "patch"; patch: Partial<OnboardingData> }
  | { type: "prefillEmail"; email: string };

function createDraftState(pinnedStepIndex: number | null): DraftState {
  return {
    data: DEFAULT_DATA,
    hydrated: false,
    idx: pinnedStepIndex ?? 0,
    prefilledEmail: null,
  };
}

function draftReducer(state: DraftState, action: DraftAction): DraftState {
  switch (action.type) {
    case "advance":
      return { ...state, idx: Math.min(STEPS.length - 1, state.idx + 1) };
    case "back":
      return { ...state, idx: Math.max(0, state.idx - 1) };
    case "hydrate":
      return { ...state, data: action.data, idx: action.idx, hydrated: true };
    case "hydrateSkipped":
      return state.hydrated ? state : { ...state, hydrated: true };
    case "patch":
      return { ...state, data: { ...state.data, ...action.patch } };
    case "prefillEmail":
      if (state.prefilledEmail === action.email) return state;
      return {
        ...state,
        prefilledEmail: action.email,
        data: state.data.primaryEmail.trim()
          ? state.data
          : { ...state.data, primaryEmail: action.email },
      };
  }
}

export function useOnboardingDraft({
  founderName,
  organizationName,
  pinnedStepIndex,
  savedEmail,
}: {
  founderName: string | null | undefined;
  organizationName: string | null | undefined;
  pinnedStepIndex: number | null;
  savedEmail: string | undefined;
}) {
  const [state, dispatch] = useReducer(draftReducer, pinnedStepIndex, createDraftState);
  const founderPrefillApplied = useRef(false);
  const storePrefillApplied = useRef(false);
  const hydrationStarted = useRef(false);

  useEffect(() => {
    if (hydrationStarted.current) return;
    hydrationStarted.current = true;
    let stored = null;
    try {
      stored = parseStoredOnboardingState(localStorage.getItem(STORAGE_KEY));
    } catch {
      // Storage can be unavailable in restricted browser contexts.
    }
    if (!stored) {
      dispatch({ type: "hydrateSkipped" });
      return;
    }
    dispatch({
      type: "hydrate",
      data: stored.data,
      idx: pinnedStepIndex ?? stored.idx,
    });
  }, [pinnedStepIndex]);

  useEffect(() => {
    if (!state.hydrated || founderPrefillApplied.current || !founderName) return;
    founderPrefillApplied.current = true;
    if (!state.data.founderName.trim()) {
      dispatch({ type: "patch", patch: { founderName } });
    }
  }, [founderName, state.data.founderName, state.hydrated]);

  useEffect(() => {
    if (!state.hydrated || storePrefillApplied.current || !organizationName) return;
    storePrefillApplied.current = true;
    if (!state.data.storeName.trim()) {
      dispatch({ type: "patch", patch: { storeName: organizationName } });
    }
  }, [organizationName, state.data.storeName, state.hydrated]);

  useEffect(() => {
    if (savedEmail && state.prefilledEmail !== savedEmail) {
      dispatch({ type: "prefillEmail", email: savedEmail });
    }
  }, [savedEmail, state.prefilledEmail]);

  useEffect(() => {
    if (!state.hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state.data, idx: state.idx }));
    } catch {
      // Losing resumability is preferable to interrupting onboarding.
    }
  }, [state.data, state.hydrated, state.idx]);

  return {
    advance: useCallback(() => dispatch({ type: "advance" }), []),
    back: useCallback(() => dispatch({ type: "back" }), []),
    data: state.data,
    idx: state.idx,
    update: useCallback((patch: Partial<OnboardingData>) => {
      dispatch({ type: "patch", patch });
    }, []),
  };
}
