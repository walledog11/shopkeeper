import type {
  AgentToolPermissions,
  BusinessHoursDay,
  OrgSettings,
  OrgSettingsPatch,
  SampleReply,
} from "./types.js";

export type { OrgSettingsPatch } from "./types.js";

export type AutonomyTier = NonNullable<OrgSettings["autonomyTier"]>;
export type AutoExecuteMode = NonNullable<OrgSettings["autoExecuteMode"]>;
export type BusinessHoursSettings = Pick<
  OrgSettings,
  | "businessHoursEnabled"
  | "businessHoursDays"
  | "businessHoursStart"
  | "businessHoursEnd"
  | "businessHoursTimezone"
  | "businessHoursTimezoneOffset"
>;

export interface OrgSettingsValidationIssue {
  path: string;
  message: string;
}

export class OrgSettingsValidationError extends Error {
  constructor(public readonly issues: OrgSettingsValidationIssue[]) {
    super("Invalid organization settings");
    this.name = "OrgSettingsValidationError";
  }
}

export const AGENT_SETTINGS_DEFAULTS: OrgSettings = {
  aiContext: "",
  brandVoice: "",
  sampleReplies: [],
  agentName: "Shopkeeper",
  autoPlanOnOpen: true,
  autoExecuteEnabled: false,
  defaultInstruction: "",
  requireApprovalForActions: true,
  toolsEnabled: {
    action: true,
    communication: true,
    internal: true,
    read: true,
  },
  maxRefundAmount: null,
  dailyRefundCap: null,
  dailyLLMSpendCapUsd: null,
  blockCancellations: false,
  blockCustomLineItems: false,
  maxIterations: 10,
  replyLanguage: "auto",
  digestEnabled: false,
  digestFrequency: "daily",
  digestHour: 8,
  digestSecondHour: 17,
  digestDays: "every_day",
  digestTimezoneOffset: 0,
  businessHoursEnabled: false,
  businessHoursStart: 9,
  businessHoursEnd: 17,
  businessHoursDays: ["mon", "tue", "wed", "thu", "fri"],
  businessHoursTimezoneOffset: 0,
  autoAckMessage: "Thanks for reaching out! We're currently outside business hours and will get back to you soon.",
  spamFilterEnabled: true,
  autonomyTier: "trusted",
};

export const TIER_DEFAULTS: Record<AutonomyTier, Partial<OrgSettings>> = {
  watch: {
    maxRefundAmount: 0,
    requireApprovalForActions: true,
    toolsEnabled: {
      action: false,
      communication: false,
      internal: true,
      read: true,
    },
  },
  guarded: {
    maxRefundAmount: 50,
    requireApprovalForActions: true,
  },
  trusted: {
    maxRefundAmount: 100,
    requireApprovalForActions: false,
  },
  broad: {
    maxRefundAmount: 250,
    requireApprovalForActions: false,
  },
  full: {
    maxRefundAmount: 1000,
    requireApprovalForActions: false,
  },
};

// Tiers whose plans the classifier may surface as auto_execute, subject to
// per-call caps and other static policy checks.
export const TIERS_THAT_AUTO_EXECUTE: ReadonlySet<AutonomyTier> = new Set<AutonomyTier>([
  "trusted",
  "broad",
  "full",
]);

const SETTINGS_KEYS = [
  "aiContext",
  "brandVoice",
  "sampleReplies",
  "agentName",
  "autoPlanOnOpen",
  "autoExecuteEnabled",
  "autoExecuteMode",
  "defaultInstruction",
  "requireApprovalForActions",
  "toolsEnabled",
  "maxRefundAmount",
  "dailyRefundCap",
  "dailyLLMSpendCapUsd",
  "blockCancellations",
  "blockCustomLineItems",
  "maxIterations",
  "replyLanguage",
  "digestEnabled",
  "digestFrequency",
  "digestHour",
  "digestSecondHour",
  "digestDays",
  "digestTimezone",
  "digestTimezoneOffset",
  "businessHoursEnabled",
  "businessHoursStart",
  "businessHoursEnd",
  "businessHoursDays",
  "businessHoursTimezone",
  "businessHoursTimezoneOffset",
  "autoAckMessage",
  "spamFilterEnabled",
  "autonomyTier",
] as const satisfies readonly (keyof OrgSettings)[];

