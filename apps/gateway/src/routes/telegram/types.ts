export interface TelegramUpdate {
  message?: {
    message_id?: number;
    text?: string;
    from?: {
      id?: number | string;
      first_name?: string;
      last_name?: string;
      username?: string;
    };
    chat?: {
      id: number | string;
      type: 'private' | 'group' | 'supergroup' | 'channel';
      title?: string;
      first_name?: string;
      last_name?: string;
      username?: string;
    };
  };
}

export type TelegramReply = (text: string) => Promise<void>;

export interface TelegramChatMetadata {
  telegramUserId: string | null;
  displayName: string | null;
  username: string | null;
}

export interface TelegramMessageContext {
  chatId: string;
  messageId: number;
  metadata: TelegramChatMetadata;
  reply: TelegramReply;
}
