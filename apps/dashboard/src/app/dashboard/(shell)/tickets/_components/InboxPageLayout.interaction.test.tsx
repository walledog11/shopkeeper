/**
 * @vitest-environment jsdom
 */
import { act, useState, type ComponentProps } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Ticket } from "@/types"
import { InboxPageLayout } from "./InboxPageLayout"

const conversationRender = vi.hoisted(() => vi.fn())

vi.mock("./conversation/ConversationView", () => ({
  default: ({ ticket, onBack }: { ticket: Ticket; onBack: () => void }) => {
    conversationRender(ticket.id, ticket.messages.at(-1)?.text)
    return (
      <div data-testid="conversation">
        <span>{ticket.id}:{ticket.messages.at(-1)?.text}</span>
        <button type="button" onClick={onBack}>Close conversation</button>
      </div>
    )
  },
}))

vi.mock("./stream/InboxControls", () => ({ InboxControls: () => null }))
vi.mock("./stream/InboxStream", () => ({ InboxStream: () => null }))
vi.mock("./stream/InboxStreamLoading", () => ({ InboxStreamLoading: () => null }))

type LayoutProps = ComponentProps<typeof InboxPageLayout>

function ticket(id: string, text: string): Ticket {
  return {
    id,
    channelType: "email",
    platform: "Email",
    logo: "/logos/email.svg",
    customer: `Customer ${id}`,
    customerRecord: null,
    time: "Now",
    lastMessageAt: "2026-09-07T12:00:00.000Z",
    subject: `Conversation ${id}`,
    preview: text,
    tag: "Support",
    tagColor: "",
    escalatedAt: null,
    aiSummary: "",
    status: "open",
    lastCustomerMessageAt: "2026-09-07T12:00:00.000Z",
    hasPlan: false,
    cachedPlan: null,
    cachedPlanMessageId: null,
    shopifyCustomerId: null,
    filterStatus: "genuine",
    filterReason: null,
    requestDisposition: null,
    messages: [{
      id: `message-${id}-${text}`,
      sender: "customer",
      text,
      time: "12:00",
      attachments: [],
    }],
  }
}

function Harness() {
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null)
  const [firstMessage, setFirstMessage] = useState("first message")
  const conversationTicket = activeTicketId
    ? ticket(activeTicketId, activeTicketId === "ticket-a" ? firstMessage : "second conversation")
    : undefined
  const noop = () => undefined
  const props: LayoutProps = {
    actions: {
      onAgentComplete: noop,
      onAgentRunningChange: noop,
      onAgentTurnAdd: noop,
      onBack: () => setActiveTicketId(null),
      onCorrectReplyDismiss: noop,
      onLinkShopifyCustomer: async () => undefined,
      onLoadMore: noop,
      onNotReal: noop,
      onOpen: setActiveTicketId,
      onRecover: noop,
      onAnswered: noop,
      onReopen: noop,
      onReplyChange: noop,
      onResolve: noop,
      onRetry: noop,
      onRetrySend: noop,
      onReview: noop,
      onSearchChange: noop,
      onSend: noop,
      onSendMessage: noop,
      onActionError: noop,
      onTicketRefresh: noop,
      onToggleClosed: noop,
      onTrust: noop,
      onRetryConversationLoad: noop,
    },
    conversation: {
      activeAgentTurns: [],
      activeThread: undefined,
      activeThreadError: undefined,
      activeThreadPreview: undefined,
      cachedPlan: null,
      conversationTicket,
      failedMessages: [],
      messagesEndRef: { current: null },
      replyText: "",
      composerAttachments: {
        attachments: [],
        attachmentRefs: [],
        attachmentsBlockSend: false,
        addFiles: async () => undefined,
        removeAttachment: noop,
        clearAttachments: noop,
      },
      sendError: null,
      toast: null,
    },
    flags: {
      correctReplyVisible: false,
      hasMore: false,
      hasShopify: false,
      includeClosed: false,
      isAgentRunning: false,
      isConversationLoading: false,
      isLoadingMore: false,
      isSearchLoading: false,
      isSearchMode: false,
      isSending: false,
      listLoading: false,
    },
    list: {
      activeTicketId,
      approvingTicketId: null,
      searchQuery: "",
      spamTickets: [],
      tickets: [],
      totalCount: 0,
    },
  }

  return (
    <>
      <button type="button" onClick={() => setActiveTicketId("ticket-a")}>Open first</button>
      <button type="button" onClick={() => setActiveTicketId("ticket-b")}>Open second</button>
      <button type="button" onClick={() => setFirstMessage("updated message")}>Receive message</button>
      <InboxPageLayout {...props} />
    </>
  )
}

describe("InboxPageLayout conversation dialog", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    conversationRender.mockClear()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  it("settles while open and keeps updates and ticket switches current", async () => {
    await act(async () => root.render(<Harness />))

    await act(async () => {
      ;[...container.querySelectorAll("button")]
        .find(button => button.textContent === "Open first")
        ?.click()
    })
    expect(document.body.textContent).toContain("ticket-a:first message")

    const rendersAfterOpen = conversationRender.mock.calls.length
    await act(async () => new Promise(resolve => setTimeout(resolve, 0)))
    expect(conversationRender).toHaveBeenCalledTimes(rendersAfterOpen)

    await act(async () => {
      ;[...container.querySelectorAll("button")]
        .find(button => button.textContent === "Receive message")
        ?.click()
    })
    expect(document.body.textContent).toContain("ticket-a:updated message")

    await act(async () => {
      ;[...container.querySelectorAll("button")]
        .find(button => button.textContent === "Open second")
        ?.click()
    })
    expect(document.body.textContent).toContain("ticket-b:second conversation")
    expect(document.body.textContent).not.toContain("ticket-a:updated message")

    await act(async () => {
      ;[...document.body.querySelectorAll("button")]
        .find(button => button.textContent === "Close conversation")
        ?.click()
    })

    await act(async () => {
      ;[...container.querySelectorAll("button")]
        .find(button => button.textContent === "Open first")
        ?.click()
    })
    expect(document.body.textContent).toContain("ticket-a:updated message")
    expect(document.body.textContent).not.toContain("ticket-b:second conversation")
  })
})
