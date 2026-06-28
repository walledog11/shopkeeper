/**
 * @vitest-environment jsdom
 */

import React, { act, useState, type ComponentProps } from "react"
import { createRoot, type Root } from "react-dom/client"
import { AGENT_PLAN_CACHE_VERSION } from "@shopkeeper/agent/plan-cache-shape"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { TicketsPageLayout } from "./TicketsPageLayout"
import type { AgentPlan, Thread, Ticket } from "@/types"

vi.mock("next/image", async () => {
  const React = await import("react")
  return {
    default: function MockImage(props: React.ImgHTMLAttributes<HTMLImageElement>) {
      return React.createElement("img", props)
    },
  }
})

vi.mock("./thread-list/ThreadListHeader", async () => {
  const React = await import("react")
  return {
    ThreadListHeader: function MockThreadListHeader() {
      return React.createElement("header", { "data-testid": "thread-list-header" })
    },
  }
})

vi.mock("./conversation/ConversationView", async () => {
  const React = await import("react")
  return {
    default: function MockConversationView(props: {
      embedded?: boolean
      replyText: string
      status: { threadLoading?: boolean }
      onBack: () => void
      onReplyChange: (text: string) => void
    }) {
      return React.createElement(
        "section",
        {
          "data-testid": "ticket-conversation",
          "data-embedded": props.embedded ? "true" : "false",
        },
        React.createElement("button", { type: "button", onClick: props.onBack }, "Close conversation"),
        props.status.threadLoading ? React.createElement("p", null, "Thread loading") : null,
        React.createElement("textarea", {
          "data-testid": "reply-composer-textarea",
          value: props.replyText,
          onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => props.onReplyChange(event.currentTarget.value),
        }),
      )
    },
  }
})

vi.mock("./context-panel/ContextPanel", async () => {
  const React = await import("react")
  return {
    default: function MockContextPanel(props: { hasShopify: boolean }) {
      return React.createElement(
        "aside",
        { "data-testid": "context-panel" },
        props.hasShopify ? "Shopify orders" : "Channel context",
      )
    },
  }
})

type LayoutProps = ComponentProps<typeof TicketsPageLayout>
type LayoutPropsOverrides = {
  actions?: Partial<LayoutProps["actions"]>
  conversation?: Partial<LayoutProps["conversation"]>
  filters?: Partial<LayoutProps["filters"]>
  flags?: Partial<LayoutProps["flags"]>
  list?: Partial<LayoutProps["list"]>
}

const now = "2026-06-17T18:00:00.000Z"

function quickReplyPlan(): AgentPlan {
  return {
    instruction: "Reply with shipping policy",
    rawToolCalls: [{ id: "reply-1", name: "send_reply", input: { text: "We ship in 2-3 days." } }],
    steps: [{
      id: "reply-1",
      tool: "send_reply",
      label: "Reply",
      description: "Send shipping policy reply",
      category: "communication",
      enabled: true,
    }],
  }
}

function cachedPlan(plan: AgentPlan, messageId = "msg-1") {
  return {
    version: AGENT_PLAN_CACHE_VERSION,
    instruction: plan.instruction,
    lastCustomerMessageId: messageId,
    settingsFingerprint: "test",
    plan,
  }
}

function ticket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: "thread-1",
    channelType: "email",
    platform: "Email",
    logo: "/logos/email.svg",
    customer: "Alex Rivera",
    customerRecord: {
      id: "cust-1",
      organizationId: "org-1",
      name: "Alex Rivera",
      platformId: "alex@example.com",
      profilePicUrl: null,
      createdAt: now,
    },
    time: "5m",
    lastMessageAt: now,
    subject: "Shipping question",
    preview: "How long does shipping take?",
    tag: "Shipping",
    tagColor: "text-slate-500 bg-slate-100 border-slate-200",
    aiSummary: "Customer asked about shipping.",
    status: "open",
    lastCustomerMessageAt: now,
    hasPlan: false,
    cachedPlan: null,
    cachedPlanMessageId: null,
    shopifyCustomerId: "shopify-1",
    filterStatus: "genuine",
    filterReason: null,
    messages: [{
      id: "msg-1",
      sender: "customer",
      text: "How long does shipping take?",
      time: now,
      attachments: [],
    }],
    ...overrides,
  }
}

