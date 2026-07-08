export interface ImessageAvailability {
  lineHandle?: string | null;
}

export function normalizeImessageLineHandle(raw: string | undefined | null): string | null {
  const v = raw?.trim();
  return v && v.length > 0 ? v : null;
}

export function shouldShowImessageIntegration(status: ImessageAvailability | undefined): boolean {
  return Boolean(normalizeImessageLineHandle(status?.lineHandle ?? undefined));
}

export function filterImessagePlatformConfigs<T extends { id: string }>(
  configs: T[],
  status: ImessageAvailability | undefined,
): T[] {
  return configs.filter((config) => config.id !== "imessage" || shouldShowImessageIntegration(status));
}
