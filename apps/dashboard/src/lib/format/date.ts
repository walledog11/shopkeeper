export type DateInput = string | number | Date | null | undefined;

interface RelativeParts {
  date: Date;
  seconds: number;
  minutes: number;
  hours: number;
  days: number;
}

interface ShortRelativeTimeOptions {
  includeSeconds?: boolean;
  justNowSeconds?: number;
  minuteUnit?: "m" | "min";
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

function relativeParts(input: DateInput): RelativeParts | null {
  const date = dateFromInput(input);
  if (!date) return null;

  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
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
  { fallback = "Just now", hour = "2-digit", timeZone }: ClockTimeFormatOptions = {},
): string {
  const date = dateFromInput(input);
  if (!date) return fallback;

  return date.toLocaleTimeString([], {
    hour,
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  });
}

export function formatRelativeTime(iso: DateInput): string {
  const parts = relativeParts(iso);
  if (!parts) return "just now";

  if (parts.minutes < 1) return "just now";
  if (parts.minutes < 60) return `${parts.minutes}m ago`;

  if (parts.hours < 24) return `${parts.hours}h ago`;

  if (parts.days === 1) return "yesterday";
  if (parts.days < 7) return `${parts.days}d ago`;

  return parts.date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatRelativeTimestamp(input: DateInput): string {
  const parts = relativeParts(input);
  if (!parts) return "just now";

  if (parts.minutes < 1) return "just now";
  if (parts.minutes < 60) return `${parts.minutes}m ago`;
  if (parts.hours < 24) return `${parts.hours}h ago`;

  return formatMonthDay(parts.date);
}

export function formatShortRelativeTime(
  input: DateInput,
  {
    includeSeconds = false,
    justNowSeconds = 60,
    minuteUnit = "m",
  }: ShortRelativeTimeOptions = {},
): string {
  const parts = relativeParts(input);
  if (!parts) return "just now";

  if (parts.seconds < justNowSeconds) return "just now";
  if (includeSeconds && parts.seconds < 60) return `${parts.seconds}s ago`;
  if (parts.minutes < 1) return "just now";
  if (parts.minutes < 60) {
    return minuteUnit === "min" ? `${parts.minutes} min ago` : `${parts.minutes}m ago`;
  }
  if (parts.hours < 24) return `${parts.hours}h ago`;
  return `${parts.days}d ago`;
}

export function formatSyncRelativeTime(input: DateInput): string {
  return formatShortRelativeTime(input, {
    includeSeconds: true,
    justNowSeconds: 30,
    minuteUnit: "min",
  });
}

export function formatLastActivityTime(input: DateInput): string {
  return formatShortRelativeTime(input, { justNowSeconds: 120 });
}

export function formatTicketAge(iso: string): string {
  const parts = relativeParts(iso);
  if (!parts) return "just now";

  if (parts.minutes < 1) return "just now";
  if (parts.minutes < 60) return `${parts.minutes}m`;
  if (parts.hours < 24) return `${parts.hours}h`;
  if (parts.days < 7) return `${parts.days}d`;

  const now = new Date();
  const sameYear = parts.date.getFullYear() === now.getFullYear();
  return parts.date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export function timeAgo(iso: string): string {
  return formatShortRelativeTime(iso);
}
