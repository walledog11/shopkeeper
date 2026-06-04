export interface TelegramUpdate {
  message?: {
    text?: string;
    chat?: {
      id: number;
      type: 'private' | 'group' | 'supergroup' | 'channel';
    };
  };
}

export type TelegramReply = (text: string) => Promise<void>;
