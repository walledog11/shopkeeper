import type { Ticket } from "@/types"

export interface ConversationPartitions {
  chatMessages: Ticket["messages"]
  noteMessages: Ticket["messages"]
  displayMessages: Ticket["messages"]
  noteCount: number
}

export function partitionConversationMessages(
  messages: Ticket["messages"],
  viewTab: "chat" | "notes",
): ConversationPartitions {
  const chatMessages = messages.filter(message => message.sender !== "note")
  const noteMessages = messages.filter(message => message.sender === "note")

  return {
    chatMessages,
    noteMessages,
    displayMessages: viewTab === "chat" ? chatMessages : noteMessages,
    noteCount: noteMessages.length,
  }
}
