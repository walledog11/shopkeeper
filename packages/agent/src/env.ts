export function parseBooleanEnvValue(
  rawValue: string | undefined | null,
  fallback: boolean,
  envName: string,
  scope: string,
): boolean {
  if (!rawValue || rawValue.trim() === "") {
    return fallback;
  }

  const normalizedValue = rawValue.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalizedValue)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalizedValue)) {
    return false;
  }

  throw new Error(`[${scope}] ${envName} must be a boolean`);
}
