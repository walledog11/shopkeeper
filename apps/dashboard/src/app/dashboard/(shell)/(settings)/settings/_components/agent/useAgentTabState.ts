"use client"

import { useEffect, useMemo, useReducer, useRef, useState, type SetStateAction } from "react"
import { useSWRConfig } from "swr"
import {
  agentSettingsReducer,
  applyTierDefaultsToInheritedSettings,
  buildAgentSettingsPatch,
  buildSettingsPayload,
  collectExplicitOverridePaths,
  hydrateSettings,
  hydrateSettingsFromStorage,
  rawInputsFor,
  resetPathToTierDefault,
  resolveBrowserTimezone,
  storeTimezonePatch,
  writeSettingsPath,
  type AutonomyOverridePath,
  type RawInputs,
} from "./agent-tab-helpers"
import { isValidBusinessHoursWindow, resolveAgentSettings, type AutonomyTier } from "@shopkeeper/agent/settings"
import type { OrgSettings, OrgSettingsPatch } from "@/types"

interface UseAgentTabStateProps {
  settings: OrgSettings
  rawSettings: OrgSettingsPatch
  version: string
  orgName: string
  // Only the page that shows the timezone fills a missing one from the browser;
  // anywhere else the fill would open the page with unsaved changes.
  prefillTimezone: boolean
}