function threadFromTicket(source: Ticket): Thread {
  return {
    id: source.id,
    organizationId: "org-1",
    customerId: source.customerRecord?.id ?? "cust-1",
    channelType: source.channelType,
    status: source.status,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: source.lastMessageAt,
    aiSummary: source.aiSummary,
    subject: source.subject,
    tag: source.tag,
    shopifyCustomerId: source.shopifyCustomerId,
    cachedPlanMessageId: source.cachedPlanMessageId,
    cachedPlan: source.cachedPlan,
    filterStatus: source.filterStatus,
    filterReason: source.filterReason,
    filterFeedback: "none",
    customer: source.customerRecord ?? {
      id: "cust-1",
      organizationId: "org-1",
      name: source.customer,
      platformId: "alex@example.com",
      profilePicUrl: null,
      createdAt: now,
    },
    messages: source.messages.map(message => ({
      id: message.id,
      threadId: source.id,
      senderType: message.sender,
      contentText: message.text,
      mediaUrl: null,
      attachments: message.attachments,
      sentAt: message.time ?? source.lastMessageAt,
      sendStatus: message.sendStatus,
    })),
  }
}

function baseProps(overrides: LayoutPropsOverrides = {}): LayoutProps {
  const selectedTicket = ticket()
  const selectedThread = threadFromTicket(selectedTicket)
  const list: LayoutProps["list"] = {
    activeTicketId: null,
    approvingTicketId: null,
    effectiveActiveView: "for_me",
    filteredTickets: [selectedTicket],
    forMeCount: 1,
    liveTicketCount: 1,
    openThreadCount: 1,
    selectedIds: [],
    spamCount: 0,
    ...overrides.list,
  }

  return {
    conversation: {
      activeAgentTurns: [],
      activeThread: list.activeTicketId ? selectedThread : undefined,
      activeThreadError: null,
      activeThreadPreview: undefined,
      agentName: "Coco",
      cachedPlan: null,
      conversationTicket: list.activeTicketId ? selectedTicket : undefined,
      failedMessages: [],
      messagesEndRef: React.createRef<HTMLDivElement>(),
      orgSettings: null,
      replyText: "",
      sendError: null,
      toast: null,
      ...overrides.conversation,
    },
    filters: {
      channelFilter: null,
      connectedChannels: ["email"],
      searchQuery: "",
      tagFilter: null,
      ...overrides.filters,
    },
    flags: {
      correctReplyVisible: false,
      hasMore: false,
      hasShopify: true,
      isAgentRunning: false,
      isConversationLoading: false,
      isLoadingMore: false,
      isSearchLoading: false,
      isSearchMode: false,
      isSending: false,
      listLoading: false,
      ...overrides.flags,
    },
    list,
    actions: {
      onAgentComplete: vi.fn(),
      onAgentRunningChange: vi.fn(),
      onAgentTurnAdd: vi.fn(),
      onBack: vi.fn(),
      onBulkArchive: vi.fn(),
      onBulkClose: vi.fn(),
      onBulkTag: vi.fn(),
      onClearSelection: vi.fn(),
      onCorrectReplyDismiss: vi.fn(),
      onChannelFilterChange: vi.fn(),
      onTagFilterChange: vi.fn(),
      onLinkShopifyCustomer: vi.fn(),
      onLoadMore: vi.fn(),
      onMarkAsSpam: vi.fn(),
      onRecover: vi.fn(),
      onQuickApproveFromList: vi.fn(),
      onReviewFromList: vi.fn(),
      onReopen: vi.fn(),
      onReplyChange: vi.fn(),
      onResolve: vi.fn(),
      onRetry: vi.fn(),
      onRetrySend: vi.fn(),
      onTicketRefresh: vi.fn(),
      onActionError: vi.fn(),
      onSearchChange: vi.fn(),
      onSelectTicket: vi.fn(),
      onSend: vi.fn(),
      onViewChange: vi.fn(),
      onViewSpam: vi.fn(),
      onToggleSelect: vi.fn(),
      ...overrides.actions,
    },
  }
}

function LayoutHarness({
  tickets,
  activeView = "for_me",
  initialActiveId = null,
  loading = false,
  error = null,
  onQuickApprove = vi.fn(),
}: {
  tickets: Ticket[]
  activeView?: LayoutProps["list"]["effectiveActiveView"]
  initialActiveId?: string | null
  loading?: boolean
  error?: unknown
  onQuickApprove?: (id: string) => void
}) {
  const [activeId, setActiveId] = useState<string | null>(initialActiveId)
  const activeTicket = tickets.find(item => item.id === activeId)
  const activeThread = activeTicket && !loading && !error ? threadFromTicket(activeTicket) : undefined

  return React.createElement(TicketsPageLayout, baseProps({
    list: {
      activeTicketId: activeId,
      effectiveActiveView: activeView,
      filteredTickets: tickets,
    },
    conversation: {
      activeThread,
      activeThreadError: error,
      conversationTicket: activeTicket && !error ? activeTicket : undefined,
    },
    flags: {
      isConversationLoading: loading,
      hasShopify: true,
    },
    actions: {
      onBack: () => setActiveId(null),
      onSelectTicket: id => setActiveId(id),
      onQuickApproveFromList: onQuickApprove,
    },
  }))
}

