import {
  AGENT_SETTINGS_DEFAULTS,
  AUTONOMY_OVERRIDE_PATHS,
  resolveAgentSettings,
  type AutonomyOverridePath,
  type AutonomyTier,
} from "@shopkeeper/agent/settings"
import type { OrgSettings, OrgSettingsPatch } from "@/types"

export type { AutonomyOverridePath } from "@shopkeeper/agent/settings"

export type AgentSettingsAction =
  | { type: "set"; patch: Partial<OrgSettings> }
  | { type: "reset"; payload: OrgSettings }

export interface RawInputs {
  maxRefund: string
  maxDiscount: string
  dailyRefundCap: string
  dailyLLMSpendCap: string
  maxIter: string
  digestHour: string
  digestSecondHour: string
  lowStockThreshold: string
  bhStart: string
  bhEnd: string
}

export interface AgentSettingsPatch {
  settings: OrgSettingsPatch
  settingsUnset: AutonomyOverridePath[]
}

type SettingsLike = Partial<OrgSettings> | OrgSettingsPatch

export function agentSettingsReducer(state: OrgSettings, action: AgentSettingsAction): OrgSettings {
  if (action.type === "reset") return action.payload
  return { ...state, ...action.patch }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function hasSettingsPath(settings: SettingsLike, path: AutonomyOverridePath): boolean {
  const [first, second] = path.split(".")
  const root = settings as Record<string, unknown>
  if (!second) return Object.prototype.hasOwnProperty.call(root, first)
  const nested = root[first]
  return isRecord(nested) && Object.prototype.hasOwnProperty.call(nested, second)
}

export function readSettingsPath(settings: SettingsLike, path: AutonomyOverridePath): unknown {
  const [first, second] = path.split(".")
  const root = settings as Record<string, unknown>
  if (!second) return root[first]
  const nested = root[first]
  return isRecord(nested) ? nested[second] : undefined
}

export function writeSettingsPath<T extends Partial<OrgSettings>>(
  settings: T,
  path: AutonomyOverridePath,
  value: unknown,
): T {
  const [first, second] = path.split(".")
  const next = { ...settings } as Record<string, unknown>
  if (!second) {
    next[first] = value
    return next as T
  }

  const current = next[first]
  next[first] = {
    ...(isRecord(current) ? current : {}),
    [second]: value,
  }
  return next as T
}

function deleteSettingsPath(settings: Record<string, unknown>, path: AutonomyOverridePath) {
  const [first, second] = path.split(".")
  if (!second) {
    delete settings[first]
    return
  }

  const nested = settings[first]
  if (!isRecord(nested)) return
  delete nested[second]
  if (Object.keys(nested).length === 0) delete settings[first]
}

export function collectExplicitOverridePaths(rawSettings: OrgSettingsPatch): AutonomyOverridePath[] {
  return AUTONOMY_OVERRIDE_PATHS.filter(path => hasSettingsPath(rawSettings, path))
}

function tierResolvedSettings(tier: AutonomyTier): OrgSettings {
  return resolveAgentSettings({ autonomyTier: tier })
}

export function tierDefaultForPath(tier: AutonomyTier, path: AutonomyOverridePath): unknown {
  return readSettingsPath(tierResolvedSettings(tier), path)
}

export function resetPathToTierDefault(settings: OrgSettings, path: AutonomyOverridePath): OrgSettings {
  const tier = settings.autonomyTier ?? "guarded"
  return writeSettingsPath(settings, path, tierDefaultForPath(tier, path)) as OrgSettings
}

export function applyTierDefaultsToInheritedSettings(
  settings: OrgSettings,
  tier: AutonomyTier,
  explicitOverridePaths: Iterable<AutonomyOverridePath>,
): OrgSettings {
  const explicit = new Set(explicitOverridePaths)
  let next: OrgSettings = {
    ...settings,
    autonomyTier: tier,
    toolsEnabled: { ...settings.toolsEnabled },
  }

  for (const path of AUTONOMY_OVERRIDE_PATHS) {
    if (explicit.has(path)) continue
    next = writeSettingsPath(next, path, tierDefaultForPath(tier, path)) as OrgSettings
  }

  return next
}

export function buildAgentSettingsPatch(
  settings: OrgSettings,
  explicitOverridePaths: Iterable<AutonomyOverridePath>,
): AgentSettingsPatch {
  const explicit = new Set(explicitOverridePaths)
  const serialized = JSON.parse(JSON.stringify(settings)) as Record<string, unknown>
  const settingsUnset: AutonomyOverridePath[] = []

  for (const path of AUTONOMY_OVERRIDE_PATHS) {
    if (explicit.has(path)) continue
    deleteSettingsPath(serialized, path)
    settingsUnset.push(path)
  }

  return {
    settings: serialized as OrgSettingsPatch,
    settingsUnset,
  }
}

// Map legacy integer UTC offsets to curated IANA zones so users never see
// "Etc/GMT+5" in the dropdown. Picks the most populous merchant region per
// offset; users can always change to their actual zone after.
const OFFSET_TO_CURATED_ZONE: Record<number, string> = {
  [-10]: "Pacific/Honolulu",
  [-9]: "America/Anchorage",
  [-8]: "America/Los_Angeles",
  [-7]: "America/Denver",
  [-6]: "America/Chicago",
  [-5]: "America/New_York",
  [-4]: "America/Halifax",
  [-3]: "America/Sao_Paulo",
  [0]: "Europe/London",
  [1]: "Europe/Paris",
  [2]: "Europe/Athens",
  [3]: "Europe/Moscow",
  [4]: "Asia/Dubai",
  [5]: "Asia/Karachi",
  [6]: "Asia/Dhaka",
  [7]: "Asia/Bangkok",
  [8]: "Asia/Singapore",
  [9]: "Asia/Tokyo",
  [10]: "Australia/Sydney",
  [12]: "Pacific/Auckland",
  [13]: "Pacific/Fiji",
}

function browserTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York"
  } catch {
    return "America/New_York"
  }
}

