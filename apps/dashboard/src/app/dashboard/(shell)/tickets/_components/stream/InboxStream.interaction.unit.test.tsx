/**
 * @vitest-environment jsdom
 */
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { InboxStream } from "./InboxStream"
import {
  questionableTicket,
  sendReadyTicket,
  spamTicket,
} from "./inbox-stream-fixtures"

vi.mock("next/link", async () => {
  const React = await import("react")
  return {
    default: function MockLink(props: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
      return React.createElement("a", props, props.children)
    },
  }
})

vi.mock("@/components/agent/MerchantAnswerForm", () => ({
  default: () => null,
}))

const readAgentPlanCacheRecordShape = vi.hoisted(() =>
  vi.fn(() => ({ planId: "plan-send-1" })),
)

vi.mock("@shopkeeper/agent/plan-cache-shape", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@shopkeeper/agent/plan-cache-shape")>()),
  readAgentPlanCacheRecordShape,
}))

let root: Root | null = null
let container: HTMLDivElement | null = null

function renderStream(overrides: Partial<React.ComponentProps<typeof InboxStream>> = {}) {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)

  const onOpen = vi.fn()
  const onSend = vi.fn()
  const onReview = vi.fn()
  const onTrust = vi.fn()
  const onNotReal = vi.fn()
  const onRecover = vi.fn()
  const onAnswered = vi.fn()
  const onLoadMore = vi.fn()

  act(() => {
    root!.render(
      <InboxStream
        tickets={[sendReadyTicket, questionableTicket]}
        spamTickets={[spamTicket]}
        approvingTicketId={null}
        isSearchMode={false}
        hasMore
        isLoadingMore={false}
        hasAnyConversation
        onOpen={onOpen}
        onSend={onSend}
        onReview={onReview}
        onTrust={onTrust}
        onNotReal={onNotReal}
        onRecover={onRecover}
        onAnswered={onAnswered}
        onLoadMore={onLoadMore}
        {...overrides}
      />,
    )
  })

  return { onOpen, onSend, onReview, onTrust, onNotReal, onRecover, onAnswered, onLoadMore }
}

function click(element: Element | null) {
  act(() => {
    element?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
  })
}

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  container?.remove()
  container = null
  vi.clearAllMocks()
})

describe("InboxStream", () => {
  it("opens a conversation from the row header", () => {
    const { onOpen } = renderStream()
    const row = container!.querySelector('[data-ticket-id="thread-send"] button')
    click(row)
    expect(onOpen).toHaveBeenCalledWith("thread-send")
  })

  it("quick-sends from the list when a reply is ready", () => {
    const { onSend } = renderStream()
    click(container!.querySelector('[data-testid="ticket-row-send"]'))
    expect(onSend).toHaveBeenCalledWith("thread-send", "plan-send-1")
  })

  it("surfaces trust actions on questionable senders", () => {
    const { onTrust } = renderStream()
    click(container!.querySelector('[data-testid="ticket-row-trust"]'))
    expect(onTrust).toHaveBeenCalledWith("thread-trust")
  })

  it("loads more rows from the inbox footer", () => {
    const { onLoadMore } = renderStream()
    click(container!.querySelector('[data-testid="inbox-load-more"]'))
    expect(onLoadMore).toHaveBeenCalledTimes(1)
  })

  it("keeps spam rows collapsed until the footer is expanded", () => {
    const { onRecover } = renderStream()
    expect(container!.querySelector('[data-testid="inbox-spam-recover"]')).toBeNull()

    const toggle = container!.querySelector('[data-testid="inbox-section-spam"] button')
    click(toggle)

    const recover = container!.querySelector('[data-testid="inbox-spam-recover"]')
    expect(recover).not.toBeNull()
    click(recover)
    expect(onRecover).toHaveBeenCalledWith("thread-spam")
  })

  it("hides spam and external sections while searching", () => {
    renderStream({ isSearchMode: true, tickets: [sendReadyTicket], spamTickets: [spamTicket] })
    expect(container!.querySelector('[data-testid="inbox-section-spam"]')).toBeNull()
    expect(container!.querySelector('[data-testid="inbox-section-external"]')).toBeNull()
    expect(container!.querySelector('[data-testid="inbox-section-needs-review"]')).not.toBeNull()
  })
})
