"use client"

import { useMemo, useReducer, useRef, useState } from "react"
import { useSWRConfig } from "swr"
import {
  agentSettingsReducer,
  applyTierDefaultsToInheritedSettings,
  buildAgentSettingsPatch,
  buildSettingsPayload,
  collectExplicitOverridePaths,
  hydrateSettings,
  rawInputsFor,
  resetPathToTierDefault,
  writeSettingsPath,
  type AutonomyOverridePath,
} from "./agent-tab-helpers"
import { resolveAgentSettings, type AutonomyTier } from "@/lib/agent/settings"
import type { OrgSettings, VoiceProposal } from "@/types"

interface UseAgentTabStateProps {
  settings: OrgSettings
  rawSettings: Partial<OrgSettings>
  version: string
  voiceProposal: VoiceProposal | null
}

export function useAgentTabState({ settings, rawSettings, version, voiceProposal }: UseAgentTabStateProps) {
  const { mutate } = useSWRConfig()
  const [settingsState, dispatch] = useReducer(agentSettingsReducer, settings, hydrateSettings)
  const initialRaw = useMemo(() => rawInputsFor(settings), [settings])
  const [maxRefundInput, setMaxRefundInput] = useState<string>(initialRaw.maxRefund)
  const [dailyRefundCapInput, setDailyRefundCapInput] = useState<string>(initialRaw.dailyRefundCap)
  const [dailyLLMSpendCapInput, setDailyLLMSpendCapInput] = useState<string>(initialRaw.dailyLLMSpendCap)
  const [maxIterationsInput, setMaxIterationsInput] = useState<string>(initialRaw.maxIter)
  const [digestHourInput, setDigestHourInput] = useState<string>(initialRaw.digestHour)
  const [digestSecondHourInput, setDigestSecondHourInput] = useState<string>(initialRaw.digestSecondHour)
  const [businessHoursStartInput, setBusinessHoursStartInput] = useState<string>(initialRaw.bhStart)
  const [businessHoursEndInput, setBusinessHoursEndInput] = useState<string>(initialRaw.bhEnd)
  const currentVersionRef = useRef(version)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [staleVersion, setStaleVersion] = useState(false)
  const [proposal, setProposal] = useState<VoiceProposal | null>(voiceProposal)
  const [voiceBusy, setVoiceBusy] = useState<null | "approve" | "dismiss">(null)
  const [explicitOverridePaths, setExplicitOverridePaths] = useState<AutonomyOverridePath[]>(
    () => collectExplicitOverridePaths(rawSettings),
  )

  const payload = useMemo(
    () => buildSettingsPayload(settingsState, {
      maxRefund: maxRefundInput,
      dailyRefundCap: dailyRefundCapInput,
      dailyLLMSpendCap: dailyLLMSpendCapInput,
      maxIter: maxIterationsInput,
      digestHour: digestHourInput,
      digestSecondHour: digestSecondHourInput,
      bhStart: businessHoursStartInput,
      bhEnd: businessHoursEndInput,
    }),
    [
      settingsState,
      maxRefundInput,
      dailyRefundCapInput,
      dailyLLMSpendCapInput,
      maxIterationsInput,
      digestHourInput,
      digestSecondHourInput,
      businessHoursStartInput,
      businessHoursEndInput,
    ],
  )

  const settingsPatch = useMemo(
    () => buildAgentSettingsPatch(payload, explicitOverridePaths),
    [payload, explicitOverridePaths],
  )
  const serializedPatch = useMemo(() => JSON.stringify(settingsPatch), [settingsPatch])
  const initialPatchRef = useRef<string>(serializedPatch)
  const baselineRawRef = useRef<Partial<OrgSettings>>(rawSettings)
  const freshBaselineRef = useRef<Partial<OrgSettings> | null>(null)
  const explicitOverrideSet = useMemo(() => new Set(explicitOverridePaths), [explicitOverridePaths])
  const isDirty = serializedPatch !== initialPatchRef.current
  const autonomyTier = settingsState.autonomyTier ?? "guarded"
  const businessHoursInvalid = payload.businessHoursEnabled && payload.businessHoursEnd <= payload.businessHoursStart

  function markExplicit(path: AutonomyOverridePath) {
    setExplicitOverridePaths(prev => prev.includes(path) ? prev : [...prev, path])
  }

  function clearExplicit(path: AutonomyOverridePath) {
    setExplicitOverridePaths(prev => prev.filter(item => item !== path))
  }

  function applyBaseline(target: Partial<OrgSettings>) {
    const hydrated = hydrateSettings(resolveAgentSettings(target))
    const explicit = collectExplicitOverridePaths(target)
    const raw = rawInputsFor(hydrated)
    dispatch({ type: "reset", payload: hydrated })
    setExplicitOverridePaths(explicit)
    setMaxRefundInput(raw.maxRefund)
    setDailyRefundCapInput(raw.dailyRefundCap)
    setDailyLLMSpendCapInput(raw.dailyLLMSpendCap)
    setMaxIterationsInput(raw.maxIter)
    setDigestHourInput(raw.digestHour)
    setDigestSecondHourInput(raw.digestSecondHour)
    setBusinessHoursStartInput(raw.bhStart)
    setBusinessHoursEndInput(raw.bhEnd)
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
      setMaxRefundInput(rawInputsFor(next).maxRefund)
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
      setMaxRefundInput(rawInputsFor(next).maxRefund)
    }
  }

  async function save() {
    setError(null)
    setStaleVersion(false)
    setSaving(true)
    setSaved(false)
    try {
      const res = await fetch("/api/org", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: settingsPatch.settings,
          settingsUnset: settingsPatch.settingsUnset,
          version: currentVersionRef.current,
        }),
      })
      if (res.status === 409) {
        const body = await res.json().catch(() => ({})) as {
          current?: { version?: string; settings?: Partial<OrgSettings> }
        }
        if (body.current?.version) currentVersionRef.current = body.current.version
        if (body.current?.settings) {
          // Capture fresh server state so Reset jumps to it instead of the stale prop.
          freshBaselineRef.current = body.current.settings
        }
        setStaleVersion(true)
        return
      }
      if (!res.ok) throw new Error("Failed")
      const body = await res.json().catch(() => ({})) as { version?: string; settings?: Partial<OrgSettings> }
      if (body.version) currentVersionRef.current = body.version
      if (body.settings) baselineRawRef.current = body.settings
      void mutate(
        "/api/org",
        (current: { settings?: Partial<OrgSettings>; version?: string } | undefined) => ({
          ...(current ?? {}),
          ...(body.version ? { version: body.version } : {}),
          ...(body.settings ? { settings: body.settings } : {}),
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

  async function resolveVoiceProposal(action: "approve" | "dismiss") {
    if (!proposal || voiceBusy) return
    setVoiceBusy(action)
    try {
      const res = await fetch("/api/agent/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) throw new Error("Failed")
      if (action === "approve") {
        const body = await res.json().catch(() => ({})) as { settings?: Partial<OrgSettings>; version?: string }
        if (body.version) currentVersionRef.current = body.version
        if (body.settings) applyBaseline(body.settings)
        void mutate(
          "/api/org",
          (current: { settings?: Partial<OrgSettings>; version?: string } | undefined) => ({
            ...(current ?? {}),
            ...(body.version ? { version: body.version } : {}),
            ...(body.settings ? { settings: body.settings } : {}),
          }),
          { revalidate: false },
        )
      }
      setProposal(null)
    } catch {
      setError("Could not update the voice suggestion. Please try again.")
    } finally {
      setVoiceBusy(null)
    }
  }

  return {
    settingsState,
    dispatch,
    payload,
    explicitOverrideSet,
    autonomyTier,
    maxRefundInput,
    setMaxRefundInput,
    dailyRefundCapInput,
    setDailyRefundCapInput,
    dailyLLMSpendCapInput,
    setDailyLLMSpendCapInput,
    maxIterationsInput,
    setMaxIterationsInput,
    digestHourInput,
    setDigestHourInput,
    digestSecondHourInput,
    setDigestSecondHourInput,
    businessHoursStartInput,
    setBusinessHoursStartInput,
    businessHoursEndInput,
    setBusinessHoursEndInput,
    saving,
    saved,
    error,
    staleVersion,
    proposal,
    voiceBusy,
    isDirty,
    businessHoursInvalid,
    markExplicit,
    reset,
    save,
    selectTier,
    setAutonomyOverride,
    resetAutonomyOverride,
    resolveVoiceProposal,
  }
}

export type AgentTabController = ReturnType<typeof useAgentTabState>
