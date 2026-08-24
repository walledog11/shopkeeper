interface TelegramChatStatus {
  chatId: string
  connectedAt: string
  displayLabel: string | null
}

export interface TelegramMemberStatus {
  connected: boolean
  chats: TelegramChatStatus[]
  botUsername: string | null
}
