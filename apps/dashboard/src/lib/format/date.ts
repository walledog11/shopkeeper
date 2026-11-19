// Relative-time helpers below use the runtime clock and are intended for client
// components. When rendering dates on the server, pass `timeZone` explicitly —
// typically the org's business-hours zone — so day boundaries stay deterministic.
export type DateInput = string | number | Date | null | undefined;

interface RelativeParts {
  date: Date;
  seconds: number;
  minutes: number;
  hours: number;
  days: number;
}

interface DateFormatOptions {
  fallback?: string;
  timeZone?: string;
}

interface ShortDateFormatOptions extends DateFormatOptions {
  includeYear?: boolean;
}

interface ClockTimeFormatOptions extends DateFormatOptions {
  hour?: "numeric" | "2-digit";
}

function dateFromInput(input: DateInput): Date | null {
  if (input == null || input === "") return null;
  const date = input instanceof Date ? input : new Date(input);
  return Number.isFinite(date.getTime()) ? date : null;
}

function relativePartsAt(input: DateInput, now: Date): RelativeParts | null {
  const date = dateFromInput(input);
  if (!date) return null;

  const seconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  return { date, seconds, minutes, hours, days };
}

function formatMonthDay(date: Date, now = new Date()): string {
  const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (date.getFullYear() !== now.getFullYear()) {
    options.year = "numeric";
  }
  return date.toLocaleDateString("en-US", options);
}

export function formatTime(dateString: string): string {
  const date = dateFromInput(dateString);
  if (!date) return "Just now";

  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const time = formatClockTime(date);

  if (isToday) return time;

  const dateLabel = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${dateLabel} · ${time}`;
}

export function formatDate(input: DateInput, { fallback = "Unknown date", timeZone }: DateFormatOptions = {}): string {
  const date = dateFromInput(input);
  if (!date) return fallback;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(timeZone ? { timeZone } : {}),
  });
}

export function formatShortDate(
  input: DateInput,
  { fallback = "Unknown date", includeYear = false, timeZone }: ShortDateFormatOptions = {},
): string {
  const date = dateFromInput(input);
  if (!date) return fallback;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(includeYear ? { year: "numeric" } : {}),
    ...(timeZone ? { timeZone } : {}),
  });
}

export function formatMonthYear(input: DateInput, { fallback = "Unknown date", timeZone }: DateFormatOptions = {}): string {
  const date = dateFromInput(input);
  if (!date) return fallback;

  return date.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    ...(timeZone ? { timeZone } : {}),
  });
}

export function formatUnixDate(unixSeconds: number | null | undefined, options?: DateFormatOptions): string {
  if (typeof unixSeconds !== "number" || !Number.isFinite(unixSeconds)) {
    return options?.fallback ?? "Unknown date";
  }
  return formatDate(unixSeconds * 1000, options);
}

export function formatClockTime(
  input: DateInput,
  { fallback = "Just now", hour = "numeric", timeZone }: ClockTimeFormatOptions = {},
): string {
  const date = dateFromInput(input);
  if (!date) return fallback;

  return date.toLocaleTimeString([], {
    hour,
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  });
}

/**
 * How long ago something happened, in the one format the app uses: "just now",
 * "13 min ago", "2 hr ago", "yesterday", "3 days ago", then "Nov 3" (with the
 * year once it is not this year). Lowercase, so it reads inside a sentence
 * ("Last message 13 min ago") as well as on its own.
 */
export function formatRelativeTime(input: DateInput, now: Date = new Date()): string {
  const parts = relativePartsAt(input, now);
  if (!parts || parts.minutes < 1) return "just now";
  if (parts.minutes < 60) return `${parts.minutes} min ago`;
  if (parts.hours < 24) return `${parts.hours} hr ago`;
  if (parts.days === 1) return "yesterday";
  if (parts.days < 7) return `${parts.days} days ago`;
  return formatMonthDay(parts.date, now);
}
