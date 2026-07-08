import { filterImessagePlatformConfigs, type ImessageAvailability } from "./imessage-visibility";
import { filterTelegramPlatformConfigs, type TelegramAvailability } from "./telegram-visibility";

export interface OperatorChannelAvailability {
  telegram?: TelegramAvailability;
  imessage?: ImessageAvailability;
}

export function filterOperatorPlatformConfigs<T extends { id: string }>(
  configs: T[],
  availability: OperatorChannelAvailability,
): T[] {
  return filterImessagePlatformConfigs(
    filterTelegramPlatformConfigs(configs, availability.telegram),
    availability.imessage,
  );
}
