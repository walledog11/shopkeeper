export interface TelegramUpdate {
  message?: {
    message_id?: number;
    text?: string;
    chat?: {
      id: number;
      type: 'private' | 'group' | 'supergroup' | 'channel';
    };
  };
}

export type TelegramReply = (text: string) => Promise<void>;

export interface TelegramMessageContext {
  chatId: string;
  messageId: number;
  reply: TelegramReply;
}