const BOOLEAN_FIELDS = [
  "autoPlanOnOpen",
  "autoExecuteEnabled",
  "requireApprovalForActions",
  "blockCancellations",
  "blockCustomLineItems",
  "digestEnabled",
  "businessHoursEnabled",
  "spamFilterEnabled",
] as const satisfies readonly (keyof OrgSettings)[];

const STRING_FIELDS = [
  ["aiContext", 2000],
  ["brandVoice", 200],
  ["agentName", 100],
  ["defaultInstruction", 2000],
  ["replyLanguage", 100],
  ["autoAckMessage", 500],
] as const satisfies readonly [keyof OrgSettings, number][];

const NULLABLE_NON_NEGATIVE_FIELDS = [
  "maxRefundAmount",
  "dailyRefundCap",
  "dailyLLMSpendCapUsd",
] as const satisfies readonly (keyof OrgSettings)[];

const HOUR_FIELDS = [
  "digestHour",
  "digestSecondHour",
  "businessHoursStart",
  "businessHoursEnd",
] as const satisfies readonly (keyof OrgSettings)[];

const TIMEZONE_FIELDS = [
  "digestTimezone",
  "businessHoursTimezone",
] as const satisfies readonly (keyof OrgSettings)[];

const OFFSET_FIELDS = [
  "digestTimezoneOffset",
  "businessHoursTimezoneOffset",
] as const satisfies readonly (keyof OrgSettings)[];

const TOOL_PERMISSION_KEYS = [
  "action",
  "communication",
  "internal",
  "read",
] as const satisfies readonly (keyof AgentToolPermissions)[];

const BUSINESS_HOURS_DAYS = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const satisfies readonly BusinessHoursDay[];

const SAMPLE_REPLY_KEYS = ["id", "body", "context", "tag"] as const satisfies readonly (keyof SampleReply)[];
const AUTO_EXECUTE_MODES = ["off", "shadow", "live"] as const satisfies readonly AutoExecuteMode[];
const AUTONOMY_TIERS = ["watch", "guarded", "trusted", "broad", "full"] as const satisfies readonly AutonomyTier[];
const DIGEST_FREQUENCIES = [
  "daily",
  "twice_daily",
  "every_4h",
  "every_6h",
  "every_8h",
  "every_12h",
] as const satisfies readonly OrgSettings["digestFrequency"][];
const DIGEST_DAYS = ["every_day", "weekdays"] as const satisfies readonly OrgSettings["digestDays"][];

type ParseMode = "strict" | "stored";

interface ParseContext {
  mode: ParseMode;
  issues: OrgSettingsValidationIssue[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function addIssue(context: ParseContext, path: string, message: string): void {
  if (context.mode === "strict") {
    context.issues.push({ path, message });
  }
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  path: string,
  context: ParseContext,
): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      addIssue(context, path ? `${path}.${key}` : key, "Unknown setting");
    }
  }
}

function readBoolean(
  value: Record<string, unknown>,
  key: string,
  output: Record<string, unknown>,
  context: ParseContext,
): void {
  if (!hasOwn(value, key)) return;
  if (typeof value[key] === "boolean") {
    output[key] = value[key];
    return;
  }
  addIssue(context, key, "Expected a boolean");
}

function readString(
  value: Record<string, unknown>,
  key: string,
  maxLength: number,
  output: Record<string, unknown>,
  context: ParseContext,
): void {
  if (!hasOwn(value, key)) return;
  const candidate = value[key];
  if (typeof candidate !== "string") {
    addIssue(context, key, "Expected a string");
    return;
  }
  if (candidate.length > maxLength) {
    addIssue(context, key, `Must be at most ${maxLength} characters`);
    return;
  }
  output[key] = candidate;
}

