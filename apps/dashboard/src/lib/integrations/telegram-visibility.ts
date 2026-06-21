export interface TelegramAvailability {
  botUsername?: string | null;
}

export function shouldShowTelegramIntegration(status: TelegramAvailability | undefined): boolean {
  return Boolean(status?.botUsername);
}

export function filterTelegramPlatformConfigs<T extends { id: string }>(
  configs: T[],
  status: TelegramAvailability | undefined,
): T[] {
  return configs.filter((config) => config.id !== "telegram" || shouldShowTelegramIntegration(status));
}