function hydrateTz(existing: string | undefined, legacyOffset: number | undefined): string {
  if (existing && existing.trim() !== "" && !existing.startsWith("Etc/")) return existing
  if (typeof legacyOffset === "number") {
    const mapped = OFFSET_TO_CURATED_ZONE[Math.round(legacyOffset)]
    if (mapped) return mapped
  }
  return browserTz()
}

export function hydrateSettings(settings: OrgSettings): OrgSettings {
  return {
    ...settings,
    digestTimezone: hydrateTz(settings.digestTimezone, settings.digestTimezoneOffset),
    businessHoursTimezone: hydrateTz(settings.businessHoursTimezone, settings.businessHoursTimezoneOffset),
  }
}

// Curated list of ~30 zones grouped by region. One entry per DST region -
// for example "Europe/Paris" covers Berlin / Madrid / Rome / Amsterdam.
export const TIMEZONE_GROUPS: { label: string; zones: { id: string; label: string }[] }[] = [
  {
    label: "Americas",
    zones: [
      { id: "Pacific/Honolulu", label: "Hawaii — Honolulu" },
      { id: "America/Anchorage", label: "Alaska — Anchorage" },
      { id: "America/Los_Angeles", label: "Pacific Time — Los Angeles, Vancouver" },
      { id: "America/Phoenix", label: "Arizona — Phoenix" },
      { id: "America/Denver", label: "Mountain Time — Denver, Edmonton" },
      { id: "America/Chicago", label: "Central Time — Chicago, Mexico City" },
      { id: "America/New_York", label: "Eastern Time — New York, Toronto" },
      { id: "America/Halifax", label: "Atlantic Time — Halifax" },
      { id: "America/Sao_Paulo", label: "São Paulo" },
      { id: "America/Argentina/Buenos_Aires", label: "Buenos Aires" },
    ],
  },
  {
    label: "Europe",
    zones: [
      { id: "Europe/London", label: "London, Dublin, Lisbon" },
      { id: "Europe/Paris", label: "Central European Time — Paris, Berlin, Madrid, Rome" },
      { id: "Europe/Athens", label: "Eastern European Time — Athens, Helsinki, Bucharest" },
      { id: "Europe/Istanbul", label: "Istanbul" },
      { id: "Europe/Moscow", label: "Moscow" },
    ],
  },
  {
    label: "Africa & Middle East",
    zones: [
      { id: "Africa/Lagos", label: "Lagos" },
      { id: "Africa/Cairo", label: "Cairo" },
      { id: "Africa/Johannesburg", label: "Johannesburg" },
      { id: "Asia/Jerusalem", label: "Jerusalem" },
      { id: "Asia/Dubai", label: "Dubai" },
      { id: "Asia/Tehran", label: "Tehran" },
    ],
  },
  {
    label: "Asia",
    zones: [
      { id: "Asia/Karachi", label: "Karachi" },
      { id: "Asia/Kolkata", label: "India — Mumbai, Delhi" },
      { id: "Asia/Dhaka", label: "Dhaka" },
      { id: "Asia/Bangkok", label: "Bangkok, Jakarta" },
      { id: "Asia/Singapore", label: "Singapore, Hong Kong, Manila" },
      { id: "Asia/Shanghai", label: "Shanghai, Beijing" },
      { id: "Asia/Tokyo", label: "Tokyo, Seoul" },
    ],
  },
  {
    label: "Oceania",
    zones: [
      { id: "Australia/Perth", label: "Perth" },
      { id: "Australia/Adelaide", label: "Adelaide" },
      { id: "Australia/Sydney", label: "Sydney, Melbourne, Brisbane" },
      { id: "Pacific/Auckland", label: "Auckland" },
      { id: "Pacific/Fiji", label: "Fiji" },
    ],
  },
]