function readEnum(
  value: Record<string, unknown>,
  key: string,
  allowed: readonly string[],
  output: Record<string, unknown>,
  context: ParseContext,
): void {
  if (!hasOwn(value, key)) return;
  const candidate = value[key];
  if (typeof candidate === "string" && allowed.includes(candidate)) {
    output[key] = candidate;
    return;
  }
  addIssue(context, key, `Expected one of: ${allowed.join(", ")}`);
}

function readNullableNonNegativeNumber(
  value: Record<string, unknown>,
  key: string,
  output: Record<string, unknown>,
  context: ParseContext,
): void {
  if (!hasOwn(value, key)) return;
  const candidate = value[key];
  if (
    candidate === null
    || (typeof candidate === "number" && Number.isFinite(candidate) && candidate >= 0)
  ) {
    output[key] = candidate;
    return;
  }
  addIssue(context, key, "Expected null or a non-negative finite number");
}

function readInteger(
  value: Record<string, unknown>,
  key: string,
  min: number,
  max: number,
  output: Record<string, unknown>,
  context: ParseContext,
): void {
  if (!hasOwn(value, key)) return;
  const candidate = value[key];
  if (
    typeof candidate === "number"
    && Number.isInteger(candidate)
    && candidate >= min
    && candidate <= max
  ) {
    output[key] = candidate;
    return;
  }
  addIssue(context, key, `Expected an integer from ${min} to ${max}`);
}

