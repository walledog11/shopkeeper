export interface TelegramAvailability {
  botUsername?: string | null;
}

export function normalizeTelegramBotUsername(raw: string | undefined | null): string | null {
  const v = raw?.trim().replace(/^@+/, "");
  return v && v.length > 0 ? v : null;
}

export function shouldShowTelegramIntegration(status: TelegramAvailability | undefined): boolean {
  return Boolean(normalizeTelegramBotUsername(status?.botUsername ?? undefined));
}

export function filterTelegramPlatformConfigs<T extends { id: string }>(
  configs: T[],
  status: TelegramAvailability | undefined,
): T[] {
  return configs.filter((config) => config.id !== "telegram" || shouldShowTelegramIntegration(status));
}
