import { isRecord } from '@shopkeeper/shared/guards';
import { parseChatImageUrl } from './images';

export interface StorefrontChatSettings {
  title: string;
  subtitle: string;
  logoUrl: string;
  accentColor: string;
  launcherLabel: string;
  launcherStyle: 'label' | 'icon';
  greeting: string;
  quickPrompts: string[];
  position: 'left' | 'right';
  offsetX: number;
  offsetY: number;
  showOnDesktop: boolean;
  showOnMobile: boolean;
}

export interface PublishedChatConfiguration {
  schemaVersion: 1;
  revision: number;
  publishedAt: string;
  settings: StorefrontChatSettings;
}

export interface ChatConfigurationResponse {
  shop: string;
  shopName: string;
  enabled: boolean;
  configuration: PublishedChatConfiguration | null;
}

export const DEFAULT_CHAT_SETTINGS: StorefrontChatSettings = {
  title: '',
  subtitle: 'Here to help',
  logoUrl: '',
  accentColor: '#1b1a19',
  launcherLabel: 'Chat with us',
  launcherStyle: 'label',
  greeting: 'Hi! How can we help you today?',
  quickPrompts: ["What's your return policy?", 'Do you ship internationally?'],
  position: 'right',
  offsetX: 20,
  offsetY: 20,
  showOnDesktop: true,
  showOnMobile: true,
};

type Validation = { settings: StorefrontChatSettings; error?: never } | { settings?: never; error: string };

/** Explicitly project public presentation fields. Never return integration metadata. */
export function validateChatSettings(input: unknown): Validation {
  if (!isRecord(input)) return { error: 'Chat settings are required.' };
  const textLimits = { title: 60, subtitle: 100, logoUrl: 2048, launcherLabel: 40, greeting: 400 } as const;
  for (const [key, limit] of Object.entries(textLimits)) {
    if (typeof input[key] !== 'string' || input[key].length > limit) {
      return { error: `${key} must be text with at most ${limit} characters.` };
    }
  }
  const text = input as unknown as Pick<StorefrontChatSettings, keyof typeof textLimits>;
  if (!text.launcherLabel.trim()) return { error: 'Enter a label for the chat button.' };
  if (text.logoUrl.trim() && !parseChatImageUrl(text.logoUrl.trim())) {
    try {
      const url = new URL(text.logoUrl.trim());
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error();
    } catch {
      return { error: 'Choose a valid chat picture.' };
    }
  }
  if (typeof input.accentColor !== 'string' || !/^#[\da-f]{6}$/i.test(input.accentColor)) {
    return { error: 'Choose a color using six hex digits, such as #1b1a19.' };
  }
  if (input.launcherStyle !== 'label' && input.launcherStyle !== 'icon') return { error: 'Choose a chat button style.' };
  if (input.position !== 'left' && input.position !== 'right') return { error: 'Choose left or right placement.' };
  for (const key of ['offsetX', 'offsetY'] as const) {
    if (typeof input[key] !== 'number' || !Number.isInteger(input[key]) || input[key] < 12 || input[key] > 64) {
      return { error: 'Distance from screen edges must be between 12 and 64 pixels.' };
    }
  }
  if (typeof input.showOnDesktop !== 'boolean' || typeof input.showOnMobile !== 'boolean') {
    return { error: 'Choose where the chat button should appear.' };
  }
  if (!Array.isArray(input.quickPrompts)
    || input.quickPrompts.some(value => typeof value !== 'string' || value.length > 100)) {
    return { error: 'Add up to six suggested questions, each at most 100 characters.' };
  }
  const quickPrompts = input.quickPrompts.map(value => (value as string).trim()).filter(Boolean);
  if (quickPrompts.length > 6) return { error: 'Add up to six suggested questions.' };
  return { settings: {
    title: text.title.trim(), subtitle: text.subtitle.trim(), logoUrl: text.logoUrl.trim(),
    launcherLabel: text.launcherLabel.trim(), greeting: text.greeting.trim(),
    accentColor: input.accentColor.toLowerCase(), launcherStyle: input.launcherStyle,
    position: input.position, offsetX: input.offsetX as number, offsetY: input.offsetY as number,
    showOnDesktop: input.showOnDesktop, showOnMobile: input.showOnMobile,
    quickPrompts,
  } };
}

export function readChatConfiguration(metadata: unknown): PublishedChatConfiguration | null {
  const chat = isRecord(metadata) && isRecord(metadata.storefrontChat) ? metadata.storefrontChat : null;
  const config = chat && isRecord(chat.configuration) ? chat.configuration : null;
  if (!config || config.schemaVersion !== 1 || !Number.isSafeInteger(config.revision)
    || (config.revision as number) < 1 || typeof config.publishedAt !== 'string'
    || !Number.isFinite(Date.parse(config.publishedAt))) return null;
  const result = validateChatSettings(config.settings);
  if (!result.settings) return null;
  return { schemaVersion: 1, revision: config.revision as number, publishedAt: config.publishedAt, settings: result.settings };
}