export const KNOWN_TIMEZONE_IDS = new Set(TIMEZONE_GROUPS.flatMap(group => group.zones.map(zone => zone.id)))

export const DAY_OPTIONS = [
  ["mon", "Mon"],
  ["tue", "Tue"],
  ["wed", "Wed"],
  ["thu", "Thu"],
  ["fri", "Fri"],
  ["sat", "Sat"],
  ["sun", "Sun"],
] as const

function clampHour(value: string, fallback: number): number {
  const parsed = value.trim() === "" ? fallback : parseInt(value, 10)
  return Math.min(23, Math.max(0, isNaN(parsed) ? fallback : parsed))
}

function parseLowStockThreshold(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === "") return null
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return Math.floor(parsed)
}

export function buildSettingsPayload(state: OrgSettings, raw: RawInputs): OrgSettings {
  const parsedMax = raw.maxRefund.trim() === "" ? null : Number(raw.maxRefund)
  const parsedDiscount = raw.maxDiscount.trim() === "" ? null : Number(raw.maxDiscount)
  const parsedDaily = raw.dailyRefundCap.trim() === "" ? null : Number(raw.dailyRefundCap)
  const parsedLLM = raw.dailyLLMSpendCap.trim() === "" ? null : Number(raw.dailyLLMSpendCap)
  const parsedIter = Number(raw.maxIter)

  return {
    ...state,
    agentName: state.agentName.trim() || AGENT_SETTINGS_DEFAULTS.agentName,
    maxRefundAmount: parsedMax === null || isNaN(parsedMax) ? null : parsedMax,
    maxDiscountPercent: parsedDiscount === null || isNaN(parsedDiscount) ? null : parsedDiscount,
    dailyRefundCap: parsedDaily === null || isNaN(parsedDaily) ? null : parsedDaily,
    dailyLLMSpendCapUsd: parsedLLM === null || isNaN(parsedLLM) ? null : parsedLLM,
    maxIterations: isNaN(parsedIter) || parsedIter < 1
      ? AGENT_SETTINGS_DEFAULTS.maxIterations
      : parsedIter,
    digestHour: clampHour(raw.digestHour, AGENT_SETTINGS_DEFAULTS.digestHour),
    digestSecondHour: clampHour(raw.digestSecondHour, AGENT_SETTINGS_DEFAULTS.digestSecondHour),
    lowStockThreshold: parseLowStockThreshold(raw.lowStockThreshold),
    businessHoursStart: clampHour(raw.bhStart, AGENT_SETTINGS_DEFAULTS.businessHoursStart),
    businessHoursEnd: clampHour(raw.bhEnd, AGENT_SETTINGS_DEFAULTS.businessHoursEnd),
  }
}

export function rawInputsFor(settings: OrgSettings): RawInputs {
  return {
    maxRefund: settings.maxRefundAmount != null ? String(settings.maxRefundAmount) : "",
    maxDiscount: settings.maxDiscountPercent != null ? String(settings.maxDiscountPercent) : "",
    dailyRefundCap: settings.dailyRefundCap != null ? String(settings.dailyRefundCap) : "",
    dailyLLMSpendCap: settings.dailyLLMSpendCapUsd != null ? String(settings.dailyLLMSpendCapUsd) : "",
    maxIter: String(settings.maxIterations ?? AGENT_SETTINGS_DEFAULTS.maxIterations),
    digestHour: String(settings.digestHour ?? AGENT_SETTINGS_DEFAULTS.digestHour),
    digestSecondHour: String(settings.digestSecondHour ?? AGENT_SETTINGS_DEFAULTS.digestSecondHour),
    lowStockThreshold: settings.lowStockThreshold != null ? String(settings.lowStockThreshold) : "",
    bhStart: String(settings.businessHoursStart),
    bhEnd: String(settings.businessHoursEnd),
  }
}