let root: Root | null = null
let container: HTMLDivElement | null = null

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

  class TestResizeObserver {
    observe() {}
    disconnect() {}
  }

  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    value: TestResizeObserver,
  })

  Object.defineProperty(globalThis, "requestAnimationFrame", {
    configurable: true,
    value: (callback: FrameRequestCallback) => window.setTimeout(callback, 0),
  })

  Object.defineProperty(globalThis, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    }),
  })

  Element.prototype.scrollIntoView = function () {}
  Element.prototype.hasPointerCapture = function () { return false }
  Element.prototype.setPointerCapture = function () {}
  Element.prototype.releasePointerCapture = function () {}
})

afterEach(() => {
  if (root) {
    act(() => root?.unmount())
  }
  root = null
  container?.remove()
  container = null
  vi.clearAllMocks()
})

function render(element: React.ReactElement) {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root?.render(element))
  return container
}

function click(element: Element) {
  act(() => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
  })
}

function firstCardSummaryButton(rootElement: ParentNode) {
  const button = Array.from(rootElement.querySelectorAll("button"))
    .find(element => element.querySelector("h3"))
  if (!button) throw new Error("Card summary button not found")
  return button
}

function ticketDialog() {
  return document.body.querySelector('[role="dialog"]')
}

describe("TicketsPageLayout board ticket dialog", () => {
  it("uses the board layout for the closed view", () => {
    const item = ticket({ id: "closed-1", status: "closed" })
    const view = render(React.createElement(LayoutHarness, {
      tickets: [item],
      activeView: "closed",
    }))

    expect(view.querySelector('[data-testid="tickets-list"]')).toBeNull()
    expect(view.querySelector('[data-testid="thread-list-header"]')).not.toBeNull()
    expect(view.textContent).toContain("Closed")
    expect(firstCardSummaryButton(view)).not.toBeNull()
  })

  it("opens a conversation dialog when a board card is clicked", () => {
    const item = ticket()
    const view = render(React.createElement(LayoutHarness, { tickets: [item] }))

    expect(ticketDialog()).toBeNull()

    click(firstCardSummaryButton(view))

    const dialog = ticketDialog()
    expect(dialog).not.toBeNull()
    expect(dialog?.querySelector('[data-testid="ticket-conversation"]')?.getAttribute("data-embedded")).toBe("true")
    expect(dialog?.querySelector('[data-testid="reply-composer-textarea"]')).not.toBeNull()
  })

  it("keeps loading and error states inside the dialog", () => {
    const item = ticket()
    render(React.createElement(LayoutHarness, {
      tickets: [item],
      initialActiveId: item.id,
      loading: true,
    }))

    const loadingDialog = ticketDialog()
    expect(loadingDialog?.textContent).toContain("Thread loading")

    act(() => root?.unmount())
    root = null
    container?.remove()
    container = null

    render(React.createElement(LayoutHarness, {
      tickets: [item],
      initialActiveId: item.id,
      error: new Error("nope"),
    }))

    const errorDialog = ticketDialog()
    expect(errorDialog).not.toBeNull()
    expect(errorDialog?.textContent).toContain("Unable to load conversation")
  })

  it("does not open the dialog when quick approve is clicked on a collapsed card", () => {
    const onQuickApprove = vi.fn()
    const item = ticket({
      hasPlan: true,
      cachedPlan: cachedPlan(quickReplyPlan()),
      cachedPlanMessageId: "msg-1",
    })
    const view = render(React.createElement(LayoutHarness, { tickets: [item], onQuickApprove }))

    const sendButton = view.querySelector('[data-testid="ticket-row-send"]')
    expect(sendButton).not.toBeNull()

    click(sendButton as Element)

    expect(onQuickApprove).toHaveBeenCalledWith(item.id)
    expect(ticketDialog()).toBeNull()
  })

  it("closes the dialog when the conversation is dismissed", () => {
    const item = ticket()
    render(React.createElement(LayoutHarness, { tickets: [item], initialActiveId: item.id }))

    const dialog = ticketDialog()
    expect(dialog).not.toBeNull()

    const closeButton = Array.from(dialog?.querySelectorAll("button") ?? [])
      .find(element => element.textContent === "Close conversation")
    expect(closeButton).not.toBeUndefined()

    click(closeButton as Element)

    expect(ticketDialog()).toBeNull()
  })
})
