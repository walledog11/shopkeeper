import type {
  AgentToolPermissions,
  BusinessHoursDay,
  OrgSettings,
  OrgSettingsPatch,
  SampleReply,
} from "./types.js";

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

type ParseMode = "strict" | "stored";
type AutoExecuteMode = NonNullable<OrgSettings["autoExecuteMode"]>;
type AutonomyTier = NonNullable<OrgSettings["autonomyTier"]>;

interface ParseContext {
  mode: ParseMode;
  issues: OrgSettingsValidationIssue[];
}

const SETTINGS_KEYS = [
  "aiContext",
  "brandVoice",
  "sampleReplies",
  "agentName",
  "autoPlanOnOpen",
  "autoExecuteMode",
  "defaultInstruction",
  "toolsEnabled",
  "maxRefundAmount",
  "dailyRefundCap",
  "maxDiscountPercent",
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
  "onboardingCompletedAt",
  "firstBriefingPending",
  "lastSuccessfulDigestAt",
  "salesPulseEnabled",
  "lowStockThreshold",
  "deliveryExceptionWatchEnabled",
  "postResolutionFollowUpEnabled",
  "postResolutionFollowUpDays",
] as const satisfies readonly (keyof OrgSettings)[];

const BOOLEAN_FIELDS = [
  "autoPlanOnOpen",
  "blockCancellations",
  "blockCustomLineItems",
  "digestEnabled",
  "businessHoursEnabled",
  "spamFilterEnabled",
  "firstBriefingPending",
  "salesPulseEnabled",
  "deliveryExceptionWatchEnabled",
  "postResolutionFollowUpEnabled",
] as const satisfies readonly (keyof OrgSettings)[];

const STRING_FIELDS = [
  ["aiContext", 2000],
  ["brandVoice", 200],
  ["agentName", 100],
  ["defaultInstruction", 2000],
  ["replyLanguage", 100],
  ["autoAckMessage", 500],
  ["onboardingCompletedAt", 64],
  ["lastSuccessfulDigestAt", 64],
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

export const BUSINESS_HOURS_DAYS = [
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

function readNullablePercent(
  value: Record<string, unknown>,
  key: string,
  output: Record<string, unknown>,
  context: ParseContext,
): void {
  if (!hasOwn(value, key)) return;
  const candidate = value[key];
  if (
    candidate === null
    || (typeof candidate === "number" && Number.isFinite(candidate) && candidate >= 0 && candidate <= 100)
  ) {
    output[key] = candidate;
    return;
  }
  addIssue(context, key, "Expected null or a number from 0 to 100");
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

export function isValidTimeZone(value: string): boolean {
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

  readNullablePercent(value, "maxDiscountPercent", output, context);
  readNullableNonNegativeNumber(value, "lowStockThreshold", output, context);
  readInteger(value, "maxIterations", 1, 100, output, context);
  readInteger(value, "postResolutionFollowUpDays", 1, 90, output, context);
  readEnum(value, "autoExecuteMode", AUTO_EXECUTE_MODES, output, context);
  readEnum(value, "autonomyTier", AUTONOMY_TIERS, output, context);
  readEnum(value, "digestFrequency", DIGEST_FREQUENCIES, output, context);
  readEnum(value, "digestDays", DIGEST_DAYS, output, context);
  readToolsEnabled(value, output, context);
  readBusinessHoursDays(value, output, context);
  readSampleReplies(value, output, context);

  if (
    context.mode === "stored"
    && output.autoExecuteMode === undefined
    && typeof value.autoExecuteEnabled === "boolean"
  ) {
    output.autoExecuteMode = value.autoExecuteEnabled ? "live" : "off";
  }

  if (context.issues.length > 0) {
    throw new OrgSettingsValidationError(context.issues);
  }
  return output as OrgSettingsPatch;
}

export function parseOrgSettingsPatch(value: unknown): OrgSettingsPatch {
  return parseSettingsObject(value, "strict");
}

export function parseStoredOrgSettingsPatch(value: unknown): OrgSettingsPatch {
  return parseSettingsObject(value, "stored");
}