function isValidTimeZone(value: string): boolean {
  if (value.trim() === "") return true;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function readTimezone(
  value: Record<string, unknown>,
  key: string,
  output: Record<string, unknown>,
  context: ParseContext,
): void {
  if (!hasOwn(value, key)) return;
  const candidate = value[key];
  if (typeof candidate !== "string") {
    addIssue(context, key, "Expected an IANA timezone string");
    return;
  }
  if (candidate.length > 100 || !isValidTimeZone(candidate)) {
    addIssue(context, key, "Expected a valid IANA timezone");
    return;
  }
  output[key] = candidate;
}

function readToolsEnabled(
  value: Record<string, unknown>,
  output: Record<string, unknown>,
  context: ParseContext,
): void {
  if (!hasOwn(value, "toolsEnabled")) return;
  const candidate = value.toolsEnabled;
  if (!isPlainObject(candidate)) {
    addIssue(context, "toolsEnabled", "Expected an object");
    return;
  }

  rejectUnknownKeys(candidate, TOOL_PERMISSION_KEYS, "toolsEnabled", context);
  const tools: Record<string, boolean> = {};
  for (const key of TOOL_PERMISSION_KEYS) {
    if (!hasOwn(candidate, key)) continue;
    if (typeof candidate[key] === "boolean") {
      tools[key] = candidate[key];
    } else {
      addIssue(context, `toolsEnabled.${key}`, "Expected a boolean");
    }
  }
  output.toolsEnabled = tools;
}

function readBusinessHoursDays(
  value: Record<string, unknown>,
  output: Record<string, unknown>,
  context: ParseContext,
): void {
  if (!hasOwn(value, "businessHoursDays")) return;
  const candidate = value.businessHoursDays;
  if (!Array.isArray(candidate)) {
    addIssue(context, "businessHoursDays", "Expected an array of weekday identifiers");
    return;
  }
  if (
    candidate.some(day => typeof day !== "string" || !BUSINESS_HOURS_DAYS.includes(day as BusinessHoursDay))
  ) {
    addIssue(context, "businessHoursDays", `Expected only: ${BUSINESS_HOURS_DAYS.join(", ")}`);
    return;
  }
  output.businessHoursDays = [...new Set(candidate)] as BusinessHoursDay[];
}

function readSampleString(
  value: Record<string, unknown>,
  key: keyof SampleReply,
  maxLength: number,
  path: string,
  context: ParseContext,
  required: boolean,
): string | undefined {
  const candidate = value[key];
  if (candidate === undefined && !required) return undefined;
  if (typeof candidate !== "string") {
    addIssue(context, `${path}.${key}`, "Expected a string");
    return undefined;
  }
  if (candidate.length > maxLength) {
    addIssue(context, `${path}.${key}`, `Must be at most ${maxLength} characters`);
    return undefined;
  }
  return candidate;
}

function readSampleReplies(
  value: Record<string, unknown>,
  output: Record<string, unknown>,
  context: ParseContext,
): void {
  if (!hasOwn(value, "sampleReplies")) return;
  const candidate = value.sampleReplies;
  if (!Array.isArray(candidate)) {
    addIssue(context, "sampleReplies", "Expected an array");
    return;
  }
  if (candidate.length > 10) {
    addIssue(context, "sampleReplies", "Must contain at most 10 replies");
  }

  const replies: SampleReply[] = [];
  for (const [index, rawReply] of candidate.slice(0, 10).entries()) {
    const path = `sampleReplies.${index}`;
    if (!isPlainObject(rawReply)) {
      addIssue(context, path, "Expected an object");
      continue;
    }
    rejectUnknownKeys(rawReply, SAMPLE_REPLY_KEYS, path, context);
    const issueCount = context.issues.length;
    const id = readSampleString(rawReply, "id", 100, path, context, true);
    const body = readSampleString(rawReply, "body", 300, path, context, true);
    const sampleContext = readSampleString(rawReply, "context", 80, path, context, false);
    const tag = readSampleString(rawReply, "tag", 40, path, context, false);
    if (!id || body === undefined || context.issues.length > issueCount) continue;
    replies.push({
      id,
      body,
      ...(sampleContext !== undefined ? { context: sampleContext } : {}),
      ...(tag !== undefined ? { tag } : {}),
    });
  }
  output.sampleReplies = replies;
}

function parseSettingsObject(value: unknown, mode: ParseMode): OrgSettingsPatch {
  const context: ParseContext = { mode, issues: [] };
  if (!isPlainObject(value)) {
    addIssue(context, "settings", "Expected an object");
    if (context.issues.length > 0) throw new OrgSettingsValidationError(context.issues);
    return {};
  }

  rejectUnknownKeys(value, SETTINGS_KEYS, "", context);
  const output: Record<string, unknown> = {};

  for (const key of BOOLEAN_FIELDS) readBoolean(value, key, output, context);
  for (const [key, maxLength] of STRING_FIELDS) readString(value, key, maxLength, output, context);
  for (const key of NULLABLE_NON_NEGATIVE_FIELDS) {
    readNullableNonNegativeNumber(value, key, output, context);
  }
  for (const key of HOUR_FIELDS) readInteger(value, key, 0, 23, output, context);
  for (const key of OFFSET_FIELDS) readInteger(value, key, -12, 14, output, context);
  for (const key of TIMEZONE_FIELDS) readTimezone(value, key, output, context);

  readInteger(value, "maxIterations", 1, 100, output, context);
  readEnum(value, "autoExecuteMode", AUTO_EXECUTE_MODES, output, context);
  readEnum(value, "autonomyTier", AUTONOMY_TIERS, output, context);
  readEnum(value, "digestFrequency", DIGEST_FREQUENCIES, output, context);
  readEnum(value, "digestDays", DIGEST_DAYS, output, context);
  readToolsEnabled(value, output, context);
  readBusinessHoursDays(value, output, context);
  readSampleReplies(value, output, context);

  if (output.autoExecuteMode === undefined && typeof output.autoExecuteEnabled === "boolean") {
    output.autoExecuteMode = output.autoExecuteEnabled ? "live" : "off";
  }

  if (context.issues.length > 0) {
    throw new OrgSettingsValidationError(context.issues);
  }
  return output as OrgSettingsPatch;
}

export function parseOrgSettingsPatch(value: unknown): OrgSettingsPatch {
  return parseSettingsObject(value, "strict");
}

export function normalizeStoredOrgSettings(value: unknown): OrgSettingsPatch {
  const normalized = parseSettingsObject(value, "stored");
  const start = normalized.businessHoursStart ?? AGENT_SETTINGS_DEFAULTS.businessHoursStart;
  const end = normalized.businessHoursEnd ?? AGENT_SETTINGS_DEFAULTS.businessHoursEnd;
  if (normalized.businessHoursEnabled === true && !isValidBusinessHoursWindow(start, end)) {
    delete normalized.businessHoursStart;
    delete normalized.businessHoursEnd;
  }
  return normalized;
}

// Effective auto-execute mode, migrating the legacy boolean `autoExecuteEnabled`
// (true -> live, false/unset -> off) for orgs that predate `autoExecuteMode`.
export function resolveAutoExecuteMode(settings: unknown): AutoExecuteMode {
  const normalized = normalizeStoredOrgSettings(settings);
  return normalized.autoExecuteMode ?? "off";
}

export function resolveAgentSettings(settings: unknown): OrgSettings {
  const base = normalizeStoredOrgSettings(settings);
  const requested = base.autonomyTier;
  const tier: AutonomyTier = requested && requested in TIER_DEFAULTS ? requested : "guarded";
  const tierDefaults = TIER_DEFAULTS[tier];
  return {
    ...AGENT_SETTINGS_DEFAULTS,
    ...tierDefaults,
    ...base,
    autonomyTier: tier,
    toolsEnabled: {
      ...AGENT_SETTINGS_DEFAULTS.toolsEnabled,
      ...(tierDefaults.toolsEnabled ?? {}),
      ...(base.toolsEnabled ?? {}),
    },
  };
}

export function isValidBusinessHoursWindow(start: number, end: number): boolean {
  return start !== end;
}

function offsetToIanaFallback(offset: number): string {
  const rounded = Math.max(-12, Math.min(14, Math.round(offset)));
  if (rounded === 0) return "UTC";
  return `Etc/GMT${rounded > 0 ? "-" : "+"}${Math.abs(rounded)}`;
}

function localHourAndDay(timeZone: string, now: Date): { hour: number; day: BusinessHoursDay } {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      weekday: "short",
      hour12: false,
    }).formatToParts(now);
    const rawHour = Number.parseInt(parts.find(part => part.type === "hour")?.value ?? "0", 10);
    const day = parts.find(part => part.type === "weekday")?.value.toLowerCase().slice(0, 3);
    return {
      hour: ((rawHour % 24) + 24) % 24,
      day: BUSINESS_HOURS_DAYS.includes(day as BusinessHoursDay) ? day as BusinessHoursDay : "sun",
    };
  } catch {
    return {
      hour: now.getUTCHours(),
      day: BUSINESS_HOURS_DAYS[now.getUTCDay() === 0 ? 6 : now.getUTCDay() - 1],
    };
  }
}

export function isWithinBusinessHours(settings: BusinessHoursSettings, now = new Date()): boolean {
  if (!settings.businessHoursEnabled) return true;
  if (!isValidBusinessHoursWindow(settings.businessHoursStart, settings.businessHoursEnd)) return false;

  const timezone = settings.businessHoursTimezone?.trim()
    ? settings.businessHoursTimezone
    : offsetToIanaFallback(settings.businessHoursTimezoneOffset);
  const { hour, day } = localHourAndDay(timezone, now);
  const dayIndex = BUSINESS_HOURS_DAYS.indexOf(day);
  const previousDay = BUSINESS_HOURS_DAYS[(dayIndex + BUSINESS_HOURS_DAYS.length - 1) % BUSINESS_HOURS_DAYS.length];

  if (settings.businessHoursStart < settings.businessHoursEnd) {
    return settings.businessHoursDays.includes(day)
      && hour >= settings.businessHoursStart
      && hour < settings.businessHoursEnd;
  }

  return (
    settings.businessHoursDays.includes(day) && hour >= settings.businessHoursStart
  ) || (
    settings.businessHoursDays.includes(previousDay) && hour < settings.businessHoursEnd
  );
}
