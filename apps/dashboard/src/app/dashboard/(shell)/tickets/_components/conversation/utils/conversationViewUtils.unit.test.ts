import { describe, expect, it } from "vitest"
import { partitionConversationMessages } from "./conversationViewUtils"
import type { Ticket } from "@/types"

const messages: Ticket["messages"] = [
  { id: "1", sender: "customer", text: "Need help", time: "1m", attachments: [] },
  { id: "2", sender: "note", text: "Investigating", time: "2m", attachments: [], author: "Raj" },
  { id: "3", sender: "agent", text: "Reply sent", time: "3m", attachments: [] },
]

describe("partitionConversationMessages", () => {
  it("splits chat and note messages and returns chat display state", () => {
    const result = partitionConversationMessages(messages, "chat")

    expect(result.chatMessages.map(message => message.id)).toEqual(["1", "3"])
    expect(result.noteMessages.map(message => message.id)).toEqual(["2"])
    expect(result.displayMessages.map(message => message.id)).toEqual(["1", "3"])
    expect(result.noteCount).toBe(1)
  })

  it("returns note display state for the notes tab", () => {
    const result = partitionConversationMessages(messages, "notes")

    expect(result.displayMessages.map(message => message.id)).toEqual(["2"])
  })
})