export function useAgentTabState({
  settings,
  rawSettings,
  version,
  orgName,
  prefillTimezone,
}: UseAgentTabStateProps) {
  const { mutate } = useSWRConfig()
  const [settingsState, dispatch] = useReducer(agentSettingsReducer, settings, hydrateSettingsFromStorage)
  const browserTimezoneRef = useRef<string | null>(null)

  useEffect(() => {
    const browserTimezone = resolveBrowserTimezone()
    browserTimezoneRef.current = browserTimezone
    if (prefillTimezone && !settingsState.businessHoursTimezone?.trim()) {
      dispatch({ type: "set", patch: storeTimezonePatch(browserTimezone) })
    }
  }, [prefillTimezone, settingsState.businessHoursTimezone])
  const [businessName, setBusinessName] = useState(orgName)
  const initialNameRef = useRef(orgName)
  const [rawInputs, setRawInputs] = useState(() => rawInputsFor(settings))
  function setRawInput(key: keyof RawInputs, value: SetStateAction<string>) {
    setRawInputs(current => ({
      ...current,
      [key]: typeof value === "function" ? value(current[key]) : value,
    }))
  }
  const currentVersionRef = useRef(version)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [staleVersion, setStaleVersion] = useState(false)
  const [explicitOverridePaths, setExplicitOverridePaths] = useState<AutonomyOverridePath[]>(
    () => collectExplicitOverridePaths(rawSettings),
  )

  const payload = useMemo(
    () => buildSettingsPayload(settingsState, rawInputs),
    [settingsState, rawInputs],
  )

  const settingsPatch = useMemo(
    () => buildAgentSettingsPatch(payload, explicitOverridePaths),
    [payload, explicitOverridePaths],
  )
  const serializedPatch = useMemo(() => JSON.stringify(settingsPatch), [settingsPatch])
  const initialPatchRef = useRef<string>(serializedPatch)
  const baselineRawRef = useRef<OrgSettingsPatch>(rawSettings)
  const freshBaselineRef = useRef<OrgSettingsPatch | null>(null)
  const explicitOverrideSet = useMemo(() => new Set(explicitOverridePaths), [explicitOverridePaths])
  const trimmedBusinessName = businessName.trim()
  const nameDirty = trimmedBusinessName !== initialNameRef.current
  const isDirty = serializedPatch !== initialPatchRef.current || nameDirty
  const businessNameInvalid = nameDirty && trimmedBusinessName.length === 0
  const autonomyTier = settingsState.autonomyTier ?? "guarded"
  const businessHoursInvalid = payload.businessHoursEnabled
    && !isValidBusinessHoursWindow(payload.businessHoursStart, payload.businessHoursEnd)

  function markExplicit(path: AutonomyOverridePath) {
    setExplicitOverridePaths(prev => prev.includes(path) ? prev : [...prev, path])
  }

  function clearExplicit(path: AutonomyOverridePath) {
    setExplicitOverridePaths(prev => prev.filter(item => item !== path))
  }

  function applyBaseline(target: OrgSettingsPatch) {
    const hydrated = hydrateSettings(resolveAgentSettings(target))
    const explicit = collectExplicitOverridePaths(target)
    const raw = rawInputsFor(hydrated)
    dispatch({ type: "reset", payload: hydrated })
    setExplicitOverridePaths(explicit)
    setRawInputs(raw)
    setBusinessName(initialNameRef.current)
    baselineRawRef.current = target
    initialPatchRef.current = JSON.stringify(buildAgentSettingsPatch(buildSettingsPayload(hydrated, raw), explicit))
  }

  function reset() {
    applyBaseline(freshBaselineRef.current ?? baselineRawRef.current)
    freshBaselineRef.current = null
    setError(null)
    setStaleVersion(false)
  }

  function selectTier(tier: AutonomyTier) {
    const next = applyTierDefaultsToInheritedSettings(settingsState, tier, explicitOverridePaths)
    dispatch({ type: "reset", payload: next })
    if (!explicitOverrideSet.has("maxRefundAmount")) {
      setRawInput("maxRefund", rawInputsFor(next).maxRefund)
    }
  }

  function setAutonomyOverride(path: AutonomyOverridePath, value: unknown) {
    markExplicit(path)
    dispatch({ type: "reset", payload: writeSettingsPath(settingsState, path, value) as OrgSettings })
  }

  function resetAutonomyOverride(path: AutonomyOverridePath) {
    clearExplicit(path)
    const next = resetPathToTierDefault(settingsState, path)
    dispatch({ type: "reset", payload: next })
    if (path === "maxRefundAmount") {
      setRawInput("maxRefund", rawInputsFor(next).maxRefund)
    }
  }

  async function save() {
    setError(null)
    setStaleVersion(false)
    setSaving(true)
    setSaved(false)
    try {
      const body: {
        name?: string
        settings: OrgSettingsPatch
        settingsUnset: string[]
        version: string
      } = {
        settings: settingsPatch.settings,
        settingsUnset: settingsPatch.settingsUnset,
        version: currentVersionRef.current,
      }
      if (nameDirty) body.name = trimmedBusinessName

      const res = await fetch("/api/org", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (res.status === 409) {
        const conflict = await res.json().catch(() => ({})) as {
          current?: { version?: string; settings?: OrgSettingsPatch; name?: string }
        }
        if (conflict.current?.version) currentVersionRef.current = conflict.current.version
        if (conflict.current?.settings) {
          freshBaselineRef.current = conflict.current.settings
        }
        if (conflict.current?.name) setBusinessName(conflict.current.name)
        setStaleVersion(true)
        return
      }
      if (!res.ok) throw new Error("Failed")
      const saved = await res.json().catch(() => ({})) as {
        version?: string
        settings?: OrgSettingsPatch
        name?: string
      }
      if (saved.version) currentVersionRef.current = saved.version
      if (saved.settings) baselineRawRef.current = saved.settings
      if (saved.name) {
        initialNameRef.current = saved.name
        setBusinessName(saved.name)
      }
      void mutate(
        "/api/org",
        (current: { settings?: OrgSettingsPatch; version?: string; name?: string } | undefined) => ({
          ...(current ?? {}),
          ...(saved.version ? { version: saved.version } : {}),
          ...(saved.settings ? { settings: saved.settings } : {}),
          ...(saved.name ? { name: saved.name } : {}),
        }),
        { revalidate: false },
      )
      initialPatchRef.current = serializedPatch
      freshBaselineRef.current = null
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch {
      setError("Failed to save. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  return {
    settingsState,
    dispatch,
    payload,
    explicitOverrideSet,
    autonomyTier,
    businessName,
    setBusinessName,
    businessNameInvalid,
    rawInputs,
    setRawInput,
    saving,
    saved,
    error,
    staleVersion,
    isDirty,
    businessHoursInvalid,
    markExplicit,
    reset,
    save,
    selectTier,
    setAutonomyOverride,
    resetAutonomyOverride,
  }
}

export type AgentTabController = ReturnType<typeof useAgentTabState>
