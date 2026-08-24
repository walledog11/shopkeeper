import type { Ticket } from "@/types"

export interface ConversationPartitions {
  chatMessages: Ticket["messages"]
  displayMessages: Ticket["messages"]
}

export function partitionConversationMessages(
  messages: Ticket["messages"],
): ConversationPartitions {
  const chatMessages = messages.filter(message => message.sender !== "note")

  return {
    chatMessages,
    displayMessages: chatMessages,
  }
}
